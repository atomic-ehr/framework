import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import type { HandlerContext, HandlerResponse } from "@atomic-fhir/core";
import { SMARTScopes } from "@atomic-fhir/core";
import type { LoginSession, Client } from "./authorize.js";
import type { User } from "./login.js";

export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
}

export interface Token {
  resourceType: 'Token';
  id: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: 'Bearer';
  expiresAt: string;
  issuedAt: string;
  scope: string[];
  clientId: string;
  userId?: string;
  active: boolean;
  metadata?: Record<string, any>;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  patient?: string;
  encounter?: string;
  [key: string]: any; // For additional SMART context
}

const SUPPORTED_GRANT_TYPES = new Set(['authorization_code', 'refresh_token']);
const ACCESS_TOKEN_LIFETIME = 3600; // 1 hour
const REFRESH_TOKEN_LIFETIME = 86400 * 30; // 30 days

export async function tokenHandler(req: Request, context: HandlerContext): Promise<HandlerResponse> {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return createTokenErrorResponse('invalid_request', 'Only POST method allowed', 405);
    }

    const contentType = req.headers.get('content-type');
    let tokenRequest: TokenRequest;

    // Handle form-encoded requests (OAuth2 standard)
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      tokenRequest = formDataToTokenRequest(formData);
    } else if (contentType?.includes('application/json')) {
      tokenRequest = await req.json() as TokenRequest;
    } else {
      return createTokenErrorResponse('invalid_request', 'Content-Type must be application/x-www-form-urlencoded or application/json');
    }

    // Extract client credentials from Authorization header if present
    const authHeader = req.headers.get('authorization');
    const clientAuth = extractClientAuth(authHeader, tokenRequest);

    // Validate grant type
    if (!tokenRequest.grant_type || !SUPPORTED_GRANT_TYPES.has(tokenRequest.grant_type)) {
      return createTokenErrorResponse('unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token');
    }

    // Route to appropriate handler
    if (tokenRequest.grant_type === 'authorization_code') {
      return await handleAuthorizationCodeGrant(tokenRequest, clientAuth, context);
    } else if (tokenRequest.grant_type === 'refresh_token') {
      return await handleRefreshTokenGrant(tokenRequest, clientAuth, context);
    }

    return createTokenErrorResponse('unsupported_grant_type', 'Unsupported grant type');

  } catch (error) {
    console.error('[OAuth2 Token] Error:', error);
    return createTokenErrorResponse('server_error', 'Internal server error', 500);
  }
}

function formDataToTokenRequest(formData: FormData): TokenRequest {
  return {
    grant_type: formData.get('grant_type') as string || '',
    code: formData.get('code') as string || undefined,
    redirect_uri: formData.get('redirect_uri') as string || undefined,
    client_id: formData.get('client_id') as string || undefined,
    client_secret: formData.get('client_secret') as string || undefined,
    code_verifier: formData.get('code_verifier') as string || undefined,
    refresh_token: formData.get('refresh_token') as string || undefined,
    scope: formData.get('scope') as string || undefined
  };
}

function extractClientAuth(authHeader: string | null, tokenRequest: TokenRequest): { clientId?: string; clientSecret?: string } {
  if (authHeader?.startsWith('Basic ')) {
    try {
      const encoded = authHeader.substring(6);
      const decoded = atob(encoded);
      const [clientId, clientSecret] = decoded.split(':', 2);
      return { clientId, clientSecret };
    } catch {
      // Invalid basic auth header
    }
  }

  return {
    clientId: tokenRequest.client_id,
    clientSecret: tokenRequest.client_secret
  };
}

