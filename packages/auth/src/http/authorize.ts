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
    await context.storage.create('LoginSession', loginSession);

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
    // Search for client by clientId (business key)
    const bundle = await context.storage.search('Client', { 
      'client-id': clientId 
    });
    
    if (bundle?.entry?.length > 0) {
      return bundle.entry[0].resource as Client;
    }
    
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
    const bundle = await context.storage.search('LoginSession', {
      'session-id': sessionId
    });

    if (bundle?.entry?.length > 0) {
      const session = bundle.entry[0].resource as LoginSession;
      
      // Check if session is expired
      if (new Date(session.expiresAt) < new Date()) {
        // Clean up expired session
        await context.storage.delete('LoginSession', session.id);
        return null;
      }
      
      return session;
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