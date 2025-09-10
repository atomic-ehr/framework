import bcrypt from "bcrypt";
import type { HandlerContext, HandlerResponse } from "@atomic-fhir/core";
import type { LoginSession } from "./authorize.js";

export interface LoginParams {
  username: string;
  password: string;
  session_id: string;
  csrf_token?: string;
}

export interface User {
  resourceType: 'User';
  id: string;
  username: string;
  passwordHash: string;
  email?: string;
  active: boolean;
  roles: string[];
  scopes: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export async function loginHandler(req: Request, context: HandlerContext): Promise<HandlerResponse> {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return {
        status: 405,
        headers: { 'Allow': 'POST' },
        body: { error: 'method_not_allowed', error_description: 'Only POST method allowed' }
      };
    }

    const contentType = req.headers.get('content-type');
    let params: LoginParams;

    // Handle both form and JSON submissions
    if (contentType?.includes('application/json')) {
      params = await req.json() as LoginParams;
    } else if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      params = {
        username: formData.get('username') as string || '',
        password: formData.get('password') as string || '',
        session_id: formData.get('session_id') as string || '',
        csrf_token: formData.get('csrf_token') as string || undefined
      };
    } else {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'invalid_request', error_description: 'Unsupported content type' }
      };
    }

    // Validate required parameters
    const validation = validateLoginParams(params);
    if (!validation.valid) {
      return createLoginErrorResponse(validation.error!, validation.errorDescription);
    }

    // Look up login session
    const session = await lookupLoginSession(params.session_id, context);
    if (!session) {
      return createLoginErrorResponse('invalid_session', 'Invalid or expired session');
    }

    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      await context.storage.delete('LoginSession', session.id);
      return createLoginErrorResponse('session_expired', 'Session has expired');
    }

    // Rate limiting check (simple in-memory approach)
    const rateLimitResult = await checkRateLimit(params.username, req);
    if (!rateLimitResult.allowed) {
      return createLoginErrorResponse('too_many_requests', 'Too many login attempts. Please try again later', 429);
    }

    // Authenticate user
    const user = await authenticateUser(params.username, params.password, context);
    if (!user) {
      await recordFailedAttempt(params.username);
      return createLoginErrorResponse('invalid_credentials', 'Invalid username or password', 401);
    }

    if (!user.active) {
      return createLoginErrorResponse('account_disabled', 'User account is disabled', 401);
    }

    // Update session with authenticated user
    const updatedSession: LoginSession = {
      ...session,
      userId: user.id,
      isAuthenticated: true
    };

    await context.storage.update('LoginSession', session.id, updatedSession);

    // Clear failed attempts counter
    await clearFailedAttempts(params.username);

    // Audit successful login
    await auditAuthEvent('login_success', user.id, params.username, req, context);

    // Return success response
    const isJsonRequest = contentType?.includes('application/json');
    
    if (isJsonRequest) {
      // JSON API response
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: true,
          message: 'Login successful',
          next_action: 'authorize',
          session_id: params.session_id
        }
      };
    } else {
      // Form submission - redirect to continue authorization
      const authorizeUrl = `/auth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: session.clientId,
        redirect_uri: session.redirectUri,
        scope: session.requestedScopes.join(' '),
        ...(session.state && { state: session.state }),
        ...(session.codeChallenge && { code_challenge: session.codeChallenge }),
        ...(session.codeChallengeMethod && { code_challenge_method: session.codeChallengeMethod })
      })}`;

      return {
        status: 302,
        headers: {
          'Location': authorizeUrl,
          'Set-Cookie': `auth_session=${params.session_id}; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`
        }
      };
    }

  } catch (error) {
    console.error('[OAuth2 Login] Error:', error);
    await auditAuthEvent('login_error', undefined, undefined, req, context, error.message);
    
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'server_error', error_description: 'Internal server error' }
    };
  }
}

function validateLoginParams(params: LoginParams): { valid: boolean; error?: string; errorDescription?: string } {
  if (!params.username?.trim()) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Username is required' };
  }

  if (!params.password) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Password is required' };
  }

  if (!params.session_id?.trim()) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Session ID is required' };
  }

  // Basic input validation
  if (params.username.length > 255) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Username too long' };
  }

  if (params.password.length > 1000) {
    return { valid: false, error: 'invalid_request', errorDescription: 'Password too long' };
  }

  return { valid: true };
}

