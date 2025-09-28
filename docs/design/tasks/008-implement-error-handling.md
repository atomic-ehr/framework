# Task 008: Implement Error Handling

## Phase
Phase 4: Polish and Documentation - Milestone 4.1

## Duration
1 week

## Description
Implement comprehensive FHIR-compliant error handling with proper OperationOutcome responses, logging, debugging capabilities, and better validation messages. Create a robust error handling system that provides clear diagnostics for developers while maintaining FHIR specification compliance.

## Prerequisites
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- Task 005: Implement Dynamic Route Generation (completed)
- Task 006: Integrate Validation Bridge (completed)
- Task 007: Implement Capability Statement (completed)
- Understanding of FHIR OperationOutcome specification

## Technical Requirements

### 1. FHIR Error Hierarchy
Create a comprehensive FHIR error class hierarchy:

```typescript
// Base FHIR error class
abstract class FhirError extends Error {
  abstract statusCode: number;
  abstract operationOutcome: OperationOutcome;

  constructor(
    message: string,
    public code: string = 'exception',
    public severity: IssueSeverity = 'error',
    public diagnostics?: string,
    public expression?: string[],
    public location?: string[]
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  // Create OperationOutcome from error details
  protected createOperationOutcome(): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: this.severity,
        code: this.code as IssueCode,
        diagnostics: this.diagnostics || this.message,
        expression: this.expression,
        location: this.location
      }]
    };
  }
}

// Specific FHIR error types
class FhirValidationError extends FhirError {
  statusCode = 422;

  constructor(
    message: string,
    public validationErrors: ValidationError[] = [],
    diagnostics?: string
  ) {
    super(message, 'invalid', 'error', diagnostics);
  }

  get operationOutcome(): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: this.validationErrors.map(error => ({
        severity: 'error' as const,
        code: this.mapValidationErrorCode(error.type),
        diagnostics: `Validation failed: ${error.message}`,
        expression: error.path ? [error.path] : undefined,
        location: error.location ? [error.location] : undefined
      }))
    };
  }

  private mapValidationErrorCode(type: string): IssueCode {
    const mapping: Record<string, IssueCode> = {
      'required': 'required',
      'type': 'structure',
      'format': 'invalid',
      'enum': 'code-invalid',
      'constraint': 'invariant'
    };
    return mapping[type] || 'invalid';
  }
}

class FhirNotFoundError extends FhirError {
  statusCode = 404;

  constructor(resourceType: string, id: string) {
    super(`${resourceType} with id ${id} not found`, 'not-found', 'error');
    this.diagnostics = `Resource ${resourceType}/${id} does not exist`;
  }

  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }
}

class FhirUnauthorizedError extends FhirError {
  statusCode = 401;

  constructor(message: string = 'Authentication required') {
    super(message, 'security', 'error');
  }

  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }
}

class FhirForbiddenError extends FhirError {
  statusCode = 403;

  constructor(message: string = 'Insufficient permissions') {
    super(message, 'forbidden', 'error');
  }

  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }
}

class FhirConflictError extends FhirError {
  statusCode = 409;

  constructor(message: string, resourceType?: string, id?: string) {
    super(message, 'conflict', 'error');
    if (resourceType && id) {
      this.diagnostics = `Conflict with existing ${resourceType}/${id}`;
    }
  }

  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }
}

class FhirTooManyRequestsError extends FhirError {
  statusCode = 429;

  constructor(retryAfter?: number) {
    super('Too many requests', 'throttled', 'error');
    this.diagnostics = retryAfter
      ? `Rate limit exceeded. Retry after ${retryAfter} seconds`
      : 'Rate limit exceeded';
  }

  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }
}

class FhirInternalError extends FhirError {
  statusCode = 500;

  constructor(message: string = 'Internal server error', cause?: Error) {
    super(message, 'exception', 'error');
    this.diagnostics = cause ? `${message}: ${cause.message}` : message;
    this.cause = cause;
  }

  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }
}

class FhirNotImplementedError extends FhirError {
  statusCode = 501;

  constructor(operation: string, resourceType?: string) {
    const message = resourceType
      ? `${operation} operation not implemented for ${resourceType}`
      : `${operation} operation not implemented`;
    super(message, 'not-supported', 'error');
  }

  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }
}
```