async function handleAuthorizationCodeGrant(
  tokenRequest: TokenRequest,
  clientAuth: { clientId?: string; clientSecret?: string },
  context: HandlerContext
): Promise<HandlerResponse> {
  // Validate required parameters
  if (!tokenRequest.code) {
    return createTokenErrorResponse('invalid_request', 'Authorization code is required');
  }

  if (!tokenRequest.redirect_uri) {
    return createTokenErrorResponse('invalid_request', 'Redirect URI is required');
  }

  if (!clientAuth.clientId) {
    return createTokenErrorResponse('invalid_request', 'Client ID is required');
  }

  // Look up authorization code in login session
  const session = await lookupSessionByCode(tokenRequest.code, context);
  if (!session) {
    return createTokenErrorResponse('invalid_grant', 'Invalid or expired authorization code');
  }

  // Verify client
  const client = await lookupClient(clientAuth.clientId, context);
  if (!client || client.clientId !== session.clientId) {
    return createTokenErrorResponse('invalid_client', 'Invalid client');
  }

  // Authenticate client
  const clientAuthResult = await authenticateClient(client, clientAuth.clientSecret);
  if (!clientAuthResult.authenticated) {
    return createTokenErrorResponse('invalid_client', clientAuthResult.error);
  }

  // Verify redirect URI matches
  if (tokenRequest.redirect_uri !== session.redirectUri) {
    return createTokenErrorResponse('invalid_grant', 'Redirect URI mismatch');
  }

  // Verify PKCE if present
  if (session.codeChallenge) {
    if (!tokenRequest.code_verifier) {
      return createTokenErrorResponse('invalid_request', 'Code verifier required for PKCE');
    }

    const isValidPKCE = await verifyPKCE(session.codeChallenge, session.codeChallengeMethod || 'S256', tokenRequest.code_verifier);
    if (!isValidPKCE) {
      return createTokenErrorResponse('invalid_grant', 'Invalid code verifier');
    }
  }

  // Get user if session is authenticated
  let user: User | null = null;
  if (session.userId) {
    user = await lookupUser(session.userId, context);
  }

  // Generate tokens
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_LIFETIME * 1000);

  // Determine effective scopes
  const requestedScopes = session.requestedScopes;
  const userScopes = user?.scopes || [];
  const effectiveScopes = intersectScopes(requestedScopes, userScopes, client.scope || []);

  // Create token record
  const token: Token = {
    resourceType: 'Token',
    id: randomUUID(),
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresAt: expiresAt.toISOString(),
    issuedAt: now.toISOString(),
    scope: effectiveScopes,
    clientId: client.clientId,
    userId: user?.id,
    active: true,
    metadata: {
      grantType: 'authorization_code',
      sessionId: session.sessionId
    }
  };

  // Save token
  await context.storage.create('Token', token);

  // Clean up session
  await context.storage.delete('LoginSession', session.id);

  // Build response
  const tokenResponse: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_LIFETIME,
    scope: effectiveScopes.join(' ')
  };

  if (refreshToken) {
    tokenResponse.refresh_token = refreshToken;
  }

  // Add SMART launch context if present
  if (session.launch) {
    // In a real implementation, this would resolve launch context
    // For now, just pass through the launch parameter
    const launchScopes = effectiveScopes.filter(scope => scope.startsWith('launch/'));
    if (launchScopes.some(scope => scope === 'launch/patient')) {
      tokenResponse.patient = session.launch; // Assuming launch contains patient ID
    }
  }

  // Audit token issuance
  await auditTokenEvent('token_issued', token.id, client.clientId, user?.id, context);

  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: tokenResponse
  };
}

