# API Reference

Complete API documentation for Atomic FHIR Server.

## Table of Contents

- [FhirServer](#fhirserver)
- [Configuration](#configuration)
- [Hooks](#hooks)
- [Operations](#operations)
- [Error Handling](#error-handling)
- [Storage](#storage)
- [Validation](#validation)

## FhirServer

The main server class.

### Constructor

```typescript
new FhirServer(config: FhirServerConfig)
```

**Example:**

```javascript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});
```

### Methods

#### `async start(): Promise<void>`

Start the HTTP server.

```javascript
await server.start();
console.log('Server started');
```

#### `async stop(): Promise<void>`

Stop the HTTP server gracefully.

```javascript
await server.stop();
console.log('Server stopped');
```

#### `addHook(hook: HookDefinition): void`

Register a hook.

```javascript
server.addHook({
  name: 'my-hook',
  phase: 'preHandler',
  handler: async (context) => {
    // Hook logic
    return context;
  }
});
```

#### `removeHook(hookName: string): void`

Unregister a hook by name.

```javascript
server.removeHook('my-hook');
```

#### `addRoute(route: FhirRoute): void`

Add a custom route.

```javascript
server.addRoute({
  method: 'GET',
  pattern: '/custom',
  handler: async (context) => ({
    statusCode: 200,
    responseBody: { message: 'Custom endpoint' }
  })
});
```

#### `getStats(): ServerStats`

Get server statistics.

```javascript
const stats = server.getStats();
console.log('Total requests:', stats.totalRequests);
console.log('Average response time:', stats.averageResponseTime);
```

#### `getLoadedPackages(): LoadedPackage[]`

Get all loaded FHIR packages.

```javascript
const packages = server.getLoadedPackages();
packages.forEach(pkg => {
  console.log(`${pkg.name}@${pkg.version}`);
});
```

#### `getSupportedResourceTypes(): string[]`

Get list of supported resource types.

```javascript
const types = server.getSupportedResourceTypes();
console.log('Supported:', types.join(', '));
```

#### `getCapabilityStatement(): CapabilityStatement | null`

Get the server's capability statement.

```javascript
const capability = server.getCapabilityStatement();
console.log('FHIR Version:', capability.fhirVersion);
```

#### `getErrorMetrics(): ErrorMetricsSummary`

Get error metrics.

```javascript
const metrics = server.getErrorMetrics();
console.log('Total errors:', metrics.totalErrors);
console.log('Error rate:', metrics.errorRate);
```

#### `async validateResource(resourceType: string, resource: any): Promise<ValidationResult>`

Manually validate a resource.

```javascript
const result = await server.validateResource('Patient', {
  resourceType: 'Patient',
  gender: 'invalid-value'
});

if (result.errors.length > 0) {
  console.error('Validation errors:', result.errors);
}
```

## Configuration

### FhirServerConfig

Complete configuration options.

```typescript
interface FhirServerConfig {
  // Required
  port: number;

  // Server Identity
  host?: string;                    // Default: 'localhost'
  serverName?: string;              // Default: '@atomic-ehr/server'
  serverVersion?: string;           // Default: '0.1.0'
  description?: string;
  fhirVersion?: string;             // Default: '4.0.1'

  // Package Loading
  packages?: string[];              // e.g., ['hl7.fhir.r4.core#4.0.1']
  packageConfig?: {
    cacheDir?: string;              // Package cache directory
    registryUrls?: string[];        // Package registries
    timeout?: number;               // Download timeout (ms)
    autoLoadBaseResources?: boolean; // Default: true
    enableProgressLogging?: boolean; // Default: true
    failOnPackageLoadError?: boolean; // Default: false
  };

  // Hooks & Middleware
  hooks?: HookDefinition[];         // Pre-registered hooks
  middleware?: any[];               // Express-style middleware

  // Dynamic Routes
  enableDynamicRoutes?: boolean;    // Default: true
  defaultCapabilities?: {           // Default resource capabilities
    read?: boolean;
    vread?: boolean;
    update?: boolean;
    patch?: boolean;
    create?: boolean;
    delete?: boolean;
    searchType?: boolean;
    historyInstance?: boolean;
    historyType?: boolean;
  };
  enabledOperations?: string[];     // Enabled FHIR operations

  // Validation
  validation?: {
    enabled?: boolean;              // Default: true
    validateOnCreate?: boolean;     // Default: true
    validateOnUpdate?: boolean;     // Default: true
    validateOnPatch?: boolean;      // Default: true
    strictMode?: boolean;           // Default: true
    profileValidation?: boolean;    // Default: true
  };

  // Error Handling
  errorHandling?: {
    includeStackTrace?: boolean;    // Default: false (dev: true)
    logErrors?: boolean;            // Default: true
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    sanitizeErrors?: boolean;       // Default: true
    detailedValidationErrors?: boolean; // Default: true
    enableErrorMetrics?: boolean;   // Default: true
  };

  // Request Logging
  requestLogging?: {
    logRequests?: boolean;          // Default: true
    logResponses?: boolean;         // Default: true
    logBodies?: boolean;            // Default: false
    logHeaders?: boolean;           // Default: true
    slowRequestThreshold?: number;  // Default: 1000 (ms)
    sanitizeHeaders?: string[];     // Headers to redact
  };

  // Security
  securityConfig?: {
    cors?: boolean;
    authentication?: Array<{
      type: string;
      display: string;
      description?: string;
    }>;
  };

  // CORS
  cors?: {
    enabled: boolean;
    origins?: string[];             // Allowed origins
    methods?: string[];             // Allowed methods
    headers?: string[];             // Allowed headers
  };

  // Logging
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'text';
  };

  // Performance
  timeout?: number;                 // Request timeout (ms)
  maxBodySize?: number;             // Max request body size (bytes)

  // Storage
  storage?: StorageAdapter;         // Custom storage adapter

  // Debug
  debug?: boolean;                  // Enable debug mode
}
```

**Example:**

```javascript
const server = new FhirServer({
  port: 3000,
  host: 'localhost',
  serverName: 'my-fhir-server',
  serverVersion: '1.0.0',
  description: 'My FHIR R4 Server',

  packages: ['hl7.fhir.r4.core#4.0.1'],
  packageConfig: {
    registryUrls: ['https://packages.fhir.org'],
    enableProgressLogging: false
  },

  validation: {
    enabled: true,
    validateOnCreate: true,
    profileValidation: true
  },

  errorHandling: {
    includeStackTrace: false,
    sanitizeErrors: true,
    enableErrorMetrics: true
  },

  requestLogging: {
    logRequests: true,
    logResponses: true,
    slowRequestThreshold: 1000
  },

  cors: {
    enabled: true,
    origins: ['http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },

  logging: {
    level: 'info',
    format: 'json'
  },

  debug: process.env.NODE_ENV === 'development'
});
```

## Hooks

Hooks are the core extension mechanism.

### HookDefinition

```typescript
interface HookDefinition {
  name: string;                     // Unique hook name
  phase: HookPhase;                 // When to execute
  priority?: number;                // Execution order (higher = first)
  resources?: string | string[];    // Resource types or '*'
  operations?: string | string[];   // Operations to match
  handler: HookHandler;             // Hook function
}

type HookPhase =
  | 'onBootstrap'      // Server startup
  | 'onConfigResolved' // Config loaded
  | 'onRegister'       // Registration phase
  | 'onRouteRegister'  // Route registration
  | 'preRequest'       // Before request processing
  | 'preValidation'    // Before validation
  | 'preHandler'       // Before resource handler
  | 'postHandler'      // After resource handler
  | 'preResponse'      // Before sending response
  | 'onResponse'       // Response sent
  | 'onError'          // Error occurred
  | 'onShutdown';      // Server shutdown
```

### Hook Context

Context passed to hooks:

```typescript
interface HttpRequestContext {
  // Request Info
  requestId: string;
  startTime: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any;

  // FHIR Context
  resourceType?: string;
  operation?: string;

  // User Context (from auth hooks)
  user?: any;

  // Control Methods
  stopPropagation(): void;    // Stop executing hooks
  takeOver(): void;           // Take over response
  skip(): void;               // Skip remaining hooks
  setResponse(response): void; // Set custom response
  addDiagnostic(diagnostic): void; // Add diagnostic info

  // Services
  logger: Logger;
  storage: StorageAdapter;
}
```

### defineHook()

Helper to define hooks with autoload support.

```javascript
import { defineHook } from '@atomic-ehr/core';

export default defineHook({
  name: 'timestamp-hook',
  phase: 'preHandler',
  resources: '*',
  priority: 70,
  async handler(context) {
    if (['create', 'update'].includes(context.operation)) {
      const resource = context.body;
      if (resource && !resource.meta) {
        resource.meta = {};
      }
      resource.meta.lastUpdated = new Date().toISOString();
    }
    return context;
  }
});
```

### Hook Examples

#### Authentication Hook

```javascript
defineHook({
  name: 'jwt-auth',
  phase: 'preRequest',
  priority: 95,
  async handler(context) {
    const token = context.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new FhirUnauthorizedError('Token required');
    }

    const payload = jwt.verify(token, SECRET);
    context.user = payload;

    return context;
  }
});
```

#### Audit Logging Hook

```javascript
defineHook({
  name: 'audit',
  phase: 'onResponse',
  resources: '*',
  async handler(context) {
    if (['create', 'update', 'delete'].includes(context.operation)) {
      await logAuditEvent({
        action: context.operation,
        resourceType: context.resourceType,
        resourceId: context.params?.id,
        userId: context.user?.id,
        timestamp: new Date()
      });
    }
    return context;
  }
});
```

#### Rate Limiting Hook

```javascript
const rateLimiter = new Map();

defineHook({
  name: 'rate-limit',
  phase: 'preRequest',
  priority: 90,
  async handler(context) {
    const key = context.user?.id || context.headers['x-real-ip'];
    const now = Date.now();
    const window = 60000; // 1 minute
    const limit = 100;

    const requests = rateLimiter.get(key) || [];
    const recent = requests.filter(t => now - t < window);

    if (recent.length >= limit) {
      throw new FhirTooManyRequestsError(60);
    }

    recent.push(now);
    rateLimiter.set(key, recent);

    return context;
  }
});
```

## Operations

Custom FHIR operations.

### OperationDefinition

```typescript
interface OperationDefinition {
  name: string;                     // Operation name (without $)
  resourceType?: string;            // Resource type or '*'
  level: 'system' | 'type' | 'instance';
  parameters?: OperationParameter[];
  handler: OperationHandler;
}
```

### defineOperation()

```javascript
import { defineOperation } from '@atomic-ehr/core';

export default defineOperation({
  name: 'match',
  resourceType: 'Patient',
  level: 'type',  // /Patient/$match
  async handler(context) {
    // Access operation parameters
    const params = context.body;

    // Perform matching logic
    const matches = await findMatchingPatients(params);

    return {
      statusCode: 200,
      responseBody: {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: matches.map(patient => ({
          resource: patient,
          search: { mode: 'match' }
        }))
      }
    };
  }
});
```

## Error Handling

### FHIR Error Classes

All errors extend `FhirError` and return OperationOutcome.

```javascript
import {
  FhirError,
  FhirBadRequestError,        // 400
  FhirUnauthorizedError,       // 401
  FhirForbiddenError,          // 403
  FhirNotFoundError,           // 404
  FhirConflictError,           // 409
  FhirValidationError,         // 422
  FhirTooManyRequestsError,    // 429
  FhirInternalError,           // 500
  FhirNotImplementedError      // 501
} from '@atomic-ehr/server';
```

### Throwing Errors

```javascript
// Not found
throw new FhirNotFoundError('Patient', patientId);

// Validation error
throw new FhirValidationError('Validation failed', [
  {
    type: 'required',
    message: 'Field is required',
    path: 'Patient.name'
  }
]);

// Unauthorized
throw new FhirUnauthorizedError('Invalid token');

// Forbidden
throw new FhirForbiddenError('Insufficient permissions');
```

### Error Response Format

All errors return FHIR OperationOutcome:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "not-found",
    "diagnostics": "Patient/123 not found",
    "location": ["Patient/123"]
  }]
}
```

## Storage

### StorageAdapter Interface

Implement custom storage backends.

```typescript
interface StorageAdapter {
  create(resourceType: string, resource: any): Promise<StorageResult>;
  read(resourceType: string, id: string): Promise<StorageResult>;
  update(resourceType: string, id: string, resource: any): Promise<StorageResult>;
  patch(resourceType: string, id: string, patchDoc: any): Promise<StorageResult>;
  delete(resourceType: string, id: string): Promise<StorageResult>;
  search(resourceType: string, params: SearchParams): Promise<SearchResult>;
  history(resourceType: string, id?: string): Promise<HistoryResult>;
  vread(resourceType: string, id: string, versionId: string): Promise<StorageResult>;
}
```

### Custom Storage Example

```javascript
class PostgresStorageAdapter {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async create(resourceType, resource) {
    const id = generateId();
    const versionId = '1';

    resource.id = id;
    resource.meta = {
      versionId,
      lastUpdated: new Date().toISOString()
    };

    await this.pool.query(
      'INSERT INTO resources (id, resource_type, version_id, content) VALUES ($1, $2, $3, $4)',
      [id, resourceType, versionId, JSON.stringify(resource)]
    );

    return {
      resource,
      found: true,
      created: true,
      versionId,
      lastModified: new Date()
    };
  }

  // Implement other methods...
}

// Use it
const server = new FhirServer({
  port: 3000,
  storage: new PostgresStorageAdapter(process.env.DATABASE_URL)
});
```

## Validation

### Manual Validation

```javascript
const result = await server.validateResource('Patient', {
  resourceType: 'Patient',
  gender: 'invalid-value'
});

if (result.errors.length > 0) {
  result.errors.forEach(error => {
    console.error(`${error.path}: ${error.message}`);
  });
}
```

### Validation Configuration

```javascript
{
  validation: {
    enabled: true,
    validateOnCreate: true,
    validateOnUpdate: true,
    validateOnPatch: true,
    strictMode: true,
    profileValidation: true
  }
}
```

### Custom Validation

```javascript
defineHook({
  name: 'custom-validation',
  phase: 'preHandler',
  resources: 'Patient',
  async handler(context) {
    if (context.operation === 'create') {
      const patient = context.body;

      if (!patient.identifier?.length) {
        throw new FhirValidationError('Patient must have at least one identifier');
      }
    }
    return context;
  }
});
```

## Utilities

### Logger

```javascript
context.logger.debug('Debug message', { data });
context.logger.info('Info message', { data });
context.logger.warn('Warning message', { data });
context.logger.error('Error message', { error });
```

### Context Factory

```javascript
import { ContextFactory } from '@atomic-ehr/core';

const baseContext = ContextFactory.createBaseContext({
  requestId: generateRequestId(),
  logger: myLogger
});
```

### Request ID Generation

```javascript
import { generateRequestId } from '@atomic-ehr/core';

const id = generateRequestId(); // UUID v4
```

## See Also

- [Getting Started](./getting-started.md)
- [Hook System Deep Dive](./hooks.md)
- [Configuration Guide](./configuration.md)
- [Examples](./examples.md)