### 2. Error Handler Hook System
Create comprehensive error handling hooks:

```typescript
interface ErrorHandlerConfig {
  includeStackTrace?: boolean;
  logErrors?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  sanitizeErrors?: boolean;
  detailedValidationErrors?: boolean;
  enableErrorMetrics?: boolean;
}

class ErrorHandler {
  constructor(private config: ErrorHandlerConfig = {}) {
    this.config = {
      includeStackTrace: false, // Don't expose in production
      logErrors: true,
      logLevel: 'error',
      sanitizeErrors: true,
      detailedValidationErrors: true,
      enableErrorMetrics: true,
      ...config
    };
  }

  createErrorHandlingHook(): HookDefinition {
    return {
      name: 'fhir-error-handler',
      phase: 'onError',
      priority: 100, // High priority to handle first
      handler: this.handleError.bind(this)
    };
  }

  private async handleError(context: ErrorContext): Promise<void> {
    const { error, logger } = context;

    // Log the error
    if (this.config.logErrors) {
      this.logError(error, context, logger);
    }

    // Convert to FHIR error if needed
    const fhirError = this.convertToFhirError(error, context);

    // Create response
    const response = this.createErrorResponse(fhirError, context);

    // Set response and mark as handled
    context.setResponse(response);
    context.handled = true;

    // Record metrics
    if (this.config.enableErrorMetrics) {
      this.recordErrorMetrics(fhirError, context);
    }

    // Add diagnostic information
    context.addDiagnostic({
      level: 'error',
      code: 'error-handled',
      message: `Error handled: ${fhirError.constructor.name}`,
      source: 'fhir-error-handler',
      timestamp: Date.now(),
      metadata: {
        statusCode: fhirError.statusCode,
        errorCode: fhirError.code,
        resourceType: context.resourceType,
        operation: context.operation
      }
    });
  }

  private convertToFhirError(error: Error, context: RequestContext): FhirError {
    // If already a FHIR error, return as-is
    if (error instanceof FhirError) {
      return error;
    }

    // Convert common error types
    if (error.name === 'ValidationError') {
      return new FhirValidationError(error.message);
    }

    if (error.name === 'NotFoundError') {
      return new FhirNotFoundError(
        context.resourceType || 'Resource',
        context.params?.id || 'unknown'
      );
    }

    if (error.name === 'UnauthorizedError' || error.name === 'AuthenticationError') {
      return new FhirUnauthorizedError(error.message);
    }

    if (error.name === 'ForbiddenError' || error.name === 'AuthorizationError') {
      return new FhirForbiddenError(error.message);
    }

    if (error.name === 'ConflictError') {
      return new FhirConflictError(error.message, context.resourceType, context.params?.id);
    }

    if (error.name === 'TooManyRequestsError' || error.name === 'RateLimitError') {
      return new FhirTooManyRequestsError();
    }

    // Default to internal error
    return new FhirInternalError(
      this.config.sanitizeErrors ? 'Internal server error' : error.message,
      error
    );
  }

  private createErrorResponse(error: FhirError, context: RequestContext): ResponseContext {
    const operationOutcome = error.operationOutcome;

    // Add stack trace in development
    if (this.config.includeStackTrace && error.stack) {
      operationOutcome.issue.forEach(issue => {
        issue.diagnostics = `${issue.diagnostics}\n\nStack trace:\n${error.stack}`;
      });
    }

    // Add request context information
    operationOutcome.issue.forEach(issue => {
      if (!issue.location && context.url) {
        issue.location = [context.url];
      }
    });

    return {
      ...context,
      statusCode: error.statusCode,
      responseHeaders: {
        'Content-Type': 'application/fhir+json',
        'X-Error-Type': error.constructor.name,
        'X-Request-ID': context.requestId
      },
      responseBody: operationOutcome
    };
  }

  private logError(error: Error, context: RequestContext, logger: Logger): void {
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      request: {
        id: context.requestId,
        method: context.method,
        url: context.url,
        resourceType: context.resourceType,
        operation: context.operation,
        userAgent: context.headers['user-agent'],
        ip: context.headers['x-forwarded-for'] || context.headers['x-real-ip']
      },
      timestamp: new Date().toISOString()
    };

    logger[this.config.logLevel!]('FHIR operation error', logData);
  }

  private recordErrorMetrics(error: FhirError, context: RequestContext): void {
    // TODO: Implement metrics collection
    // This could integrate with monitoring systems like Prometheus, StatsD, etc.
  }
}
```

