import { randomUUID } from "crypto";
import type { HandlerContext, HandlerResponse } from "@atomic-fhir/core";
import type { AuthenticatedUser } from "../types/index.js";

export interface AuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  aud?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  launch?: string;
}

export interface LoginSession {
  resourceType: 'LoginSession';
  id: string;
  sessionId: string;
  clientId: string;
  redirectUri: string;
  requestedScopes: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  launch?: string;
  userId?: string;
  isAuthenticated: boolean;
  authorizationCode?: string;
  expiresAt: string;
  createdAt: string;
}

export interface Client {
  resourceType: 'Client';
  id: string;
  clientId: string;
  clientType: 'public' | 'confidential';
  name?: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope?: string[];
  clientSecret?: string;
  active: boolean;
  metadata?: Record<string, any>;
}

const SUPPORTED_RESPONSE_TYPES = new Set(['code']);
const SUPPORTED_CODE_CHALLENGE_METHODS = new Set(['S256', 'plain']);
const SESSION_EXPIRY_MINUTES = 30;

// Helper function to transform Basic resource to Client interface
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

export async function authorizeHandler(req: Request, context: HandlerContext): Promise<HandlerResponse> {
  try {
    const url = new URL(req.url);
    const params = extractAuthorizeParams(url.searchParams);
    
    // Validate required parameters
    const validation = validateAuthorizeParams(params);
    if (!validation.valid) {
      return createErrorResponse(validation.error!, validation.errorDescription);
    }

    // Look up client
    const client = await lookupClient(params.client_id, context);
    if (!client) {
      return createErrorResponse('invalid_client', 'Client not found');
    }

    if (!client.active) {
      return createErrorResponse('invalid_client', 'Client is disabled');
    }

    // Validate redirect URI
    if (!client.redirectUris.includes(params.redirect_uri)) {
      return createErrorResponse('invalid_request', 'Invalid redirect URI');
    }

    // Validate response type
    if (!client.responseTypes.includes(params.response_type)) {
      return createErrorResponse('unsupported_response_type', 'Unsupported response type for this client');
    }

    // Check for existing authenticated session
    const sessionCookie = req.headers.get('Cookie');
    const existingSession = sessionCookie ? await getSessionFromCookie(sessionCookie, context) : null;
    
    if (existingSession?.isAuthenticated) {
      // User is already authenticated, proceed with authorization
      return await completeAuthorization(existingSession, params, context);
    }

    // Create new login session
    const sessionId = randomUUID();
    const loginSession: LoginSession = {
      resourceType: 'LoginSession',
      id: randomUUID(),
      sessionId,
      clientId: params.client_id,
      redirectUri: params.redirect_uri,
      requestedScopes: params.scope ? params.scope.split(' ') : [],
      state: params.state,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: params.code_challenge_method,
      launch: params.launch,
      isAuthenticated: false,
      expiresAt: new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    // Save login session
    console.log('[OAuth2 Authorize] Creating LoginSession:', {
      sessionId: loginSession.sessionId,
      clientId: loginSession.clientId,
      expiresAt: loginSession.expiresAt
    });
    await context.storage.create('LoginSession', loginSession);
    console.log('[OAuth2 Authorize] LoginSession created successfully');

    // Render login page
    const loginPageUrl = `/auth/static/login.html?session_id=${sessionId}&client_name=${encodeURIComponent(client.name || client.clientId)}`;
    
    return {
      status: 302,
      headers: {
        'Location': loginPageUrl,
        'Set-Cookie': `auth_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_EXPIRY_MINUTES * 60}`
      }
    };
  } catch (error) {
    console.error('[OAuth2 Authorize] Error:', error);
    return createErrorResponse('server_error', 'Internal server error');
  }
}

function extractAuthorizeParams(searchParams: URLSearchParams): AuthorizeParams {
  return {
    response_type: searchParams.get('response_type') || '',
    client_id: searchParams.get('client_id') || '',
    redirect_uri: searchParams.get('redirect_uri') || '',
    scope: searchParams.get('scope') || undefined,
    state: searchParams.get('state') || undefined,
    aud: searchParams.get('aud') || undefined,
    code_challenge: searchParams.get('code_challenge') || undefined,
    code_challenge_method: searchParams.get('code_challenge_method') || undefined,
    launch: searchParams.get('launch') || undefined
  };
}

function validateAuthorizeParams(params: AuthorizeParams): { valid: boolean; error?: string; errorDescription?: string } {
  if (!params.response_type) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Missing response_type parameter' };
  }

  if (!SUPPORTED_RESPONSE_TYPES.has(params.response_type)) {
    return { valid: false, error: 'unsupported_response_type', errorDescription: 'Only "code" response type is supported' };
  }

  if (!params.client_id) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Missing client_id parameter' };
  }

  if (!params.redirect_uri) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Missing redirect_uri parameter' };
  }

  // Validate redirect URI format
  try {
    const uri = new URL(params.redirect_uri);
    // Must be HTTPS in production
    if (uri.protocol !== 'https:' && uri.hostname !== 'localhost') {
      return { valid: false, error: 'invalid_request', errorDescription: 'redirect_uri must use HTTPS' };
    }
  } catch {
    return { valid: false, error: 'invalid_request', errorDescription: 'Invalid redirect_uri format' };
  }

  // Validate PKCE parameters if present
  if (params.code_challenge) {
    if (!params.code_challenge_method) {
      return { valid: false, error: 'invalid_request', errorDescription: 'code_challenge_method required when code_challenge is present' };
    }
    
    if (!SUPPORTED_CODE_CHALLENGE_METHODS.has(params.code_challenge_method)) {
      return { valid: false, error: 'invalid_request', errorDescription: 'Unsupported code_challenge_method' };
    }
  }

  return { valid: true };
}

