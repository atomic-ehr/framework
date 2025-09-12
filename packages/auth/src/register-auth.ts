import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Atomic } from "@atomic-fhir/core";
import { AtomicAuthPackageDefinition, AtomicAuthSeedProvider } from "./package.js";
import { createAuthRouter, type AuthRouterConfig } from "./http/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RegisterAuthOptions extends AuthRouterConfig {
  enableSeeding?: boolean;
  seedProvider?: any;
}

/**
 * Register authentication with an Atomic FHIR server using the new autoload system
 */
export async function registerAuth(
  app: Atomic, 
  options: RegisterAuthOptions = {}
): Promise<void> {
  console.log('[Atomic Auth] Registering authentication system...');

  // Register the embedded auth package for autoloading
  const packagePath = join(__dirname, '..'); // Go up to package root
  await app.registerEmbeddedPackage(AtomicAuthPackageDefinition, packagePath);

  // Note: Seed provider is registered by the embedded package system after configuration
  // to ensure proper order (database entities created before seeding)

  // Register HTTP routes
  const routes = createAuthRouter({
    basePath: options.basePath || '/auth',
    enableStaticAssets: options.enableStaticAssets !== false,
    staticPath: options.staticPath || '/auth/static'
  });

  // Register routes with the app's router
  for (const [route, handler] of Object.entries(routes)) {
    const [method, path] = route.split(' ', 2);
    
    // Wrap handler to ensure context is passed correctly
    const wrappedHandler = async (req: Request, context?: any) => {
      // Always construct context from app to ensure proper storage reference
      const handlerContext = {
        storage: app.storage,
        hooks: app.hooks,
        operations: app.operations,
        middleware: app.middleware,
        config: app.config,
        packageManager: app.packageManager
      };
      
      console.log('[Auth Route] Storage context:', {
        hasStorage: !!handlerContext.storage,
        storageType: handlerContext.storage?.constructor?.name,
        searchMethod: typeof handlerContext.storage?.search
      });
      
      const response = await handler(req, handlerContext);
      
      // Ensure response body is properly serialized (but skip binary data)
      if (response && typeof response.body === 'object' && response.body !== null && !(response.body instanceof ArrayBuffer)) {
        return {
          ...response,
          body: JSON.stringify(response.body)
        };
      }
      
      return response;
    };
    
    if (method === 'GET') {
      app.router.get(path, wrappedHandler);
    } else if (method === 'POST') {
      app.router.post(path, wrappedHandler);
    } else {
      console.warn(`[Atomic Auth] Unsupported HTTP method: ${method}`);
    }
  }

  console.log(`[Atomic Auth] Registered ${Object.keys(routes).length} authentication routes`);
}

/**
 * Simplified registration function for basic auth setup
 */
export async function enableAuth(app: Atomic): Promise<void> {
  await registerAuth(app, {
    enableSeeding: true,
    enableStaticAssets: true
  });
}

// Export commonly used items for convenience
export { 
  AtomicAuthPackageDefinition,
  AtomicAuthSeedProvider
};

// Maintain backward compatibility
export {
  createAuthRouter,
  registerAuthRoutes,
  createAuthSecurityMiddleware,
  authorizeHandler,
  loginHandler,
  tokenHandler,
} from "./http/index.js";

export {
  seedAuthData,
  checkAndRunAutoSeeding,
  shouldRunSeeding,
  getSeedingOptions,
  DEFAULT_SEED_CREDENTIALS,
  DEFAULT_SEED_CLIENTS,
} from "./seeds/index.js";