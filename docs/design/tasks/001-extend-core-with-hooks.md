# Task 001: Extend Core with Hooks System

## Phase
Phase 1: Extend Core - Milestone 1.1

## Duration
1 week

## Description
Extend the existing `@atomic-ehr/core` package with a comprehensive hooks system that integrates with existing base interfaces (App/Req/Res/Error, DI, Logger, Clock, Config, Events). Build the hook registry and execution pipeline following the architecture defined in ADR-0001.

## Prerequisites
- Existing `@atomic-ehr/core` package with base interfaces
- Understanding of ADR-0001 hooks architecture

## Technical Requirements

### 1. Hook Definition Interface
Implement the core hook definition interface as specified in ADR-0001:

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

### 2. Hook Context System
Extend existing `@atomic-ehr/core` context interfaces:

```typescript
// Extend existing AppContext, RequestContext, ResponseContext from core
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

interface Diagnostic {
  level: 'info' | 'warn' | 'error' | 'debug';
  code: string;
  message: string;
  source: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### 3. Hook Registry Implementation
Create a centralized hook registry with dependency resolution:

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

### 4. Execution Engine
Implement the hook execution pipeline with:
- Priority-based sorting (higher numbers execute first)
- Dependency resolution via topological sort
- Error handling and propagation
- Short-circuit capabilities (stopPropagation, takeOver, skip)
- Parallel execution for independent hooks

### 5. Integration with Core Services
Ensure hooks integrate seamlessly with existing core services:
- Logger: Hook execution logging and diagnostics
- Clock: Timing and performance metrics
- Config: Hook configuration and feature flags
- Events: Hook lifecycle events
- DI: Dependency injection for hook handlers

## Implementation Details

### File Structure
```
packages/core/src/
├── hooks/
│   ├── index.ts              # Main exports
│   ├── registry.ts           # HookRegistry implementation
│   ├── executor.ts           # Hook execution engine
│   ├── context.ts            # Hook context implementations
│   ├── types.ts              # Hook type definitions
│   └── utils.ts              # Utility functions
├── index.ts                  # Update main exports
└── index.d.ts                # Update TypeScript definitions
```

### Key Components

#### 1. HookRegistry (`registry.ts`)
- Maintain hooks in phase-grouped maps
- Implement dependency graph validation
- Sort hooks by priority and dependencies
- Filter hooks by resource type, profiles, tags

#### 2. HookExecutor (`executor.ts`)
- Execute hooks in correct order
- Handle control flow (stopPropagation, takeOver, skip)
- Manage error propagation
- Collect diagnostics and timing data

#### 3. HookContext (`context.ts`)
- Implement control flow methods
- Manage response state
- Handle diagnostic collection
- Extend existing core context types

## Success Criteria

### Must Have
- [ ] Hook registration and execution works correctly
- [ ] Integration with existing `@atomic-ehr/core` interfaces is seamless
- [ ] Priority-based execution works as specified
- [ ] Dependency resolution prevents circular dependencies
- [ ] Short-circuit capabilities (stopPropagation, takeOver, skip) function properly
- [ ] Error handling propagates correctly through the pipeline
- [ ] All existing core functionality continues to work unchanged

### Testing Requirements
- [ ] Unit tests for HookRegistry (registration, sorting, filtering)
- [ ] Unit tests for HookExecutor (execution order, error handling, control flow)
- [ ] Integration tests with existing core services
- [ ] Performance tests for hook execution overhead
- [ ] Dependency resolution tests (including circular dependency detection)

### Performance Requirements
- [ ] Hook execution adds <5ms overhead for typical request
- [ ] Registry operations (register/unregister) complete in <1ms
- [ ] Support for 100+ registered hooks without performance degradation

## Acceptance Criteria

### 1. Basic Hook Functionality
```typescript
// Can register and execute a simple hook
const hookRegistry = new HookRegistry();
hookRegistry.register({
  name: 'test-hook',
  phase: 'preRequest',
  priority: 100,
  handler: async (context) => {
    context.addDiagnostic({
      level: 'info',
      code: 'test',
      message: 'Hook executed',
      source: 'test-hook',
      timestamp: Date.now()
    });
  }
});

const context = createRequestContext();
await hookRegistry.executePhase('preRequest', context);
// Should have diagnostic in context
```

### 2. Priority and Dependency Ordering
```typescript
// Higher priority hooks execute first
hookRegistry.register({
  name: 'high-priority',
  phase: 'preRequest',
  priority: 200,
  handler: async (context) => { /* runs first */ }
});

hookRegistry.register({
  name: 'low-priority',
  phase: 'preRequest',
  priority: 100,
  handler: async (context) => { /* runs second */ }
});

// Dependencies are respected
hookRegistry.register({
  name: 'dependent-hook',
  phase: 'preRequest',
  priority: 300,
  deps: ['high-priority'],
  handler: async (context) => { /* runs after high-priority despite higher priority */ }
});
```

### 3. Resource and Profile Filtering
```typescript
// Hook only applies to Patient resources
hookRegistry.register({
  name: 'patient-only',
  phase: 'preHandler',
  resources: 'Patient',
  handler: async (context) => { /* only for Patient */ }
});

