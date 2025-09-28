# @atomic-ehr/server

HTTP server package for Atomic EHR framework with FHIR hooks integration.

## Overview

This package provides a complete HTTP server implementation that integrates with the `@atomic-ehr/core` hooks system. It handles HTTP requests, orchestrates hook execution, and provides FHIR-compliant responses.

## Features

- **Hook Integration**: Full integration with `@atomic-ehr/core` hooks system
- **Request Pipeline**: Complete request processing with all hook phases
- **FHIR Responses**: Proper FHIR formatting with OperationOutcome errors
- **CORS Support**: Configurable Cross-Origin Resource Sharing
- **Security Headers**: Built-in security headers and protections
- **Context Management**: Rich request/response context with hook controls
- **Error Handling**: Comprehensive error handling with hook integration
- **Performance Monitoring**: Built-in performance tracking and statistics

## Installation

```bash
npm install @atomic-ehr/server @atomic-ehr/core
```

## Quick Start

```typescript
import { FhirServer } from '@atomic-ehr/server';

// Create server
const server = new FhirServer({
  port: 3000,
  host: 'localhost',
  cors: { enabled: true },
  logging: { level: 'info' }
});

// Add hooks
server.addHook({
  name: 'request-logger',
  phase: 'preRequest',
  priority: 100,
  handler: async (context) => {
    console.log(`${context.method} ${context.url}`);
  }
});

// Start server
await server.start();
console.log('Server running on http://localhost:3000');
```

## Configuration

### FhirServerConfig

```typescript
interface FhirServerConfig {
  port: number;                    // Required: Server port
  host?: string;                   // Server host (default: 'localhost')
  packages?: string[];             // FHIR packages (for future phases)
  hooks?: HookDefinition[];        // Pre-configured hooks
  middleware?: any[];              // Express-style middleware (future)
  cors?: CorsConfig;               // CORS configuration
  logging?: LoggingConfig;         // Logging configuration
  timeout?: number;                // Request timeout (default: 30s)
  maxBodySize?: number;            // Max request body size (default: 10MB)
}
```

### CORS Configuration

```typescript
interface CorsConfig {
  enabled: boolean;                // Enable CORS
  origins?: string[];              // Allowed origins (default: ['*'])
  methods?: string[];              // Allowed methods
  headers?: string[];              // Allowed headers
}
```

## Hook Integration

The server executes hooks in the following phases:

1. **onBootstrap** - Server startup
2. **onConfigResolved** - After configuration processing
3. **onRegister** - Register static components
4. **onRouteRegister** - Register dynamic routes (placeholder)

Per request:
5. **preRequest** - Early request processing
6. **preValidation** - Request validation
7. **preHandler** - Business logic preparation
8. **preResponse** - Response preparation
9. **onResponse** - Successful response
10. **onError** - Error handling (if errors occur)

### Hook Examples

#### Authentication Hook

```typescript
server.addHook({
  name: 'jwt-auth',
  phase: 'preRequest',
  priority: 200,
  handler: async (context) => {
    const token = context.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      context.setResponse({
        statusCode: 401,
        responseHeaders: { 'Content-Type': 'application/fhir+json' },
        responseBody: {
          resourceType: 'OperationOutcome',
          issue: [{
            severity: 'error',
            code: 'security',
            diagnostics: 'Authentication required'
          }]
        }
      });
      context.takeOver();
      return;
    }

    // Validate token and set user context
    context.user = await validateToken(token);
  }
});
```

#### Resource Validation Hook

```typescript
server.addHook({
  name: 'patient-validation',
  phase: 'preHandler',
  priority: 100,
  resources: 'Patient',
  handler: async (context) => {
    if (context.operation === 'create' && context.body) {
      const patient = context.body;

      if (!patient.name?.[0]?.family) {
        throw new Error('Patient must have a family name');
      }
    }
  }
});
```

#### Audit Logging Hook

```typescript
server.addHook({
  name: 'audit-logger',
  phase: 'onResponse',
  priority: 50,
  resources: '*',
  handler: async (context) => {
    const auditEvent = {
      timestamp: new Date().toISOString(),
      action: context.operation,
      resourceType: context.resourceType,
      userId: context.user?.id || 'anonymous',
      success: context.statusCode < 400
    };

    await logAuditEvent(auditEvent);
  }
});
```

## Context Objects

### HttpRequestContext

