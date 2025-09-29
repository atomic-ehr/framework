# Hook System

The Atomic FHIR Server uses a powerful hook system that allows you to inject custom business logic at various points in the request lifecycle. This guide covers everything you need to know about hooks.

## Table of Contents

- [Overview](#overview)
- [Hook Phases](#hook-phases)
- [Hook Definition](#hook-definition)
- [Hook Context](#hook-context)
- [Hook Execution Order](#hook-execution-order)
- [Hook Patterns](#hook-patterns)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

Hooks are functions that execute at specific points during request processing. They allow you to:

- **Validate** data before processing
- **Transform** requests and responses
- **Audit** operations
- **Enforce** business rules
- **Implement** custom operations
- **Add** authentication and authorization
- **Monitor** performance and errors

### Key Concepts

1. **Phase**: When the hook executes (e.g., before request, after response)
2. **Priority**: Order of execution (higher priority = executes first)
3. **Resources**: Which FHIR resources trigger the hook
4. **Context**: Shared state passed through the request lifecycle
5. **Control Flow**: Ability to modify or short-circuit requests

## Hook Phases

Hooks execute in a specific order during request processing:

```
Request → [preRequest] → Router → [preHandler] → Handler → [onResponse] → Response
                                                      ↓
                                                  [onError]
```

### 1. preRequest

**When**: Before any request processing
**Use for**: Authentication, rate limiting, request logging

```javascript
server.addHook({
  name: 'auth-check',
  phase: 'preRequest',
  priority: 100,
  handler: async (context) => {
    // Authenticate user
    const token = context.headers.authorization;
    if (!token) {
      throw new FhirUnauthorizedError('Authentication required');
    }

    // Add user to context
    context.user = await validateToken(token);
    return context;
  }
});
```

**Context available**:
- `context.method` - HTTP method
- `context.url` - Request URL
- `context.headers` - Request headers
- `context.body` - Request body (parsed JSON)
- `context.requestId` - Unique request ID
- `context.startTime` - Request start timestamp

**Can modify**:
- Request headers
- Request body
- Context state (add custom properties)

**Can abort**: Yes (throw error)

---

### 2. preHandler

**When**: After routing, before the resource handler
**Use for**: Validation, transformation, custom operations

```javascript
server.addHook({
  name: 'auto-timestamp',
  phase: 'preHandler',
  resources: '*',
  priority: 70,
  handler: async (context) => {
    if (['create', 'update'].includes(context.operation)) {
      if (!context.body.meta) {
        context.body.meta = {};
      }
      context.body.meta.lastUpdated = new Date().toISOString();
    }
    return context;
  }
});
```

**Context available**:
- All `preRequest` context
- `context.operation` - FHIR operation (read, create, update, etc.)
- `context.resourceType` - Resource type being accessed
- `context.params` - URL parameters (e.g., `id`)

**Can modify**:
- Request body (transform data)
- Context state

**Can abort**: Yes (throw error or call `context.takeOver()`)

---

### 3. onResponse

**When**: After successful request processing
**Use for**: Audit logging, response transformation, analytics

```javascript
server.addHook({
  name: 'audit-logger',
  phase: 'onResponse',
  resources: '*',
  priority: 50,
  handler: async (context) => {
    if (['create', 'update', 'delete'].includes(context.operation)) {
      await auditLog.write({
        timestamp: new Date().toISOString(),
        user: context.user?.id,
        action: context.operation,
        resourceType: context.resourceType,
        resourceId: context.responseBody?.id,
        success: context.statusCode < 400
      });
    }
    return context;
  }
});
```

**Context available**:
- All previous context
- `context.statusCode` - HTTP status code
- `context.responseHeaders` - Response headers
- `context.responseBody` - Response body
- `context.timing` - Performance metrics

**Can modify**:
- Response headers
- Response body
- Context state

**Can abort**: No (response already sent)

---

### 4. onError

**When**: When an error occurs during processing
**Use for**: Error logging, error transformation, custom error responses

```javascript
server.addHook({
  name: 'error-logger',
  phase: 'onError',
  resources: '*',
  priority: 50,
  handler: async (context) => {
    await errorLog.write({
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      error: context.error.message,
      stack: context.error.stack,
      user: context.user?.id,
      url: context.url
    });

    return context;
  }
});
```

**Context available**:
- All previous context
- `context.error` - The error object
- `context.statusCode` - Error status code
- `context.responseBody` - Error OperationOutcome

**Can modify**:
- Error response (OperationOutcome)
- Response headers

**Can abort**: No (already in error state)

## Hook Definition

### Basic Structure

```typescript
interface HookDefinition {
  name: string;                    // Unique hook name
  phase: HookPhase;               // When to execute
  priority?: number;              // Execution order (default: 50)
  resources?: string | string[];  // Which resources trigger this hook
  handler: HookHandler;           // The hook function
}

type HookPhase = 'preRequest' | 'preHandler' | 'onResponse' | 'onError';

type HookHandler = (context: HookContext) => Promise<HookContext>;
```

### Adding Hooks

```javascript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({ /* config */ });

// Add a single hook
server.addHook({
  name: 'my-hook',
  phase: 'preHandler',
  handler: async (context) => {
    // Your logic here
    return context;
  }
});

// Add multiple hooks
server.addHook(hook1);
server.addHook(hook2);
server.addHook(hook3);
```

### Resource Filtering

Control which resources trigger your hook:

```javascript
// All resources
server.addHook({
  name: 'all-resources',
  phase: 'preHandler',
  resources: '*',
  handler: async (context) => { /* ... */ }
});

// Single resource
server.addHook({
  name: 'patient-only',
  phase: 'preHandler',
  resources: 'Patient',
  handler: async (context) => { /* ... */ }
});

// Multiple resources
server.addHook({
  name: 'clinical-resources',
  phase: 'preHandler',
  resources: ['Patient', 'Practitioner', 'Encounter', 'Observation'],
  handler: async (context) => { /* ... */ }
});
```

## Hook Context

The context object is passed through all hooks and contains request/response data.

### Context Properties

```typescript
interface HookContext {
  // Request info
  method: string;              // GET, POST, PUT, DELETE
  url: string;                 // Request URL
  headers: Record<string, string>;
  body: any;                   // Parsed request body

  // Routing info (available in preHandler and later)
  operation?: FhirOperation;   // read, create, update, delete, etc.
  resourceType?: string;       // Patient, Observation, etc.
  params?: Record<string, string>;  // URL parameters

  // Response info (available in onResponse)
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: any;

  // Error info (available in onError)
  error?: Error;

  // Timing info
  requestId: string;
  startTime: number;
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
    hookDuration: number;
  };

  // Custom properties (you can add your own)
  user?: any;
  tenant?: string;
  // ... any custom data
}
```

### Context Methods

```typescript
// Set the response and stop processing
context.setResponse(response: {
  statusCode: number;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  timing?: TimingInfo;
}): void

// Take over response handling (prevents default handler)
context.takeOver(): void

// Check if response is taken over
context.isTakenOver(): boolean
```

### Custom Context Properties

You can add custom properties to the context to share data between hooks:

```javascript
// In an early hook
server.addHook({
  name: 'tenant-detector',
  phase: 'preRequest',
  priority: 95,
  handler: async (context) => {
    // Extract tenant from subdomain
    const host = context.headers.host;
    const tenant = host.split('.')[0];

    // Add to context
    context.tenant = tenant;

    return context;
  }
});

// In a later hook
server.addHook({
  name: 'tenant-filter',
  phase: 'preHandler',
  priority: 70,
  handler: async (context) => {
    // Use tenant from context
    if (context.body && context.operation === 'create') {
      context.body.tenant = context.tenant;
    }

    return context;
  }
});
```

## Hook Execution Order

Hooks execute in priority order within each phase:

### Priority Values

- **100-90**: High priority (authentication, security)
- **89-70**: Normal priority (validation, transformation)
- **69-50**: Low priority (logging, analytics)
- **49-0**: Very low priority (cleanup, finalization)

**Default priority**: 50

### Execution Flow

```javascript
// Priority order example
server.addHook({
  name: 'auth',
  phase: 'preRequest',
  priority: 95,  // Executes first
  handler: async (context) => { /* ... */ }
});

server.addHook({
  name: 'rate-limit',
  phase: 'preRequest',
  priority: 90,  // Executes second
  handler: async (context) => { /* ... */ }
});

server.addHook({
  name: 'logging',
  phase: 'preRequest',
  priority: 50,  // Executes last
  handler: async (context) => { /* ... */ }
});
```

### Hook Chain

Hooks form a chain where each hook receives the context from the previous hook:

```javascript
// Hook 1 modifies context
server.addHook({
  name: 'hook1',
  phase: 'preHandler',
  priority: 100,
  handler: async (context) => {
    context.custom = 'value1';
    return context;
  }
});

// Hook 2 sees Hook 1's changes
server.addHook({
  name: 'hook2',
  phase: 'preHandler',
  priority: 90,
  handler: async (context) => {
    console.log(context.custom);  // 'value1'
    context.custom = 'value2';
    return context;
  }
});

// Hook 3 sees Hook 2's changes
server.addHook({
  name: 'hook3',
  phase: 'preHandler',
  priority: 80,
  handler: async (context) => {
    console.log(context.custom);  // 'value2'
    return context;
  }
});
```

## Hook Patterns

### Pattern 1: Taking Over Request Handling

Use `context.takeOver()` to implement custom operations:

```javascript
server.addHook({
  name: 'custom-operation',
  phase: 'preHandler',
  priority: 100,
  handler: async (context) => {
    // Match custom operation URL
    if (context.url === '/Patient/$match' && context.method === 'POST') {
      // Your custom logic
      const results = await matchPatients(context.body);

      // Set response
      context.setResponse({
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json'
        },
        responseBody: {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: results
        }
      });

      // Take over - prevents default handler
      context.takeOver();
    }

    return context;
  }
});
```

### Pattern 2: Conditional Execution

Execute hooks based on conditions:

```javascript
server.addHook({
  name: 'patient-notification',
  phase: 'onResponse',
  resources: 'Patient',
  priority: 60,
  handler: async (context) => {
    // Only notify on successful creates
    if (context.operation === 'create' && context.statusCode === 201) {
      await sendNotification({
        type: 'new-patient',
        patient: context.responseBody
      });
    }

    return context;
  }
});
```

### Pattern 3: Error Handling

Handle errors gracefully:

```javascript
server.addHook({
  name: 'safe-transformation',
  phase: 'preHandler',
  priority: 70,
  handler: async (context) => {
    try {
      // Risky transformation
      context.body = await transformData(context.body);
    } catch (error) {
      // Log error but don't abort request
      console.error('Transformation failed:', error);
      // Continue with original data
    }

    return context;
  }
});
```

### Pattern 4: Async Operations

Perform async operations without blocking:

```javascript
server.addHook({
  name: 'async-notification',
  phase: 'onResponse',
  resources: '*',
  priority: 50,
  handler: async (context) => {
    // Fire and forget (don't await)
    sendAsyncNotification(context).catch(err => {
      console.error('Notification failed:', err);
    });

    return context;
  }
});
```

### Pattern 5: Resource-Specific Validation

Add custom validation rules:

```javascript
server.addHook({
  name: 'patient-business-rules',
  phase: 'preHandler',
  resources: 'Patient',
  priority: 75,
  handler: async (context) => {
    if (context.operation === 'create') {
      const patient = context.body;

      // Business rule: Must have name
      if (!patient.name || patient.name.length === 0) {
        throw new FhirBadRequestError(
          'Patient must have at least one name'
        );
      }

      // Business rule: Email must be valid
      const emailContact = patient.telecom?.find(t => t.system === 'email');
      if (emailContact && !isValidEmail(emailContact.value)) {
        throw new FhirBadRequestError(
          `Invalid email: ${emailContact.value}`
        );
      }
    }

    return context;
  }
});
```

### Pattern 6: Multi-Tenant Support

Implement tenant isolation:

```javascript
// Detect tenant
server.addHook({
  name: 'tenant-detection',
  phase: 'preRequest',
  priority: 95,
  handler: async (context) => {
    const tenantId = context.headers['x-tenant-id'];
    if (!tenantId) {
      throw new FhirUnauthorizedError('Tenant ID required');
    }
    context.tenant = tenantId;
    return context;
  }
});

// Add tenant to resources
server.addHook({
  name: 'tenant-tagging',
  phase: 'preHandler',
  resources: '*',
  priority: 70,
  handler: async (context) => {
    if (['create', 'update'].includes(context.operation)) {
      if (!context.body.meta) context.body.meta = {};
      if (!context.body.meta.tag) context.body.meta.tag = [];

      context.body.meta.tag.push({
        system: 'http://example.org/tenant',
        code: context.tenant
      });
    }
    return context;
  }
});

// Filter by tenant
server.addHook({
  name: 'tenant-filtering',
  phase: 'preHandler',
  resources: '*',
  priority: 65,
  handler: async (context) => {
    if (context.operation === 'search-type') {
      // Add tenant filter to search
      if (!context.params) context.params = {};
      context.params._tag = `http://example.org/tenant|${context.tenant}`;
    }
    return context;
  }
});
```

## Best Practices

### 1. Keep Hooks Focused

Each hook should do one thing well:

```javascript
// ❌ Bad: Hook does too much
server.addHook({
  name: 'everything',
  phase: 'preHandler',
  handler: async (context) => {
    // Validate
    // Transform
    // Log
    // Notify
    // ... too much
  }
});

// ✅ Good: Separate concerns
server.addHook({
  name: 'validate',
  phase: 'preHandler',
  priority: 80,
  handler: async (context) => { /* validation only */ }
});

server.addHook({
  name: 'transform',
  phase: 'preHandler',
  priority: 70,
  handler: async (context) => { /* transformation only */ }
});

server.addHook({
  name: 'audit-log',
  phase: 'onResponse',
  priority: 50,
  handler: async (context) => { /* logging only */ }
});
```

### 2. Use Appropriate Priorities

Assign priorities based on dependencies:

```javascript
// Authentication must happen first
server.addHook({
  name: 'auth',
  phase: 'preRequest',
  priority: 95,  // High priority
  handler: async (context) => { /* ... */ }
});

// Authorization depends on auth
server.addHook({
  name: 'authz',
  phase: 'preHandler',
  priority: 90,  // Slightly lower
  handler: async (context) => {
    // Can use context.user from auth hook
  }
});

// Logging should be last
server.addHook({
  name: 'logging',
  phase: 'onResponse',
  priority: 50,  // Low priority
  handler: async (context) => { /* ... */ }
});
```

### 3. Filter by Resource

Only run hooks for relevant resources:

```javascript
// ❌ Bad: Checks resource type in every hook
server.addHook({
  name: 'patient-hook',
  phase: 'preHandler',
  resources: '*',
  handler: async (context) => {
    if (context.resourceType !== 'Patient') {
      return context;  // Wasted execution
    }
    // Patient logic
  }
});

// ✅ Good: Filter at registration
server.addHook({
  name: 'patient-hook',
  phase: 'preHandler',
  resources: 'Patient',  // Only runs for Patient
  handler: async (context) => {
    // Patient logic - no check needed
  }
});
```

### 4. Handle Errors Gracefully

Don't let hook errors break the request:

```javascript
server.addHook({
  name: 'notification-hook',
  phase: 'onResponse',
  priority: 50,
  handler: async (context) => {
    try {
      await sendNotification(context);
    } catch (error) {
      // Log error but don't fail the response
      console.error('Notification failed:', error);
      // Continue processing
    }

    return context;
  }
});
```

### 5. Return Context

Always return the context object:

```javascript
// ❌ Bad: Forgets to return context
server.addHook({
  name: 'bad-hook',
  phase: 'preHandler',
  handler: async (context) => {
    context.modified = true;
    // Missing return!
  }
});

// ✅ Good: Returns context
server.addHook({
  name: 'good-hook',
  phase: 'preHandler',
  handler: async (context) => {
    context.modified = true;
    return context;
  }
});
```

### 6. Use TypeScript for Type Safety

```typescript
import { HookDefinition, HookContext } from '@atomic-ehr/server';

const myHook: HookDefinition = {
  name: 'typed-hook',
  phase: 'preHandler',
  resources: 'Patient',
  priority: 70,
  handler: async (context: HookContext) => {
    // TypeScript ensures correct usage
    const patient = context.body as fhir4.Patient;
    // ... type-safe operations
    return context;
  }
};

server.addHook(myHook);
```

## Examples

### Example 1: Audit Logging

Complete audit trail of all write operations:

```javascript
server.addHook({
  name: 'comprehensive-audit',
  phase: 'onResponse',
  resources: '*',
  priority: 50,
  handler: async (context) => {
    if (['create', 'update', 'delete', 'patch'].includes(context.operation)) {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        requestId: context.requestId,
        user: context.user?.id || 'anonymous',
        userRole: context.user?.role,
        action: context.operation,
        resourceType: context.resourceType,
        resourceId: context.params?.id || context.responseBody?.id,
        success: context.statusCode < 400,
        statusCode: context.statusCode,
        duration: context.timing?.duration,
        ip: context.headers['x-forwarded-for'] || 'unknown',
        userAgent: context.headers['user-agent']
      };

      await auditLog.write(auditEntry);
    }

    return context;
  }
});
```

### Example 2: Automatic Versioning

Track resource versions:

```javascript
server.addHook({
  name: 'auto-versioning',
  phase: 'preHandler',
  resources: '*',
  priority: 70,
  handler: async (context) => {
    if (['create', 'update'].includes(context.operation)) {
      const resource = context.body;

      if (!resource.meta) {
        resource.meta = {};
      }

      // Increment version
      if (context.operation === 'update') {
        const currentVersion = parseInt(resource.meta.versionId || '0');
        resource.meta.versionId = (currentVersion + 1).toString();
      } else {
        resource.meta.versionId = '1';
      }

      // Update timestamp
      resource.meta.lastUpdated = new Date().toISOString();
    }

    return context;
  }
});
```

### Example 3: Performance Monitoring

Track slow requests:

```javascript
server.addHook({
  name: 'performance-monitor',
  phase: 'onResponse',
  resources: '*',
  priority: 50,
  handler: async (context) => {
    const duration = context.timing?.duration || 0;

    // Log slow requests
    if (duration > 1000) {  // > 1 second
      console.warn('Slow request detected:', {
        requestId: context.requestId,
        duration,
        method: context.method,
        url: context.url,
        operation: context.operation,
        resourceType: context.resourceType
      });

      // Send to monitoring service
      await metrics.recordSlowRequest({
        duration,
        endpoint: `${context.method} ${context.url}`,
        timestamp: new Date()
      });
    }

    return context;
  }
});
```

### Example 4: Data Masking

Mask sensitive data in responses:

```javascript
server.addHook({
  name: 'data-masking',
  phase: 'onResponse',
  resources: 'Patient',
  priority: 60,
  handler: async (context) => {
    // Only mask for non-admin users
    if (context.user?.role !== 'admin') {
      const patient = context.responseBody;

      if (patient && patient.resourceType === 'Patient') {
        // Mask SSN in identifier
        if (patient.identifier) {
          patient.identifier = patient.identifier.map(id => {
            if (id.system === 'http://hl7.org/fhir/sid/us-ssn') {
              return {
                ...id,
                value: '***-**-' + id.value.slice(-4)
              };
            }
            return id;
          });
        }
      }
    }

    return context;
  }
});
```

### Example 5: Request Rate Limiting

Prevent API abuse:

```javascript
const rateLimitStore = new Map();

server.addHook({
  name: 'rate-limiter',
  phase: 'preRequest',
  priority: 92,
  handler: async (context) => {
    const key = context.user?.id || context.headers['x-forwarded-for'] || 'anonymous';
    const now = Date.now();
    const windowMs = 60000;  // 1 minute
    const maxRequests = 100;

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);
    if (!entry || (now - entry.windowStart) > windowMs) {
      entry = {
        windowStart: now,
        requests: 0
      };
      rateLimitStore.set(key, entry);
    }

    // Increment request count
    entry.requests++;

    // Check limit
    if (entry.requests > maxRequests) {
      context.setResponse({
        statusCode: 429,
        responseHeaders: {
          'Content-Type': 'application/fhir+json',
          'Retry-After': '60'
        },
        responseBody: {
          resourceType: 'OperationOutcome',
          issue: [{
            severity: 'error',
            code: 'throttled',
            diagnostics: 'Rate limit exceeded. Please try again later.'
          }]
        }
      });
      context.takeOver();
    }

    return context;
  }
});
```

## Summary

The hook system is the heart of customization in Atomic FHIR Server:

- **4 phases**: preRequest, preHandler, onResponse, onError
- **Priority-based execution**: Control order of operations
- **Resource filtering**: Run hooks only when needed
- **Context sharing**: Pass data between hooks
- **Flexible control**: Transform, validate, or take over requests

Master the hook system to build powerful, custom FHIR servers! 🚀