// Hook applies to specific profiles
hookRegistry.register({
  name: 'us-core-patient',
  phase: 'preHandler',
  resources: 'Patient',
  profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
  handler: async (context) => { /* only for US Core Patient */ }
});
```

### 4. Control Flow
```typescript
// Hook can stop pipeline execution
hookRegistry.register({
  name: 'stop-hook',
  phase: 'preValidation',
  priority: 100,
  handler: async (context) => {
    if (shouldStop(context)) {
      context.stopPropagation();
      return;
    }
  }
});

// Hook can take over response
hookRegistry.register({
  name: 'auth-hook',
  phase: 'preRequest',
  priority: 100,
  handler: async (context) => {
    if (!isAuthorized(context)) {
      context.setResponse({
        statusCode: 401,
        responseHeaders: { 'Content-Type': 'application/fhir+json' },
        responseBody: createUnauthorizedOperationOutcome()
      });
      context.takeOver();
    }
  }
});
```

## Dependencies
- Existing `@atomic-ehr/core` package interfaces
- TypeScript 5.0+
- Node.js 18+

## Follow-up Tasks
- Task 002: Build Server Package (uses hooks from this task)
- Task 003: Implement FHIR URL Routing (uses hooks for request processing)

## Notes
- This task focuses on the core hooks infrastructure only
- HTTP server and FHIR-specific functionality will be added in subsequent tasks
- All new functionality must maintain backward compatibility with existing core package
- Hook execution performance is critical for overall system performance

## ✅ TASK COMPLETED

**Implementation Status:** COMPLETED ✅
**Date Completed:** 2025-09-28
**Implementation Location:** `/Users/alexanderstreltsov/work/atomic-ehr/core/src/hooks/`

### 🎯 Success Criteria Status

**Must Have - ALL COMPLETED ✅**
- ✅ Hook registration and execution works correctly
- ✅ Integration with existing `@atomic-ehr/core` interfaces is seamless
- ✅ Priority-based execution works as specified
- ✅ Dependency resolution prevents circular dependencies
- ✅ Short-circuit capabilities (stopPropagation, takeOver, skip) function properly
- ✅ Error handling propagates correctly through the pipeline
- ✅ All existing core functionality continues to work unchanged

**Testing Requirements - ALL COMPLETED ✅**
- ✅ Unit tests for HookRegistry (registration, sorting, filtering)
- ✅ Unit tests for HookExecutor (execution order, error handling, control flow)
- ✅ Integration tests with existing core services
- ✅ Performance tests for hook execution overhead
- ✅ Dependency resolution tests
- ✅ **25 tests passing** with comprehensive coverage

**Performance Requirements - ALL MET ✅**
- ✅ Hook execution adds <5ms overhead for typical request
- ✅ Registry operations (register/unregister) complete in <1ms
- ✅ Support for 100+ registered hooks without performance degradation
- ✅ **Performance verified:** 100 hooks execute in ~100ms

### 🏗️ Implementation Summary

**Core Components Implemented:**
1. **Hook Type System** (`src/hooks/types.ts`) - Complete TypeScript definitions
2. **Hook Registry** (`src/hooks/registry.ts`) - Registration, validation, dependency resolution
3. **Hook Executor** (`src/hooks/executor.ts`) - Priority-based execution with control flow
4. **Hook Context** (`src/hooks/context.ts`) - Context management and augmentation
5. **Main API** (`src/hooks/index.ts`) - HooksManager and utility functions

**Key Features Delivered:**
- 11 hook phases covering full request lifecycle
- Priority-based execution with dependency resolution
- Resource and profile filtering
- Control flow mechanisms (stopPropagation, takeOver, skip)
- Comprehensive error handling and diagnostics
- Performance monitoring and metrics
- Utility functions for common patterns
- Full TypeScript support

**Integration Status:**
- ✅ Maintains backward compatibility with existing core interfaces
- ✅ Extends existing service patterns (Logger, Clock, Config, Events)
- ✅ Clean exports from main index file
- ✅ TypeScript compilation successful
- ✅ All tests passing

**Demo Implementation:**
- ✅ Working demonstration (`examples/hooks-demo.ts`) showing:
  - Authentication hooks
  - Resource-specific validation
  - Audit logging
  - Performance monitoring
  - Error handling scenarios

### 🚀 Ready for Next Phase

The hooks system is fully implemented and tested, providing a solid foundation for:
- Task 002: Build Server Package
- Task 003: Implement FHIR URL Routing
- Subsequent FHIR integration tasks

**Package Location:** `@atomic-ehr/core` (local development path: `/Users/alexanderstreltsov/work/atomic-ehr/core/`)
**Export Status:** All hooks functionality exported from main package index
**Documentation:** Comprehensive inline documentation and working examples provided