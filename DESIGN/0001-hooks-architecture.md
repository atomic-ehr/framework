# ADR-0001: Hooks Architecture

## Status
Proposed

## Context
The `@atomic-ehr/hook-core` package needs a deterministic, type-safe hook system that can orchestrate FHIR operations, validation, constraints, and custom business logic. The system must support both static platform routes and dynamic routes sourced from FHIR packages via the canonical manager.

## Decision

### Hook Lifecycle Pipeline
We define a deterministic pipeline with priority-based execution and short-circuit capabilities:

```
onBootstrap
  ↓
onConfigResolved
  ↓
onRegister
  ↓
onRouteRegister
  ↓
[Per Request]
  ↓
preRequest
  ↓
preValidation
  ↓
preHandler
  ↓
preResponse
  ↓
onResponse
  ↓
[onError - branched]
  ↓
[onShutdown - app lifecycle]
```

### Hook Context Types
All contexts extend `@atomic-ehr/core` base types:

```typescript
// Base contexts from @atomic-ehr/core
interface AppContext {
  logger: Logger;
  clock: Clock;
  config: Config;
  events: EventEmitter;
  // ... other app-level services
}

interface RequestContext extends AppContext {
  requestId: string;
  startTime: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  // ... other request-specific data
}

interface ResponseContext extends RequestContext {
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  duration: number;
}

interface ErrorContext extends RequestContext {
  error: Error;
  handled: boolean;
}
```

### Hook Registration Contract
```typescript
interface HookDefinition<TContext = any, TResult = any> {
  name: string;
  phase: HookPhase;
  priority: number; // Higher = earlier execution
  resources?: string | string[] | '*'; // Resource type filter
  profiles?: string[]; // Profile-specific hooks
  handler: (context: TContext, next: NextFunction) => Promise<TResult>;
  deps?: string[]; // Dependency hooks that must run first
  tags?: string[]; // For grouping and conditional execution
}

type HookPhase =
  | 'onBootstrap'
  | 'onConfigResolved'
  | 'onRegister'
  | 'onRouteRegister'
  | 'preRequest'
  | 'preValidation'
  | 'preHandler'
  | 'preResponse'
  | 'onResponse'
  | 'onError'
  | 'onShutdown';
```

### Hook Control Flow
```typescript
interface HookContext {
  stopPropagation(): void; // Prevent subsequent hooks from running
  takeOver(): void; // Stop pipeline and return current response
  skip(): void; // Skip remaining hooks in this phase
  setResponse(response: ResponseContext): void;
  addDiagnostic(diagnostic: Diagnostic): void;
}

interface NextFunction {
  (): Promise<void>;
  (error: Error): Promise<void>;
}
```

### Hook Registry
```typescript
interface HookRegistry {
  register(hook: HookDefinition): void;
  unregister(hookName: string): void;
  getHooks(phase: HookPhase, filters?: HookFilters): HookDefinition[];
  executePhase<T>(phase: HookPhase, context: T): Promise<T>;
  validateDependencies(): void; // Validate dependency graph
  getExecutionPlan(phase: HookPhase): HookDefinition[]; // Sorted by priority & deps
}

interface HookFilters {
  resourceType?: string;
  profiles?: string[];
  tags?: string[];
}
```

### Execution Strategy

#### Priority and Dependencies
1. **Priority-based**: Higher numbers execute first within the same dependency level
2. **Dependency resolution**: Topological sort ensures dependencies run before dependents
3. **Parallel execution**: Independent hooks within the same priority level can run concurrently
4. **Error propagation**: Errors stop execution unless hook explicitly handles and continues

#### Short-Circuit Behavior
- `stopPropagation()`: Stops remaining hooks in current phase
- `takeOver()`: Stops entire pipeline and returns current response
- `skip()`: Skips to next phase
- Error thrown: Stops pipeline and triggers `onError` phase

### Resource and Profile Filtering
```typescript
// Hook applies to all resources
{ resources: '*' }

// Hook applies to specific resource
{ resources: 'Patient' }

// Hook applies to multiple resources
{ resources: ['Patient', 'Practitioner'] }

// Hook applies to specific profiles
{
  resources: 'Patient',
  profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient']
}
```