async function lookupClient(clientId: string, context: HandlerContext): Promise<Client | null> {
  try {
    console.log('[OAuth2 Authorize] Looking up client:', clientId);
    
    // Search for all Basic resources (no filters) and then filter in memory
    // This completely bypasses search parameters
    console.log('[OAuth2 Authorize] About to call storage.search with:', {
      storageType: context.storage?.constructor?.name,
      searchMethodExists: typeof context.storage?.search === 'function'
    });
    
    const searchResult = await context.storage.search('Basic', {});
    
    console.log('[OAuth2 Authorize] Search result:', { 
      searchResult,
      resultType: typeof searchResult,
      isArray: Array.isArray(searchResult),
      length: searchResult?.length 
    });
    
    // Handle both Bundle format and direct array format
    const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];
    
    if (resources.length > 0) {
      // Find the client resource with matching client-id
      for (const resource of resources) {
        console.log('[OAuth2 Authorize] Checking resource:', { 
          id: resource.id, 
          code: resource.code?.coding?.[0]?.code 
        });
        
        if (resource.code?.coding?.[0]?.code === 'client') {
          // Get the client-id from extensions
          const resourceClientId = resource.extension?.find((ext: any) =>
            ext.url === 'http://atomic-fhir.org/ig/auth/StructureDefinition/client-id'
          )?.valueString;
          
          console.log('[OAuth2 Authorize] Resource client-id:', resourceClientId);
          
          if (resourceClientId === clientId) {
            console.log('[OAuth2 Authorize] Found matching client, transforming...');
            const client = transformBasicToClient(resource);
            console.log('[OAuth2 Authorize] Transformed client:', { 
              clientId: client.clientId, 
              active: client.active 
            });
            return client;
          }
        }
      }
    }
    
    console.log('[OAuth2 Authorize] No matching client found');
    return null;
  } catch (error) {
    console.error('[OAuth2 Authorize] Error looking up client:', error);
    return null;
  }
}

async function getSessionFromCookie(cookieHeader: string, context: HandlerContext): Promise<LoginSession | null> {
  const sessionMatch = cookieHeader.match(/auth_session=([^;]+)/);
  if (!sessionMatch) return null;

  const sessionId = sessionMatch[1];
  
  try {
    // Search for all LoginSession resources and filter manually (same pattern as client lookup)
    const searchResult = await context.storage.search('LoginSession', {});

    // Handle both Bundle format and direct array format
    const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];

    if (resources.length > 0) {
      // Find the session with matching sessionId
      for (const resource of resources) {
        if (resource.sessionId === sessionId) {
          const session = resource as LoginSession;
          
          // Check if session is expired
          if (new Date(session.expiresAt) < new Date()) {
            // Clean up expired session
            await context.storage.delete('LoginSession', session.id);
            return null;
          }
          
          return session;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('[OAuth2 Authorize] Error retrieving session:', error);
    return null;
  }
}

async function completeAuthorization(session: LoginSession, params: AuthorizeParams, context: HandlerContext): Promise<HandlerResponse> {
  // Generate authorization code
  const authorizationCode = randomUUID();
  
  // Update session with authorization code
  const updatedSession: LoginSession = {
    ...session,
    authorizationCode,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes for code exchange
  };
  
  await context.storage.update('LoginSession', session.id, updatedSession);

  // Build redirect URL with authorization code
  const redirectUrl = new URL(params.redirect_uri);
  redirectUrl.searchParams.set('code', authorizationCode);
  
  if (params.state) {
    redirectUrl.searchParams.set('state', params.state);
  }

  return {
    status: 302,
    headers: {
      'Location': redirectUrl.toString(),
      'Set-Cookie': 'auth_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0' // Clear session cookie
    }
  };
}

function createErrorResponse(error: string, errorDescription?: string, statusCode: number = 400): HandlerResponse {
  const errorData: any = { error };
  if (errorDescription) {
    errorData.error_description = errorDescription;
  }

  return {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: errorData
  };
}

export function createAuthorizeRedirectError(redirectUri: string, error: string, errorDescription?: string, state?: string): HandlerResponse {
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('error', error);
  
  if (errorDescription) {
    redirectUrl.searchParams.set('error_description', errorDescription);
  }
  
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  return {
    status: 302,
    headers: {
      'Location': redirectUrl.toString()
    }
  };
}