```typescript
interface HttpRequestContext {
  // Core context
  requestId: string;
  startTime: number;
  logger: Logger;
  clock: Clock;
  config: Config;
  events: EventEmitter;

  // HTTP properties
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any;

  // FHIR context
  resourceType?: string;
  operation?: string;

  // Hook controls
  stopPropagation(): void;
  takeOver(): void;
  skip(): void;
  setResponse(response: HttpResponseContext): void;
  addDiagnostic(diagnostic: Diagnostic): void;
}
```

### HttpResponseContext

```typescript
interface HttpResponseContext {
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
    hookDuration: number;
  };
  diagnostics?: Diagnostic[];
}
```

## Server Lifecycle

### Starting the Server

```typescript
const server = new FhirServer(config);

// Add hooks before starting
server.addHook(authHook);
server.addHook(validationHook);

// Start server
await server.start();
```

### Stopping the Server

```typescript
// Graceful shutdown
await server.stop();
```

### Event Monitoring

```typescript
server.on('server:starting', () => console.log('Starting...'));
server.on('server:started', () => console.log('Started!'));
server.on('request:received', (data) => console.log('Request:', data));
server.on('request:completed', (data) => console.log('Response:', data));
server.on('request:error', (data) => console.log('Error:', data));
```

## Error Handling

The server provides comprehensive error handling:

- **Automatic OperationOutcome**: All errors are formatted as FHIR OperationOutcome
- **Hook Error Handling**: Errors in hooks are caught and handled
- **Custom Error Responses**: Hooks can provide custom error responses
- **Security**: Error messages are sanitized for production

### Error Hook Example

```typescript
server.addHook({
  name: 'error-handler',
  phase: 'onError',
  priority: 100,
  handler: async (context) => {
    // Log error for monitoring
    logger.error('Request failed', {
      error: context.error.message,
      requestId: context.requestId,
      url: context.url
    });

    // Provide custom error response
    context.errorResponse = {
      statusCode: 500,
      responseHeaders: { 'Content-Type': 'application/fhir+json' },
      responseBody: createOperationOutcome(context.error)
    };

    context.handled = true;
  }
});
```

## Performance

The server includes built-in performance monitoring:

- **Request Timing**: Automatic timing for all requests
- **Hook Duration**: Separate timing for hook execution
- **Statistics**: Server-wide statistics and metrics
- **Monitoring**: Performance hooks for custom monitoring

```typescript
// Get server statistics
const stats = server.getStats();
console.log('Total requests:', stats.totalRequests);
console.log('Average response time:', stats.averageResponseTime);
console.log('Active connections:', stats.activeConnections);
```

## Examples

See the `examples/` directory for complete working examples:

- `demo-server.ts` - Full featured server with multiple hooks
- `test-client.ts` - Test client for exercising server functionality

To run the demo:

```bash
cd examples
bun demo-server.ts
```

In another terminal:

```bash
cd examples
bun test-client.ts
```

## API Reference

### FhirServer Class

#### Constructor
- `new FhirServer(config: FhirServerConfig)`

#### Methods
- `addHook(hook: HookDefinition): void` - Register a hook
- `removeHook(hookName: string): void` - Unregister a hook
- `async start(): Promise<void>` - Start the server
- `async stop(): Promise<void>` - Stop the server
- `isRunning(): boolean` - Check if server is running
- `getStats(): ServerStats` - Get server statistics

#### Events
- `server:starting` - Server is starting
- `server:started` - Server has started
- `server:stopping` - Server is stopping
- `server:stopped` - Server has stopped
- `request:received` - Request received
- `request:completed` - Request completed successfully
- `request:error` - Request failed

### Utility Functions

- `validateConfig(config)` - Validate server configuration
- `mergeConfig(config)` - Merge with default configuration
- `createFhirServer(config)` - Factory function for creating servers

## Integration with Task 003

This server package provides the foundation for Task 003 (FHIR URL Routing). The placeholder handler in `executeHandler()` will be replaced with actual FHIR routing logic.

The hook integration is complete and ready for:
- FHIR resource operations (CRUD)
- FHIR search operations
- Custom FHIR operations
- Validation with StructureDefinitions
- Authentication and authorization

## Contributing

This package is part of the Atomic EHR framework. For development:

1. Install dependencies: `bun install`
2. Run tests: `bun test`
3. Build package: `bun run build`
4. Type check: `bun run typecheck`

## License

MIT License - see LICENSE file for details.