### 3. Validation Error Enhancement
Enhance validation error reporting with detailed information:

```typescript
class EnhancedValidationError extends FhirValidationError {
  constructor(
    resourceType: string,
    validationErrors: ValidationError[],
    resource?: any
  ) {
    super(`${resourceType} validation failed`, validationErrors);
    this.enhanceValidationErrors(resourceType, resource);
  }

  private enhanceValidationErrors(resourceType: string, resource?: any): void {
    // Add more context to validation errors
    this.validationErrors = this.validationErrors.map(error => ({
      ...error,
      context: {
        resourceType,
        elementPath: error.path,
        attemptedValue: resource ? this.getValueAtPath(resource, error.path) : undefined,
        allowedValues: error.allowedValues,
        constraint: error.constraint
      }
    }));
  }

  private getValueAtPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  get operationOutcome(): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: this.validationErrors.map(error => ({
        severity: 'error' as const,
        code: this.mapValidationErrorCode(error.type),
        diagnostics: this.createDetailedDiagnostics(error),
        expression: error.path ? [error.path] : undefined,
        location: error.location ? [error.location] : undefined,
        details: {
          coding: [{
            system: 'http://atomic-ehr.org/fhir/CodeSystem/validation-error-types',
            code: error.type,
            display: this.getErrorTypeDisplay(error.type)
          }]
        }
      }))
    };
  }

  private createDetailedDiagnostics(error: ValidationError): string {
    const base = `Validation failed for '${error.path}': ${error.message}`;

    if (error.context?.attemptedValue !== undefined) {
      return `${base}. Attempted value: ${JSON.stringify(error.context.attemptedValue)}`;
    }

    if (error.context?.allowedValues) {
      return `${base}. Allowed values: ${error.context.allowedValues.join(', ')}`;
    }

    return base;
  }

  private getErrorTypeDisplay(type: string): string {
    const displays: Record<string, string> = {
      'required': 'Required field missing',
      'type': 'Invalid data type',
      'format': 'Invalid format',
      'enum': 'Invalid enumeration value',
      'constraint': 'Constraint violation',
      'cardinality': 'Cardinality violation'
    };
    return displays[type] || 'Validation error';
  }
}
```

### 4. Request/Response Logging
Implement comprehensive request and response logging:

```typescript
class RequestResponseLogger {
  constructor(private config: LoggingConfig = {}) {}

  createLoggingHooks(): HookDefinition[] {
    return [
      this.createRequestLoggingHook(),
      this.createResponseLoggingHook(),
      this.createPerformanceLoggingHook()
    ];
  }

  private createRequestLoggingHook(): HookDefinition {
    return {
      name: 'request-logger',
      phase: 'preRequest',
      priority: 95,
      handler: async (context: RequestContext) => {
        context.logger.info('FHIR request started', {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
          resourceType: context.resourceType,
          operation: context.operation,
          userAgent: context.headers['user-agent'],
          contentType: context.headers['content-type'],
          acceptHeader: context.headers.accept,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  private createResponseLoggingHook(): HookDefinition {
    return {
      name: 'response-logger',
      phase: 'onResponse',
      priority: 95,
      handler: async (context: ResponseContext) => {
        const duration = Date.now() - context.startTime;

        context.logger.info('FHIR request completed', {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
          resourceType: context.resourceType,
          operation: context.operation,
          statusCode: context.statusCode,
          duration,
          responseSize: JSON.stringify(context.responseBody).length,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  private createPerformanceLoggingHook(): HookDefinition {
    return {
      name: 'performance-logger',
      phase: 'onResponse',
      priority: 90,
      handler: async (context: ResponseContext) => {
        const duration = Date.now() - context.startTime;

        // Log slow requests
        if (duration > 1000) { // 1 second threshold
          context.logger.warn('Slow FHIR request detected', {
            requestId: context.requestId,
            method: context.method,
            url: context.url,
            resourceType: context.resourceType,
            operation: context.operation,
            duration,
            threshold: 1000
          });
        }

        // Add performance headers
        context.responseHeaders['X-Response-Time'] = `${duration}ms`;
        context.responseHeaders['X-Request-ID'] = context.requestId;
      }
    };
  }
}

interface LoggingConfig {
  logRequests?: boolean;
  logResponses?: boolean;
  logBodies?: boolean;
  logHeaders?: boolean;
  slowRequestThreshold?: number;
  sanitizeHeaders?: string[];
}
```

