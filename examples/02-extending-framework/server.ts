/**
 * Example 2: Extending the Framework
 *
 * Comprehensive example showing how to extend the Atomic FHIR Server:
 * - Plugin system (Fastify-like)
 * - Type system extensions (declaration merging)
 * - Decorators (server, request, response)
 * - Custom hooks
 * - Context augmentation
 */

import { FhirServer, definePlugin } from '@atomic-ehr/server';
import type { PluginFunction, PluginOptions } from '@atomic-ehr/server';

// ==================== TYPE SYSTEM EXTENSIONS ====================

/**
 * Extend the type system using TypeScript declaration merging
 * This makes your custom properties and methods type-safe
 */
declare module '@atomic-ehr/core' {
  // Extend server-level decorators
  interface ServerDecorators {
    /** Database connection */
    database: Database;
    /** Authentication utility */
    authenticate(token: string): Promise<User | null>;
    /** Feature flag checker */
    isFeatureEnabled(feature: string): boolean;
  }

  // Extend request context
  interface RequestDecorators {
    /** Current authenticated user */
    user: User | null;
    /** Request start time for metrics */
    requestStart: number;
    /** Organization from tenant context */
    organization: string | null;
  }

  // Extend response context
  interface ResponseDecorators {
    /** Send successful response */
    sendSuccess(data: any): void;
    /** Send error response */
    sendError(error: Error): void;
    /** Add custom header */
    addCustomHeader(name: string, value: string): void;
  }

  // Extend atomic context for plugins
  interface AtomicContextExtensions {
    /** Tenant information */
    tenant: {
      id: string;
      name: string;
    };
  }
}

// ==================== CUSTOM TYPES ====================

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  organization: string;
}

interface Database {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  close(): Promise<void>;
}

// ==================== PLUGIN 1: DATABASE ====================

/**
 * Database plugin - Adds database connectivity
 */
const databasePlugin = definePlugin(
  {
    name: 'database',
    version: '1.0.0',
    description: 'Provides database connectivity',
  },
  async (context, options) => {
    console.log('🔌 Initializing database plugin...');

    // Simulate database connection
    const database: Database = {
      query: async (sql, params) => {
        console.log(`  📊 Query: ${sql}`, params);
        return [];
      },
      execute: async (sql, params) => {
        console.log(`  ✏️  Execute: ${sql}`, params);
      },
      close: async () => {
        console.log('  📊 Database connection closed');
      },
    };

    // Add database as server decorator (now type-safe!)
    server.decorate('database', database);

    // Cleanup on shutdown
    server.addHook({
      name: 'database-cleanup',
      phase: 'onShutdown',
      priority: 10,
      async handler(ctx, next) {
        await database.close();
        return next();
      },
    });

    return context;
  }
);

// ==================== PLUGIN 2: AUTHENTICATION ====================

/**
 * Authentication plugin - Adds JWT authentication
 */
const authenticationPlugin = definePlugin(
  {
    name: 'authentication',
    version: '1.0.0',
    description: 'JWT-based authentication',
    dependencies: ['database'], // Requires database plugin
  },
  async (context, options) => {
    console.log('🔐 Initializing authentication plugin...');

    // Simulate token validation
    const validateToken = async (token: string): Promise<User | null> => {
      if (token === 'valid-token') {
        return {
          id: 'user-123',
          email: 'user@example.com',
          role: 'admin',
          organization: 'org-456',
        };
      }
      return null;
    };

    // Add authentication method as server decorator
    server.decorate('authenticate', validateToken);

    // Add request decorators for auth data
    server.decorateRequest('user', null);
    server.decorateRequest('organization', null);

    // Add authentication hook
    server.addHook({
      name: 'auth-check',
      phase: 'preHandler',
      priority: 100,
      async handler(context, next) {
        const token = context.headers.authorization?.replace('Bearer ', '');

        if (token) {
          // Use the type-safe authenticate method
          context.user = await server.authenticate(token);
          context.organization = context.user?.organization || null;

          if (context.user) {
            console.log(`  🔐 Authenticated: ${context.user.email} (${context.user.role})`);
          }
        }

        return next();
      },
    });

    return context;
  }
);

// ==================== PLUGIN 3: FEATURE FLAGS ====================

/**
 * Feature flags plugin - Toggle features dynamically
 */
interface FeatureFlagOptions extends PluginOptions {
  config?: {
    features: Record<string, boolean>;
  };
}

const featureFlagsPlugin = definePlugin<any, FeatureFlagOptions>(
  {
    name: 'feature-flags',
    version: '1.0.0',
    description: 'Feature flag management',
  },
  async (context, options) => {
    console.log('🚩 Initializing feature flags plugin...');

    const features = options?.config?.features || {};

    console.log('  🚩 Enabled features:', Object.keys(features).filter(k => features[k]));

    // Add feature flag checker
    server.decorate('isFeatureEnabled', (feature: string) => {
      return features[feature] === true;
    });

    return context;
  },
  {
    // Default features
    config: {
      features: {
        advancedSearch: false,
        bulkOperations: false,
      },
    },
  }
);