### Built-in Hook Phases

#### Bootstrap Phase (`onBootstrap`)
- **Purpose**: Initialize core services before any configuration
- **Context**: `AppContext`
- **Typical hooks**: Logger setup, clock initialization, event system setup

#### Config Resolution (`onConfigResolved`)
- **Purpose**: Process and validate configuration after it's fully resolved
- **Context**: `AppContext` with resolved config
- **Typical hooks**: Config validation, environment-specific overrides, secrets resolution

#### Registration Phase (`onRegister`)
- **Purpose**: Register static platform services and routes
- **Context**: `AppContext`
- **Typical hooks**: Static route registration, core service registration, middleware setup

#### Route Registration (`onRouteRegister`)
- **Purpose**: Register dynamic routes sourced from canonical packages
- **Context**: `AppContext` with route registry
- **Typical hooks**: FHIR package route discovery, dynamic route registration, override application

#### Pre-Request (`preRequest`)
- **Purpose**: Early request processing before routing
- **Context**: `RequestContext`
- **Typical hooks**: Request ID generation, CORS, rate limiting, request logging

#### Pre-Validation (`preValidation`)
- **Purpose**: Validate request before business logic
- **Context**: `RequestContext`
- **Typical hooks**: Schema validation, FHIR resource validation, authorization

#### Pre-Handler (`preHandler`)
- **Purpose**: Process request before main business logic
- **Context**: `RequestContext`
- **Typical hooks**: Resource constraint evaluation, business rule validation, audit logging

#### Pre-Response (`preResponse`)
- **Purpose**: Process response before sending to client
- **Context**: `ResponseContext`
- **Typical hooks**: Response validation, transformation, compression, caching headers

#### Response (`onResponse`)
- **Purpose**: Handle successful response
- **Context**: `ResponseContext`
- **Typical hooks**: Access logging, metrics collection, audit trail

#### Error (`onError`)
- **Purpose**: Handle errors and exceptions
- **Context**: `ErrorContext`
- **Typical hooks**: Error logging, error transformation, error reporting, cleanup

#### Shutdown (`onShutdown`)
- **Purpose**: Graceful shutdown cleanup
- **Context**: `AppContext`
- **Typical hooks**: Connection cleanup, resource disposal, final logging

## Implementation Guidelines

### Hook Development Best Practices
1. **Idempotent**: Hooks should be safe to run multiple times
2. **Fast**: Hooks should complete quickly to avoid blocking the pipeline
3. **Error-safe**: Hooks should handle errors gracefully and not leak exceptions
4. **Stateless**: Hooks should not rely on global state beyond the provided context
5. **Well-documented**: Hooks should clearly document their purpose, inputs, and side effects

### Context Augmentation
Hooks can augment context for subsequent hooks:
```typescript
// Hook adds resource metadata to context
async function addResourceMetadata(context: RequestContext) {
  context.resourceMetadata = await loadResourceMetadata(context.params.resourceType);
}
```

### Diagnostic and Tracing
All hooks should support diagnostic output for debugging and observability:
```typescript
async function validationHook(context: RequestContext) {
  context.addDiagnostic({
    level: 'info',
    code: 'validation-start',
    message: 'Starting FHIR validation',
    source: 'fhir-validation-hook',
    timestamp: Date.now()
  });
}
```

## Consequences

### Benefits
- **Deterministic execution**: Clear, predictable hook execution order
- **Type safety**: Strong TypeScript types throughout the pipeline
- **Extensibility**: Easy to add new hooks and modify behavior
- **Performance**: Priority-based execution allows optimization
- **Observability**: Built-in diagnostic and tracing support
- **Reusability**: Hooks can be packaged and shared across applications

### Trade-offs
- **Complexity**: More complex than simple middleware chains
- **Learning curve**: Developers need to understand hook phases and execution model
- **Debugging**: Multiple hooks can make debugging more challenging
- **Performance overhead**: Hook execution adds latency to requests

### Migration Path
- Existing middleware can be wrapped as hooks in the `preHandler` phase
- Gradual migration of functionality to appropriate hook phases
- Compatibility layer for existing patterns during transition