async function handleRefreshTokenGrant(
  tokenRequest: TokenRequest,
  clientAuth: { clientId?: string; clientSecret?: string },
  context: HandlerContext
): Promise<HandlerResponse> {
  if (!tokenRequest.refresh_token) {
    return createTokenErrorResponse('invalid_request', 'Refresh token is required');
  }

  if (!clientAuth.clientId) {
    return createTokenErrorResponse('invalid_request', 'Client ID is required');
  }

  // Look up existing token by refresh token
  const existingToken = await lookupTokenByRefreshToken(tokenRequest.refresh_token, context);
  if (!existingToken || !existingToken.active) {
    return createTokenErrorResponse('invalid_grant', 'Invalid or expired refresh token');
  }

  // Verify client
  if (existingToken.clientId !== clientAuth.clientId) {
    return createTokenErrorResponse('invalid_client', 'Client mismatch');
  }

  const client = await lookupClient(clientAuth.clientId, context);
  if (!client) {
    return createTokenErrorResponse('invalid_client', 'Invalid client');
  }

  // Authenticate client
  const clientAuthResult = await authenticateClient(client, clientAuth.clientSecret);
  if (!clientAuthResult.authenticated) {
    return createTokenErrorResponse('invalid_client', clientAuthResult.error);
  }

  // Generate new tokens
  const newAccessToken = randomUUID();
  const newRefreshToken = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_LIFETIME * 1000);

  // Handle scope changes if requested
  let effectiveScopes = existingToken.scope;
  if (tokenRequest.scope) {
    const requestedScopes = tokenRequest.scope.split(' ');
    // New scopes must be a subset of original scopes
    effectiveScopes = requestedScopes.filter(scope => existingToken.scope.includes(scope));
  }

  // Create new token record
  const newToken: Token = {
    ...existingToken,
    id: randomUUID(),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt: expiresAt.toISOString(),
    issuedAt: now.toISOString(),
    scope: effectiveScopes,
    metadata: {
      ...existingToken.metadata,
      grantType: 'refresh_token',
      previousTokenId: existingToken.id
    }
  };

  // Save new token and deactivate old one
  await context.storage.create('Token', newToken);
  await context.storage.update('Token', existingToken.id, { ...existingToken, active: false });

  // Build response
  const tokenResponse: TokenResponse = {
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_LIFETIME,
    scope: effectiveScopes.join(' '),
    refresh_token: newRefreshToken
  };

  // Audit token refresh
  await auditTokenEvent('token_refreshed', newToken.id, client.clientId, existingToken.userId, context);

  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: tokenResponse
  };
}