// ==================== PLUGIN 4: RESPONSE HELPERS ====================

/**
 * Response helpers plugin - Standardized response methods
 */
const responseHelpersPlugin = definePlugin(
  {
    name: 'response-helpers',
    version: '1.0.0',
    description: 'Standardized response methods',
  },
  async (context, options) => {
    console.log('📤 Initializing response helpers plugin...');

    // Add response decorators (now type-safe!)
    server.decorateResponse('sendSuccess', function (data: any) {
      this.statusCode = 200;
      this.responseHeaders['X-Success'] = 'true';
      this.responseBody = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    });

    server.decorateResponse('sendError', function (error: Error & { statusCode?: number }) {
      this.statusCode = error.statusCode || 500;
      this.responseHeaders['X-Error'] = 'true';
      this.responseBody = {
        success: false,
        error: {
          message: error.message,
          code: error.statusCode || 500,
        },
        timestamp: new Date().toISOString(),
      };
    });

    server.decorateResponse('addCustomHeader', function (name: string, value: string) {
      this.responseHeaders[name] = value;
    });

    return context;
  }
);

// ==================== MAIN SERVER SETUP ====================

async function main() {
  console.log('🚀 Starting Extended FHIR Server...\n');

  const server = new FhirServer({
    port: 3000,
    serverName: 'Extended FHIR Server',
    description: 'FHIR Server with plugins, decorators, and custom extensions',

    // Optional: Load FHIR R4 Core
    packages: ['hl7.fhir.r4.core#4.0.1'],
  });

  // ========== REGISTER PLUGINS ==========
  console.log('📦 Registering plugins...\n');

  await server.register(databasePlugin);

  await server.register(authenticationPlugin);

  await server.register(featureFlagsPlugin, {
    config: {
      features: {
        advancedSearch: true,
        bulkOperations: true,
        experimentalFeature: false,
      },
    },
  });

  await server.register(responseHelpersPlugin);

  // ========== ADD REQUEST DECORATORS ==========
  console.log('\n🎨 Adding request decorators...\n');

  server.decorateRequest('requestStart', Date.now());

  server.decorateRequestGetter('requestDuration', function () {
    return Date.now() - this.requestStart;
  });

  // ========== ADD CUSTOM HOOKS ==========
  console.log('🪝 Adding custom hooks...\n');

  // Metrics hook
  server.addHook({
    name: 'request-metrics',
    phase: 'onRequest',
    priority: 90,
    async handler(context, next) {
      console.log(`\n📨 ${context.method} ${context.url}`);
      return next();
    },
  });

  // Feature flag check hook
  server.addHook({
    name: 'feature-check',
    phase: 'preHandler',
    priority: 80,
    async handler(context, next) {
      // Example: Check if feature is enabled
      if (context.url.includes('/advanced-search')) {
        if (!server.isFeatureEnabled('advancedSearch')) {
          throw new Error('Advanced search feature is disabled');
        }
      }
      return next();
    },
  });

  // Audit logging hook
  server.addHook({
    name: 'audit-log',
    phase: 'onResponse',
    priority: 50,
    async handler(context, next) {
      // Type-safe access to custom decorators
      const duration = context.requestDuration;
      const user = context.user?.email || 'anonymous';

      console.log(`✅ ${context.statusCode} | ${duration}ms | User: ${user}`);

      // Could log to database using type-safe decorator
      // await server.database.execute('INSERT INTO audit_log ...');

      return next();
    },
  });

  // ========== START SERVER ==========
  console.log('\n🎯 Starting server...\n');
  await server.start();

  console.log('✅ Server started successfully!\n');
  console.log('📖 Type System Extensions:');
  console.log('  ✓ ServerDecorators - database, authenticate, isFeatureEnabled');
  console.log('  ✓ RequestDecorators - user, requestStart, requestDuration');
  console.log('  ✓ ResponseDecorators - sendSuccess, sendError');
  console.log('');
  console.log('🔌 Plugins Loaded:');
  console.log('  ✓ database - Database connectivity');
  console.log('  ✓ authentication - JWT authentication');
  console.log('  ✓ feature-flags - Feature toggle system');
  console.log('  ✓ response-helpers - Standardized responses');
  console.log('');
  console.log('🪝 Custom Hooks:');
  console.log('  ✓ request-metrics - Request logging');
  console.log('  ✓ feature-check - Feature flag validation');
  console.log('  ✓ audit-log - Audit trail');
  console.log('');
  console.log('💡 Try authenticated requests:');
  console.log('   curl -H "Authorization: Bearer valid-token" http://localhost:3000/Patient');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