### 5. Development Debugging Support
Add debugging support for development environments:

```typescript
class DebugSupport {
  constructor(private isDevelopment: boolean = false) {}

  createDebugHooks(): HookDefinition[] {
    if (!this.isDevelopment) {
      return [];
    }

    return [
      this.createHookExecutionLogger(),
      this.createValidationDebugger(),
      this.createRequestDumper()
    ];
  }

  private createHookExecutionLogger(): HookDefinition {
    return {
      name: 'hook-execution-logger',
      phase: 'preRequest',
      priority: 999, // Highest priority
      handler: async (context: RequestContext) => {
        const originalExecutePhase = context.executeHookPhase;

        context.executeHookPhase = async (phase, ctx) => {
          console.log(`🪝 Executing hooks for phase: ${phase}`);
          const start = Date.now();

          const result = await originalExecutePhase(phase, ctx);

          console.log(`🪝 Completed phase ${phase} in ${Date.now() - start}ms`);
          return result;
        };
      }
    };
  }

  private createValidationDebugger(): HookDefinition {
    return {
      name: 'validation-debugger',
      phase: 'preHandler',
      priority: 85,
      handler: async (context: RequestContext) => {
        if (['create', 'update', 'patch'].includes(context.operation!) && context.body) {
          console.log('🔍 Validation Debug:', {
            resourceType: context.resourceType,
            operation: context.operation,
            resourceId: context.body.id,
            hasSchema: !!context.getSchema?.(context.resourceType!),
            bodyKeys: Object.keys(context.body)
          });
        }
      }
    };
  }

  private createRequestDumper(): HookDefinition {
    return {
      name: 'request-dumper',
      phase: 'preRequest',
      priority: 98,
      handler: async (context: RequestContext) => {
        console.log('📥 Request Details:', {
          id: context.requestId,
          method: context.method,
          url: context.url,
          headers: this.sanitizeHeaders(context.headers),
          params: context.params,
          query: context.query,
          bodyPreview: this.getBodyPreview(context.body)
        });
      }
    };
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitive = ['authorization', 'cookie', 'x-api-key'];
    const sanitized = { ...headers };

    sensitive.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private getBodyPreview(body: any): any {
    if (!body) return null;
    if (typeof body === 'string') return body.substring(0, 200) + '...';
    return JSON.stringify(body).substring(0, 200) + '...';
  }
}
```

## Implementation Details

### File Structure
```
packages/server/src/
├── error/
│   ├── index.ts              # Error handling exports
│   ├── errors.ts             # FHIR error classes
│   ├── handler.ts            # ErrorHandler implementation
│   ├── validation.ts         # Enhanced validation errors
│   ├── logging.ts            # Request/response logging
│   ├── debug.ts              # Development debugging
│   └── types.ts              # Error-related types
└── ... (existing files)
```

### Key Components

#### 1. FHIR Error Classes (`error/errors.ts`)
- Comprehensive error hierarchy for all HTTP status codes
- Automatic OperationOutcome generation
- Proper FHIR issue code mapping
- Context-aware error messages

#### 2. Error Handler (`error/handler.ts`)
- Central error processing hook
- Error conversion and normalization
- Response formatting and headers
- Error logging and metrics

#### 3. Enhanced Validation (`error/validation.ts`)
- Detailed validation error reporting
- Context-aware diagnostics
- Field path and value information
- Constraint violation details

#### 4. Logging System (`error/logging.ts`)
- Request/response logging
- Performance monitoring
- Slow request detection
- Structured log output

#### 5. Debug Support (`error/debug.ts`)
- Development-only debugging features
- Hook execution tracing
- Request/response dumping
- Validation debugging

## Success Criteria