async function lookupSessionByCode(code: string, context: HandlerContext): Promise<LoginSession | null> {
  try {
    // Search for all LoginSession resources and filter manually (same pattern as client lookup)
    const searchResult = await context.storage.search('LoginSession', {});

    // Handle both Bundle format and direct array format
    const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];

    if (resources.length > 0) {
      // Find the session with matching authorization code
      for (const resource of resources) {
        if (resource.authorizationCode === code) {
          const session = resource as LoginSession;
          
          // Check expiration
          if (new Date(session.expiresAt) < new Date()) {
            await context.storage.delete('LoginSession', session.id);
            return null;
          }
          
          return session;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('[OAuth2 Token] Error looking up session:', error);
    return null;
  }
}

async function lookupClient(clientId: string, context: HandlerContext): Promise<Client | null> {
  try {
    // Search for all Basic resources and filter manually (same as authorize.ts)
    const searchResult = await context.storage.search('Basic', {});
    
    // Handle both Bundle format and direct array format
    const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];
    
    if (resources.length > 0) {
      // Find the client resource with matching client-id
      for (const resource of resources) {
        if (resource.code?.coding?.[0]?.code === 'client') {
          // Get the client-id from extensions
          const resourceClientId = resource.extension?.find((ext: any) =>
            ext.url === 'http://atomic-fhir.org/ig/auth/StructureDefinition/client-id'
          )?.valueString;
          
          if (resourceClientId === clientId) {
            return transformBasicToClient(resource);
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('[OAuth2 Token] Error looking up client:', error);
    return null;
  }
}

// Helper function to transform Basic resource to Client interface (same as authorize.ts)
function transformBasicToClient(basicResource: any): Client {
  const getExtensionValue = (url: string) => {
    const extension = basicResource.extension?.find((ext: any) => 
      ext.url === `http://atomic-fhir.org/ig/auth/StructureDefinition/${url}`
    );
    return extension?.valueString || extension?.valueBoolean;
  };

  const getExtensionValues = (url: string) => {
    const extensions = basicResource.extension?.filter((ext: any) => 
      ext.url === `http://atomic-fhir.org/ig/auth/StructureDefinition/${url}`
    );
    return extensions?.map((ext: any) => ext.valueString || ext.valueBoolean) || [];
  };

  return {
    resourceType: 'Client',
    id: basicResource.id,
    clientId: getExtensionValue('client-id'),
    clientType: getExtensionValue('client-type') as 'public' | 'confidential',
    name: basicResource.subject?.display,
    redirectUris: getExtensionValues('redirect-uri'),
    grantTypes: getExtensionValues('grant-type'),
    responseTypes: getExtensionValues('response-type'),
    scope: getExtensionValues('client-scope'),
    clientSecret: getExtensionValue('client-secret'),
    active: getExtensionValue('active-status') !== false
  };
}

async function lookupUser(userId: string, context: HandlerContext): Promise<User | null> {
  try {
    return await context.storage.read('User', userId) as User;
  } catch (error) {
    console.error('[OAuth2 Token] Error looking up user:', error);
    return null;
  }
}

async function lookupTokenByRefreshToken(refreshToken: string, context: HandlerContext): Promise<Token | null> {
  try {
    const searchResult = await context.storage.search('Token', {
      'refresh-token': refreshToken
    });

    // Handle both Bundle format and direct array format
    const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];

    if (resources.length > 0) {
      return resources[0] as Token;
    }
    
    return null;
  } catch (error) {
    console.error('[OAuth2 Token] Error looking up token:', error);
    return null;
  }
}

async function authenticateClient(client: Client, providedSecret?: string): Promise<{ authenticated: boolean; error?: string }> {
  if (client.clientType === 'public') {
    // Public clients don't require authentication
    return { authenticated: true };
  }

  if (!client.clientSecret) {
    return { authenticated: false, error: 'Client secret required for confidential client' };
  }

  if (!providedSecret) {
    return { authenticated: false, error: 'Client secret required' };
  }

  try {
    const isValidSecret = await bcrypt.compare(providedSecret, client.clientSecret);
    return { authenticated: isValidSecret, error: isValidSecret ? undefined : 'Invalid client secret' };
  } catch (error) {
    console.error('[OAuth2 Token] Error authenticating client:', error);
    return { authenticated: false, error: 'Authentication error' };
  }
}

async function verifyPKCE(codeChallenge: string, method: string, codeVerifier: string): Promise<boolean> {
  try {
    if (method === 'plain') {
      return codeChallenge === codeVerifier;
    } else if (method === 'S256') {
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);
      const computedChallenge = btoa(String.fromCharCode(...hashArray))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      return codeChallenge === computedChallenge;
    }
    
    return false;
  } catch (error) {
    console.error('[OAuth2 Token] PKCE verification error:', error);
    return false;
  }
}

function intersectScopes(requestedScopes: string[], userScopes: string[], clientScopes: string[]): string[] {
  // Start with requested scopes
  let effectiveScopes = requestedScopes;

  // If client has scope restrictions, intersect with client scopes
  if (clientScopes.length > 0) {
    effectiveScopes = effectiveScopes.filter(scope => clientScopes.includes(scope));
  }

  // If user has scope restrictions, intersect with user scopes
  if (userScopes.length > 0) {
    effectiveScopes = effectiveScopes.filter(scope => {
      // Use SMART scopes matching logic for more sophisticated comparison
      return userScopes.some(userScope => SMARTScopes.hasScope({ security: { scopes: [userScope] } } as any, scope));
    });
  }

  return effectiveScopes;
}

async function auditTokenEvent(
  eventType: string,
  tokenId: string,
  clientId: string,
  userId?: string,
  context?: HandlerContext
): Promise<void> {
  try {
    const auditEvent = {
      resourceType: 'AuditEvent',
      id: `token-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      tokenId,
      clientId,
      userId,
      metadata: {
        endpoint: '/auth/token'
      }
    };

    console.log('[Token Audit]', auditEvent);
  } catch (error) {
    console.error('[Token Audit] Failed to log event:', error);
  }
}

function createTokenErrorResponse(error: string, errorDescription?: string, statusCode: number = 400): HandlerResponse {
  return {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: {
      error,
      error_description: errorDescription
    }
  };
}