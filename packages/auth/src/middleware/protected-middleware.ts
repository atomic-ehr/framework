import type { MiddlewareDefinition, HandlerContext, HandlerResponse } from "@atomic-fhir/core";
import { SMARTScopes } from "@atomic-fhir/core";

export interface ProtectedMiddlewareOptions {
  loginUrl?: string;
  authorizeUrl?: string;
  requireScopes?: string[];
  redirectParam?: string;
  clientId?: string;
  defaultScopes?: string[];
}

export function createProtectedMiddleware(options: ProtectedMiddlewareOptions = {}): MiddlewareDefinition {
  const {
    loginUrl = '/auth/login',
    authorizeUrl = '/auth/authorize',
    requireScopes = [],
    redirectParam = 'redirect_uri',
    clientId = 'demo-public-client',
    defaultScopes = ['user/*.*', 'patient/*.*']
  } = options;

  return {
    name: "protected-route",
    async before(req: Request, context: HandlerContext): Promise<HandlerResponse | undefined> {
      const url = new URL(req.url);
      
      // Skip protection for auth endpoints to avoid redirect loops
      if (url.pathname.startsWith('/auth/')) {
        return undefined;
      }

      // Check if user has valid security context (from OAuth2 middleware)
      const securityContext = SMARTScopes.getSecurityContext(req);
      
      console.log(`[PROTECTED] ${url.pathname} - Security context:`, securityContext ? 'Found' : 'Not found');
      
      if (!securityContext) {
        // User is not authenticated - redirect to OAuth2 authorize endpoint
        const baseUrl = new URL(req.url).origin;
        const currentUrl = req.url;
        
        // Create OAuth2 authorization URL with proper parameters
        const authParams = new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: currentUrl, // Redirect back to the protected resource after auth
          scope: defaultScopes.join(' '),
          state: Math.random().toString(36).substring(2), // Simple state for CSRF protection
        });
        
        const authUrl = `${authorizeUrl}?${authParams.toString()}`;
        
        // Check if this is an API request (JSON) vs browser request
        const acceptHeader = req.headers.get('accept') || '';
        const contentType = req.headers.get('content-type') || '';
        
        console.log(`[PROTECTED] Redirecting unauthenticated request to OAuth2 authorize: ${authUrl}`);
        console.log(`[PROTECTED] Accept header: ${acceptHeader}, Content-Type: ${contentType}`);
        
        if (acceptHeader.includes('application/json') || contentType.includes('application/json')) {
          // API request - return JSON error with OAuth2 authorization URL
          const response = {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': 'Bearer'
            },
            body: JSON.stringify({
              error: 'unauthorized',
              error_description: 'Authentication required',
              authorization_url: authUrl,
              client_id: clientId,
              suggested_scopes: defaultScopes
            })
          };
          console.log(`[PROTECTED] Returning JSON error response:`, response);
          return response;
        } else {
          // Browser request - redirect to OAuth2 authorize
          const response = {
            status: 302,
            headers: {
              'Location': authUrl,
              'Cache-Control': 'no-cache'
            },
            body: ''
          };
          console.log(`[PROTECTED] Returning OAuth2 redirect response:`, response);
          return response;
        }
      }

      // Check required scopes if specified
      if (requireScopes.length > 0) {
        const hasRequiredScopes = requireScopes.some(requiredScope => {
          return securityContext.scopes.some(userScope => {
            // Simple scope matching - in production this would be more sophisticated
            if (userScope === requiredScope) return true;
            
            // Handle wildcard scopes like "user/*.*" or "patient/*.*"
            if (userScope.includes('*')) {
              const pattern = userScope.replace(/\*/g, '.*');
              const regex = new RegExp(`^${pattern}$`);
              return regex.test(requiredScope);
            }
            
            return false;
          });
        });

        if (!hasRequiredScopes) {
          // User lacks required scopes
          const acceptHeader = req.headers.get('accept') || '';
          
          if (acceptHeader.includes('application/json')) {
            return {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
              body: {
                error: 'insufficient_scope',
                error_description: `Required scopes: ${requireScopes.join(', ')}`,
                required_scopes: requireScopes,
                user_scopes: securityContext.scopes
              }
            };
          } else {
            return {
              status: 403,
              headers: { 'Content-Type': 'text/html' },
              body: `
                <html>
                  <head><title>Access Denied</title></head>
                  <body>
                    <h1>Access Denied</h1>
                    <p>You don't have sufficient permissions to access this resource.</p>
                    <p>Required scopes: ${requireScopes.join(', ')}</p>
                    <p>Your scopes: ${securityContext.scopes.join(', ')}</p>
                    <a href="${loginUrl}">Login with different account</a>
                  </body>
                </html>
              `
            };
          }
        }
      }

      // User is authenticated and has required scopes - continue
      return undefined;
    }
  };
}

export function createScopeProtectedMiddleware(requiredScopes: string[]): MiddlewareDefinition {
  return createProtectedMiddleware({ requireScopes: requiredScopes });
}