### Must Have
- [ ] All errors return proper FHIR OperationOutcome responses
- [ ] Log requests and errors with structured data
- [ ] Clear error messages for developers
- [ ] FHIR-compliant HTTP status codes
- [ ] Error handling doesn't expose sensitive information
- [ ] Performance impact of error handling is minimal

### Error Response Requirements
- [ ] 400 Bad Request with proper OperationOutcome
- [ ] 401 Unauthorized with security issue code
- [ ] 403 Forbidden with forbidden issue code
- [ ] 404 Not Found with not-found issue code
- [ ] 409 Conflict with conflict issue code
- [ ] 422 Unprocessable Entity for validation errors
- [ ] 429 Too Many Requests with throttled issue code
- [ ] 500 Internal Server Error with exception issue code

### Testing Requirements
- [ ] Unit tests for all error classes
- [ ] Unit tests for error handler
- [ ] Integration tests with error scenarios
- [ ] Validation error tests
- [ ] Logging tests
- [ ] Debug feature tests

### Performance Requirements
- [ ] Error handling adds <10ms overhead
- [ ] Error logging is non-blocking
- [ ] Debug features don't impact production performance
- [ ] Memory usage for error handling is reasonable

## Acceptance Criteria

### 1. FHIR Error Responses
```typescript
// Should return proper OperationOutcome for validation errors
const invalidPatient = {
  resourceType: 'Patient',
  gender: 'invalid-value'
};

const response = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(invalidPatient)
});

expect(response.status).toBe(422);
const outcome = await response.json();
expect(outcome.resourceType).toBe('OperationOutcome');
expect(outcome.issue[0].severity).toBe('error');
expect(outcome.issue[0].code).toBe('code-invalid');
expect(outcome.issue[0].diagnostics).toContain('gender');
```

### 2. Not Found Errors
```typescript
// Should return 404 for non-existent resources
const response = await fetch('http://localhost:3000/Patient/non-existent-id');

expect(response.status).toBe(404);
const outcome = await response.json();
expect(outcome.resourceType).toBe('OperationOutcome');
expect(outcome.issue[0].code).toBe('not-found');
expect(outcome.issue[0].diagnostics).toContain('Patient/non-existent-id');
```

### 3. Internal Server Errors
```typescript
// Should handle internal errors gracefully
// Simulate internal error by causing database connection failure
const response = await fetch('http://localhost:3000/Patient/123');

// Should return 500 with proper OperationOutcome even for internal errors
expect(response.status).toBe(500);
const outcome = await response.json();
expect(outcome.resourceType).toBe('OperationOutcome');
expect(outcome.issue[0].code).toBe('exception');
// Should not expose internal implementation details
expect(outcome.issue[0].diagnostics).not.toContain('stack trace');
```

### 4. Request Logging
```typescript
// Should log requests and responses
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core'],
  logging: { enabled: true }
});

// Check that logs are generated for requests
// This would be verified through log inspection in tests
```

### 5. Development Debug Features
```typescript
// Should provide debug information in development mode
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core'],
  debug: true // Development mode
});

// Debug headers should be present in development
const response = await fetch('http://localhost:3000/Patient/123');
expect(response.headers.get('X-Request-ID')).toBeDefined();
expect(response.headers.get('X-Response-Time')).toBeDefined();
```

### 6. Error Context Information
```typescript
// Should include helpful context in error responses
const invalidResponse = await fetch('http://localhost:3000/InvalidResource/123');

expect(invalidResponse.status).toBe(404);
const outcome = await invalidResponse.json();
expect(outcome.issue[0].location).toContain('/InvalidResource/123');
expect(outcome.issue[0].expression).toBeDefined();
```

## Dependencies
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- Task 005: Implement Dynamic Route Generation (completed)
- Task 006: Integrate Validation Bridge (completed)
- Task 007: Implement Capability Statement (completed)
- Understanding of FHIR OperationOutcome specification
- Logging framework integration

## Follow-up Tasks
- Task 009: Create Documentation (documents error handling for users)

## Notes
- Error handling should be comprehensive but not expose sensitive information
- Development and production modes should have different levels of detail
- All error responses must conform to FHIR OperationOutcome specification
- Performance impact of error handling should be minimal
- Consider integration with external monitoring and alerting systems
- Error logging should be structured for easy parsing and analysis