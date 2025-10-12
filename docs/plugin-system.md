# Plugin System

The Atomic FHIR Server features a powerful plugin system inspired by Fastify, allowing you to extend the server with reusable, encapsulated functionality.

## Table of Contents

- [Overview](#overview)
- [Plugin Basics](#plugin-basics)
- [Creating Plugins](#creating-plugins)
- [Registering Plugins](#registering-plugins)
- [Decorator Pattern](#decorator-pattern)
- [Plugin Encapsulation](#plugin-encapsulation)
- [Plugin Dependencies](#plugin-dependencies)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

The plugin system allows you to:

- **Extend server functionality** with reusable modules
- **Add decorators** to server, request, and response contexts
- **Encapsulate functionality** with proper scoping
- **Manage dependencies** between plugins
- **Hook into lifecycle** events for initialization and cleanup

### Key Concepts

1. **Plugins**: Reusable modules that extend server functionality
2. **Decorators**: Custom properties/methods added to contexts
3. **Encapsulation**: Plugin-specific scope and isolation
4. **Dependencies**: Explicit plugin dependency management
5. **Lifecycle**: Hooks for initialization, ready, and cleanup

## Plugin Basics

A plugin is a function that receives the server context and options:

```typescript
import { PluginFunction } from '@atomic-ehr/server';

const myPlugin: PluginFunction = async (context, options) => {
  // Plugin initialization code
  console.log('Plugin initialized with options:', options);

  // Return context (can be modified)
  return context;
};
```

### Plugin Metadata

Plugins can include metadata for better organization:

```typescript
import { definePlugin } from '@atomic-ehr/server';

const myPlugin = definePlugin(
  {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'Does something awesome',
    dependencies: ['other-plugin'], // Optional dependencies
    tags: ['feature', 'utility']     // Optional tags
  },
  async (context, options) => {
    // Plugin code
    return context;
  }
);
```

## Creating Plugins

### Simple Plugin

```typescript
const timestampPlugin = definePlugin(
  {
    name: 'timestamp-plugin',
    version: '1.0.0',
    description: 'Adds timestamp to all resources'
  },
  async (context, options) => {
    // Add a hook that runs before creating resources
    server.addHook({
      name: 'add-timestamp',
      phase: 'preHandler',
      resources: '*',
      priority: 80,
      async handler(ctx, next) {
        if (ctx.method === 'POST' || ctx.method === 'PUT') {
          if (ctx.body && typeof ctx.body === 'object') {
            if (!ctx.body.meta) ctx.body.meta = {};
            ctx.body.meta.lastUpdated = new Date().toISOString();
          }
        }
        return next();
      }
    });

    return context;
  }
);
```

### Plugin with Configuration

```typescript
interface DatabasePluginOptions extends PluginOptions {
  config?: {
    host: string;
    port: number;
    database: string;
    connectionPool?: number;
  };
}

const databasePlugin = definePlugin<any, DatabasePluginOptions>(
  {
    name: 'database-plugin',
    version: '1.0.0',
    description: 'Provides database connectivity'
  },
  async (context, options) => {
    const { host, port, database } = options?.config || {};

    const db = await connectToDatabase({
      host: host || 'localhost',
      port: port || 5432,
      database: database || 'fhir'
    });

    // Add database to context (in practice, use decorators)
    // server.decorate('db', db);

    return context;
  },
  {
    // Default options
    config: {
      host: 'localhost',
      port: 5432,
      database: 'fhir',
      connectionPool: 10
    }
  }
);
```

## Registering Plugins

### Basic Registration

```typescript
const server = new FhirServer({ port: 3000 });

// Register plugin
await server.register(myPlugin);

// Start server (plugins are initialized first)
await server.start();
```

### Registration with Options

```typescript
await server.register(databasePlugin, {
  config: {
    host: 'db.example.com',
    port: 5432,
    database: 'production_fhir'
  }
});
```

### Registration via Configuration

```typescript
const server = new FhirServer({
  port: 3000,
  plugins: [
    {
      plugin: authPlugin,
      options: { config: { secret: 'my-secret' } }
    },
    {
      plugin: auditPlugin,
      options: { encapsulate: true }
    }
  ]
});
```

### Plugin Registration Rules

- Plugins must be registered **before** `server.start()`
- Plugins are initialized in **registration order**
- Dependencies are validated automatically
- Each plugin runs in its own scope (if encapsulation is enabled)

## Decorator Pattern

Decorators allow you to add custom properties and methods to server, request, and response contexts.

### Server Decorators

Add properties/methods to the server instance:

```typescript
// Add a property
server.decorate('database', databaseConnection);

// Add a method
server.decorate('authenticate', async function(token) {
  return await validateToken(token);
});

// Add a getter
server.decorateGetter('config', () => loadConfig());

// Use decorator
const db = server.database;
const user = await server.authenticate(token);
const cfg = server.config;
```

### Request Decorators

Add properties/methods to request contexts:

```typescript
// Add request property
server.decorateRequest('user', null);

// Add request getter
server.decorateRequestGetter('userId', function() {
  return this.user?.id;
});

// Use in hooks
server.addHook({
  name: 'extract-user',
  phase: 'preHandler',
  async handler(context, next) {
    // Set decorated property
    context.user = await extractUserFromToken(context.headers.authorization);

    // Access decorated getter
    console.log('User ID:', context.userId);

    return next();
  }
});
```

### Response Decorators

Add properties/methods to response contexts:

```typescript
// Add response method
server.decorateResponse('sendSuccess', function(data) {
  this.statusCode = 200;
  this.responseBody = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
});

server.decorateResponse('sendError', function(error) {
  this.statusCode = error.statusCode || 500;
  this.responseBody = {
    success: false,
    error: error.message
  };
});

// Use in handlers
server.addHook({
  name: 'custom-response',
  phase: 'onResponse',
  async handler(context, next) {
    // Use decorated method
    if (context.statusCode === 200) {
      context.sendSuccess(context.responseBody);
    }
    return next();
  }
});
```

### Type-Safe Decorators

Use TypeScript declaration merging for type safety:

```typescript
// Extend decorator interfaces
declare module '@atomic-ehr/core' {
  interface ServerDecorators {
    database: DatabaseConnection;
    authenticate(token: string): Promise<User>;
  }

  interface RequestDecorators {
    user: User | null;
    userId: string;
  }

  interface ResponseDecorators {
    sendSuccess(data: any): void;
    sendError(error: Error): void;
  }
}
```

## Plugin Encapsulation

Plugins can be encapsulated to prevent pollution of parent scope:

```typescript
await server.register(myPlugin, {
  encapsulate: true  // Default: true
});
```

### Encapsulation Benefits

1. **Isolation**: Decorators don't leak to parent
2. **Scoping**: Routes are prefixed automatically
3. **Cleanup**: Resources cleaned up on unload

### Example with Encapsulation

```typescript
const apiV1Plugin = definePlugin(
  { name: 'api-v1', version: '1.0.0' },
  async (context, options) => {
    // This decorator only exists within this plugin scope
    server.decorate('apiVersion', '1.0');

    // Routes registered here get /api/v1 prefix
    server.addRoute({
      method: 'GET',
      pattern: '/users',
      handler: async (ctx) => ({ users: [] })
    });

    return context;
  }
);

await server.register(apiV1Plugin, {
  prefix: '/api/v1',
  encapsulate: true
});
```

## Plugin Dependencies

Plugins can declare dependencies on other plugins:

```typescript
const authPlugin = definePlugin(
  {
    name: 'auth-plugin',
    version: '1.0.0',
    dependencies: ['database-plugin']  // Must be registered first
  },
  async (context, options) => {
    // Can safely use database plugin here
    const db = server.database;

    // Authentication logic
    return context;
  }
);

// Registration order matters
await server.register(databasePlugin);
await server.register(authPlugin);  // Works!

// This would fail:
// await server.register(authPlugin);  // Error: Missing dependency
// await server.register(databasePlugin);
```

### Dependency Validation

The server automatically:
- ✅ Validates dependencies exist
- ✅ Detects circular dependencies
- ✅ Ensures correct registration order
- ❌ Throws error if dependencies missing

## Lifecycle Hooks

Plugins can register hooks at various lifecycle stages:

### Initialization Phases

```typescript
const myPlugin = definePlugin(
  { name: 'lifecycle-demo', version: '1.0.0' },
  async (context, options) => {
    // onBootstrap: Server starting
    server.addHook({
      name: 'bootstrap',
      phase: 'onBootstrap',
      async handler(ctx, next) {
        console.log('Server bootstrapping');
        return next();
      }
    });

    // onRegister: Plugin registration
    server.addHook({
      name: 'register',
      phase: 'onRegister',
      async handler(ctx, next) {
        console.log('Plugin registered');
        return next();
      }
    });

    // onReady: All plugins loaded, before listening
    server.addHook({
      name: 'ready',
      phase: 'onReady',
      async handler(ctx, next) {
        console.log('Server ready');
        return next();
      }
    });

    // onListen: Server started listening
    server.addHook({
      name: 'listen',
      phase: 'onListen',
      async handler(ctx, next) {
        console.log('Server listening');
        return next();
      }
    });

    return context;
  }
);
```

### Cleanup Phases

```typescript
// onClose: Server is closing
server.addHook({
  name: 'close',
  phase: 'onClose',
  async handler(ctx, next) {
    console.log('Server closing');
    await cleanupResources();
    return next();
  }
});

// onShutdown: Server shutdown complete
server.addHook({
  name: 'shutdown',
  phase: 'onShutdown',
  async handler(ctx, next) {
    console.log('Server shut down');
    return next();
  }
});
```

## Best Practices

### 1. Use Metadata

Always include plugin metadata for better organization:

```typescript
const myPlugin = definePlugin(
  {
    name: 'my-plugin',           // Required
    version: '1.0.0',             // Recommended
    description: 'What it does',  // Recommended
    dependencies: [],             // If applicable
    tags: ['feature']             // For categorization
  },
  pluginFunction
);
```

### 2. Declare Dependencies

Explicitly declare plugin dependencies:

```typescript
const authPlugin = definePlugin(
  {
    name: 'auth',
    dependencies: ['database', 'cache']
  },
  pluginFunction
);
```

### 3. Use Type Safety

Extend decorators with TypeScript:

```typescript
declare module '@atomic-ehr/core' {
  interface ServerDecorators {
    myCustomMethod(): Promise<void>;
  }
}
```

### 4. Handle Errors

Always handle errors in plugins:

```typescript
const myPlugin = definePlugin(
  { name: 'my-plugin', version: '1.0.0' },
  async (context, options) => {
    try {
      await initializePlugin();
      return context;
    } catch (error) {
      console.error('Plugin initialization failed:', error);
      throw error;  // Let server handle gracefully
    }
  }
);
```

### 5. Document Your Plugins

Provide clear documentation:

```typescript
/**
 * Authentication Plugin
 *
 * Provides JWT-based authentication for FHIR resources
 *
 * @example
 * ```typescript
 * await server.register(authPlugin, {
 *   config: {
 *     secret: 'my-secret',
 *     algorithm: 'HS256'
 *   }
 * });
 * ```
 */
const authPlugin = definePlugin(...);
```

## Examples

### Complete Plugin Example

```typescript
import { definePlugin, PluginOptions } from '@atomic-ehr/server';

interface AuditPluginOptions extends PluginOptions {
  config?: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    destination: string;
  };
}

const auditPlugin = definePlugin<any, AuditPluginOptions>(
  {
    name: 'audit-plugin',
    version: '1.0.0',
    description: 'Comprehensive audit logging for FHIR operations',
    dependencies: [],
    tags: ['logging', 'compliance', 'security']
  },
  async (context, options) => {
    const logLevel = options?.config?.logLevel || 'info';
    const destination = options?.config?.destination || 'stdout';

    // Initialize audit logger
    const auditLog = createAuditLogger({ logLevel, destination });

    // Add audit decorator
    server.decorate('audit', {
      log: (event: AuditEvent) => auditLog.write(event),
      query: (filter: AuditFilter) => auditLog.query(filter)
    });

    // Add audit hooks
    server.addHook({
      name: 'audit-request',
      phase: 'onRequest',
      priority: 100,
      async handler(ctx, next) {
        auditLog.write({
          type: 'request',
          method: ctx.method,
          url: ctx.url,
          user: ctx.user?.id,
          timestamp: Date.now()
        });
        return next();
      }
    });

    server.addHook({
      name: 'audit-response',
      phase: 'onResponse',
      priority: 10,
      async handler(ctx, next) {
        auditLog.write({
          type: 'response',
          statusCode: ctx.statusCode,
          duration: Date.now() - ctx.startTime,
          timestamp: Date.now()
        });
        return next();
      }
    });

    // Cleanup on shutdown
    server.addHook({
      name: 'audit-cleanup',
      phase: 'onShutdown',
      async handler(ctx, next) {
        await auditLog.close();
        return next();
      }
    });

    return context;
  },
  {
    // Default options
    config: {
      logLevel: 'info',
      destination: 'stdout'
    }
  }
);

export default auditPlugin;
```

### Using Multiple Plugins

```typescript
import { FhirServer } from '@atomic-ehr/server';
import databasePlugin from './plugins/database';
import authPlugin from './plugins/auth';
import auditPlugin from './plugins/audit';
import cachePlugin from './plugins/cache';

const server = new FhirServer({ port: 3000 });

// Register plugins in order
await server.register(databasePlugin, {
  config: { connectionString: process.env.DATABASE_URL }
});

await server.register(cachePlugin, {
  config: { ttl: 3600 }
});

await server.register(authPlugin, {
  config: { secret: process.env.JWT_SECRET }
});

await server.register(auditPlugin, {
  config: { logLevel: 'info' }
});

await server.start();
```

## Related Documentation

- [Hook System](./hook-system.md)
- [Configuration Guide](./configuration.md)
- [API Reference](./api-reference.md)