async function lookupLoginSession(sessionId: string, context: HandlerContext): Promise<LoginSession | null> {
  try {
    console.log('[OAuth2 Login] Looking up session:', sessionId);
    // Search for all LoginSession resources and filter manually (same pattern as client/user lookup)
    const searchResult = await context.storage.search('LoginSession', {});

    // Handle both Bundle format and direct array format
    const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];

    console.log('[OAuth2 Login] Found', resources.length, 'LoginSession resources');
    if (resources.length > 0) {
      // Find the session with matching sessionId
      for (const resource of resources) {
        console.log('[OAuth2 Login] Checking session:', resource.sessionId, 'vs', sessionId);
        if (resource.sessionId === sessionId) {
          console.log('[OAuth2 Login] Found matching session, expires at:', resource.expiresAt);
          return resource as LoginSession;
        }
      }
    }
    
    console.log('[OAuth2 Login] No matching session found');
    return null;
  } catch (error) {
    console.error('[OAuth2 Login] Error looking up session:', error);
    return null;
  }
}

async function authenticateUser(username: string, password: string, context: HandlerContext): Promise<User | null> {
  try {
    // Search for all Basic resources and filter manually (same pattern as client lookup)
    const searchResult = await context.storage.search('Basic', {});
    
    // Handle both Bundle format and direct array format
    const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];
    
    if (resources.length > 0) {
      // Find the user resource with matching username
      for (const resource of resources) {
        if (resource.code?.coding?.[0]?.code === 'user') {
          // Get the username from extensions
          const resourceUsername = resource.extension?.find((ext: any) =>
            ext.url === 'http://atomic-fhir.org/ig/auth/StructureDefinition/username'
          )?.valueString;
          
          if (resourceUsername === username) {
            const user = transformBasicToUser(resource);
            
            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.passwordHash);
            if (isValidPassword) {
              return user;
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('[OAuth2 Login] Error authenticating user:', error);
    return null;
  }
}

// Helper function to transform Basic resource to User interface
function transformBasicToUser(basicResource: any): User {
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
    resourceType: 'User',
    id: basicResource.id,
    username: getExtensionValue('username'),
    passwordHash: getExtensionValue('password-hash'),
    email: getExtensionValue('email'),
    active: getExtensionValue('active-status') !== false,
    roles: getExtensionValues('user-role'),
    scopes: getExtensionValues('smart-scope'),
    metadata: {},
    createdAt: basicResource.meta?.lastUpdated || new Date().toISOString(),
    updatedAt: basicResource.meta?.lastUpdated || new Date().toISOString()
  };
}

// Simple in-memory rate limiting (in production, use Redis or similar)
const rateLimitStore = new Map<string, { attempts: number; lastAttempt: number; blockUntil?: number }>();

async function checkRateLimit(username: string, req: Request): Promise<{ allowed: boolean; reason?: string }> {
  const key = `${username}:${getClientIP(req)}`;
  const now = Date.now();
  const maxAttempts = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const blockDurationMs = 30 * 60 * 1000; // 30 minutes

  const record = rateLimitStore.get(key) || { attempts: 0, lastAttempt: 0 };

  // If blocked, check if block period has expired
  if (record.blockUntil && now < record.blockUntil) {
    return { allowed: false, reason: 'Account temporarily locked due to too many failed attempts' };
  }

  // Reset attempts if outside window
  if (now - record.lastAttempt > windowMs) {
    record.attempts = 0;
    record.blockUntil = undefined;
  }

  // Check if within limits
  if (record.attempts >= maxAttempts) {
    record.blockUntil = now + blockDurationMs;
    rateLimitStore.set(key, record);
    return { allowed: false, reason: 'Too many login attempts. Account temporarily locked' };
  }

  return { allowed: true };
}

async function recordFailedAttempt(username: string): Promise<void> {
  // This would be called from the main handler on authentication failure
  const key = username; // Simplified for this example
  const now = Date.now();
  const record = rateLimitStore.get(key) || { attempts: 0, lastAttempt: 0 };
  
  record.attempts++;
  record.lastAttempt = now;
  rateLimitStore.set(key, record);
}

async function clearFailedAttempts(username: string): Promise<void> {
  const key = username; // Simplified for this example  
  rateLimitStore.delete(key);
}

function getClientIP(req: Request): string {
  // Extract client IP from various headers
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  
  return 'unknown';
}

async function auditAuthEvent(
  eventType: string, 
  userId?: string, 
  username?: string, 
  req?: Request, 
  context?: HandlerContext, 
  error?: string
): Promise<void> {
  try {
    // Create audit log entry - this would integrate with the existing audit system
    const auditEvent = {
      resourceType: 'AuditEvent',
      id: `auth-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      userId,
      username,
      sourceIP: req ? getClientIP(req) : undefined,
      userAgent: req?.headers.get('user-agent'),
      success: !error,
      error,
      metadata: {
        endpoint: '/auth/login',
        method: req?.method
      }
    };

    // In a real implementation, this would use the audit system from the auth package
    console.log('[Auth Audit]', auditEvent);
  } catch (auditError) {
    console.error('[Auth Audit] Failed to log event:', auditError);
  }
}

function createLoginErrorResponse(error: string, errorDescription?: string, statusCode: number = 400): HandlerResponse {
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