import { defineMiddleware, SMARTScopes } from "@atomic-fhir/core";

export default defineMiddleware({
  name: "auth-security-context",
  
  before: async (req, context) => {
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
      SMARTScopes.setSecurityContext(req, securityContext);
      
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
  }
});

function getExtensionValue(resource: any, urlSuffix: string): any {
  const fullUrl = `http://atomic-fhir.org/ig/auth/StructureDefinition/${urlSuffix}`;
  const extension = resource.extension?.find((ext: any) => ext.url === fullUrl);
  return extension?.valueString || extension?.valueBoolean || extension?.valueDateTime || null;
}