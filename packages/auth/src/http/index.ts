import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { HandlerContext, HandlerResponse } from "@atomic-fhir/core";
import { authorizeHandler } from "./authorize.js";
import { loginHandler } from "./login.js";
import { tokenHandler } from "./token.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AuthRouterConfig {
  basePath?: string; // Default: '/auth'
  enableStaticAssets?: boolean; // Default: true
  staticPath?: string; // Default: '/auth/static'
}

export function createAuthRouter(config: AuthRouterConfig = {}): Record<string, Function> {
  const basePath = config.basePath || '/auth';
  const enableStaticAssets = config.enableStaticAssets !== false;
  const staticPath = config.staticPath || '/auth/static';

  const routes: Record<string, Function> = {};

  // OAuth2/SMART endpoints
  routes[`GET ${basePath}/authorize`] = authorizeHandler;
  routes[`POST ${basePath}/login`] = loginHandler;
  routes[`POST ${basePath}/token`] = tokenHandler;

  // Well-known endpoints
  routes[`GET ${basePath}/.well-known/smart-configuration`] = createSMARTConfigurationHandler(basePath);
  routes[`GET /.well-known/smart-configuration`] = createSMARTConfigurationHandler(basePath);

  // Static asset handling
  if (enableStaticAssets) {
    routes[`GET ${staticPath}/*`] = createStaticAssetHandler();
  }

  return routes;
}

function createSMARTConfigurationHandler(basePath: string) {
  return async (req: Request, context: HandlerContext): Promise<HandlerResponse> => {
    try {
      const url = new URL(req.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const smartConfiguration = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}${basePath}/authorize`,
        token_endpoint: `${baseUrl}${basePath}/token`,
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
          "none"
        ],
        registration_endpoint: `${baseUrl}${basePath}/register`,
        introspection_endpoint: `${baseUrl}${basePath}/introspect`,
        revocation_endpoint: `${baseUrl}${basePath}/revoke`,
        capabilities: [
          "launch-ehr",
          "launch-standalone",
          "client-public",
          "client-confidential-symmetric",
          "context-ehr-patient",
          "context-ehr-encounter",
          "context-standalone-patient",
          "permission-offline",
          "permission-online",
          "permission-patient",
          "permission-user"
        ],
        response_types_supported: [
          "code"
        ],
        grant_types_supported: [
          "authorization_code",
          "refresh_token"
        ],
        code_challenge_methods_supported: [
          "S256",
          "plain"
        ],
        scopes_supported: [
          "openid",
          "fhirUser",
          "offline_access",
          "online_access",
          "patient/*.read",
          "patient/*.write",
          "patient/*.*",
          "user/*.read", 
          "user/*.write",
          "user/*.*",
          "system/*.read",
          "system/*.write", 
          "system/*.*",
          "launch",
          "launch/patient",
          "launch/encounter"
        ]
      };

      return {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600'
        },
        body: smartConfiguration
      };
    } catch (error) {
      console.error('[Auth Router] Error generating SMART configuration:', error);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'server_error', error_description: 'Failed to generate SMART configuration' }
      };
    }
  };
}

function createStaticAssetHandler() {
  return async (req: Request, context: HandlerContext): Promise<HandlerResponse> => {
    try {
      const url = new URL(req.url);
      const pathname = url.pathname;
      
      // Extract file path from URL (remove /auth/static prefix)
      const filePath = pathname.replace(/^\/auth\/static\//, '');
      
      // Security: prevent path traversal
      if (filePath.includes('..') || filePath.includes('//') || !filePath) {
        return {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
          body: 'Invalid file path'
        };
      }

      // Serve static files
      const staticDir = join(dirname(__dirname), 'static');
      const fullPath = join(staticDir, filePath);

      try {
        const file = Bun.file(fullPath);
        const exists = await file.exists();
        
        if (!exists) {
          return {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
            body: 'File not found'
          };
        }

        // Get content type based on file extension
        const contentType = getContentType(filePath);
        
        const content = await file.arrayBuffer();

        return {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            'Content-Length': content.byteLength.toString()
          },
          body: content
        };
      } catch (fileError) {
        console.error('[Auth Router] File access error:', fileError);
        return {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
          body: 'Internal server error'
        };
      }
    } catch (error) {
      console.error('[Auth Router] Static asset handler error:', error);
      return {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Internal server error'
      };
    }
  };
}

function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  const contentTypes: Record<string, string> = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject'
  };

  return contentTypes[ext || ''] || 'application/octet-stream';
}

// Export individual handlers for custom routing
export { authorizeHandler, loginHandler, tokenHandler };

// Helper function to register all auth routes with a router
export function registerAuthRoutes(router: any, config: AuthRouterConfig = {}): void {
  const routes = createAuthRouter(config);
  
  for (const [route, handler] of Object.entries(routes)) {
    const [method, path] = route.split(' ', 2);
    
    // Register route with the provided router
    if (typeof router.add === 'function') {
      router.add(method, path, handler);
    } else if (typeof router.register === 'function') {
      router.register(method, path, handler);
    } else if (typeof router[method.toLowerCase()] === 'function') {
      router[method.toLowerCase()](path, handler);
    } else {
      console.warn(`[Auth Router] Unable to register route ${route} - unknown router interface`);
    }
  }
}

// Middleware to populate security context from tokens
export function createAuthSecurityMiddleware() {
  return async (req: Request, context: HandlerContext): Promise<Request | void> => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return req; // No token, continue without security context
      }

      const accessToken = authHeader.substring(7);
      
      // Look up token in storage
      const bundle = await context.storage.search('Basic', {
        code: 'token',
        'access-token': accessToken
      });

      if (!bundle?.entry?.length) {
        return req; // Token not found, continue without security context
      }

      const tokenResource = bundle.entry[0].resource;
      
      // Check token expiration
      const expiresAt = getExtensionValue(tokenResource, 'expires-at');
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return req; // Token expired, continue without security context
      }

      // Check if token is active
      const active = getExtensionValue(tokenResource, 'active-status');
      if (active !== true) {
        return req; // Token inactive, continue without security context
      }

      // Extract scopes
      const scopes = tokenResource.extension
        ?.filter((ext: any) => ext.url.endsWith('token-scope'))
        ?.map((ext: any) => ext.valueString)
        ?.filter(Boolean) || [];

      // Get associated client and user info
      const clientId = getExtensionValue(tokenResource, 'associated-client-id');
      const userId = getExtensionValue(tokenResource, 'associated-user-id');

      // Build security context
      const securityContext = {
        scopes,
        client: clientId ? { id: clientId, type: 'unknown' as const } : undefined,
        user: userId ? { id: userId } : undefined,
        token: {
          type: 'bearer' as const,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          issuedAt: new Date(getExtensionValue(tokenResource, 'issued-at'))
        }
      };

      // Add security context to request
      (req as any).security = securityContext;
      
      // Also add to handler context for convenience
      if (context.security) {
        Object.assign(context.security, securityContext);
      } else {
        context.security = securityContext;
      }

      return req;
    } catch (error) {
      console.error('[Auth Security Middleware] Error processing token:', error);
      return req; // Continue without security context on error
    }
  };
}

function getExtensionValue(resource: any, urlSuffix: string): any {
  const fullUrl = `http://atomic-fhir.org/ig/auth/StructureDefinition/${urlSuffix}`;
  const extension = resource.extension?.find((ext: any) => ext.url === fullUrl);
  return extension?.valueString || extension?.valueBoolean || extension?.valueDateTime || null;
}