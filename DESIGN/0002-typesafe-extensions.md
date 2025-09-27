# ADR-0002: Type-Safe Extensions System

## Status
Proposed

## Context
The `@atomic-ehr/hook-core` needs a Fastify-inspired plugin system that provides type-safe context augmentation, encapsulation, and dependency management. The system must support module augmentation for Request/Response types while maintaining strict type safety and preventing type pollution between isolated plugin scopes.

## Decision

### Plugin Contract Definition
```typescript
interface PluginDefinition<
  TName extends string,
  TOptions = Record<string, unknown>,
  TAugmentation = Record<string, never>
> {
  name: TName;
  version: string;
  dependencies?: PluginDependency[];
  options?: TOptions;
  register: PluginRegisterFunction<TOptions, TAugmentation>;
  hooks?: HookDefinition[];
  metadata?: PluginMetadata;
}

interface PluginDependency {
  name: string;
  version?: string; // Semver range
  optional?: boolean;
}

interface PluginMetadata {
  description?: string;
  author?: string;
  license?: string;
  keywords?: string[];
  repository?: string;
}
```

### Plugin Registration Function
```typescript
type PluginRegisterFunction<TOptions, TAugmentation> = (
  app: AppInstance,
  options: TOptions
) => Promise<TAugmentation> | TAugmentation;

interface AppInstance {
  // Core app interface from @atomic-ehr/core
  logger: Logger;
  config: Config;
  events: EventEmitter;

  // Hook registration
  registerHook(hook: HookDefinition): void;

  // Nested registration for encapsulation
  register<TChildOptions, TChildAugmentation>(
    plugin: PluginDefinition<string, TChildOptions, TChildAugmentation>,
    options?: TChildOptions
  ): Promise<TChildAugmentation>;

  // Context augmentation
  augmentRequest<T>(augmentation: T): void;
  augmentResponse<T>(augmentation: T): void;
  augmentApp<T>(augmentation: T): void;

  // Route registration
  addRoute(route: RouteDefinition): void;

  // Service registration
  addService<T>(name: string, service: T): void;
  getService<T>(name: string): T | undefined;
}
```

### Type-Safe Module Augmentation
```typescript
// Base interfaces in @atomic-ehr/core
declare module '@atomic-ehr/core' {
  interface AppContext {
    // Base app context - extended by plugins
  }

  interface RequestContext {
    // Base request context - extended by plugins
  }

  interface ResponseContext {
    // Base response context - extended by plugins
  }
}

// Plugin augmentation pattern
declare module '@atomic-ehr/core' {
  namespace Plugins {
    interface AppContext {
      // Plugin-specific augmentations
    }

    interface RequestContext {
      // Plugin-specific augmentations
    }

    interface ResponseContext {
      // Plugin-specific augmentations
    }
  }
}

// Merged interfaces
type AugmentedAppContext = AppContext & Plugins.AppContext;
type AugmentedRequestContext = RequestContext & Plugins.RequestContext;
type AugmentedResponseContext = ResponseContext & Plugins.ResponseContext;
```

### Plugin Encapsulation and Scoping
```typescript
interface PluginScope {
  parentScope?: PluginScope;
  plugins: Map<string, PluginInstance>;
  services: Map<string, unknown>;
  hooks: HookDefinition[];
  routes: RouteDefinition[];
  augmentations: {
    app: Record<string, unknown>;
    request: Record<string, unknown>;
    response: Record<string, unknown>;
  };
}

interface PluginInstance {
  definition: PluginDefinition<string, unknown, unknown>;
  scope: PluginScope;
  state: 'registered' | 'initializing' | 'ready' | 'error';
  error?: Error;
  exports?: unknown;
}

// Encapsulation rules:
// 1. Child scopes inherit from parent scopes
// 2. Child scopes cannot modify parent augmentations
// 3. Sibling scopes are isolated from each other
// 4. Breaking encapsulation requires explicit opt-in
```

### Breaking Encapsulation (Explicit Opt-in)
```typescript
interface PluginRegisterOptions {
  // Allow plugin to modify parent scope
  breakEncapsulation?: boolean;

  // Allow plugin to access sibling scopes
  accessSiblings?: boolean;

  // Specific plugins this plugin can access
  accessPlugins?: string[];
}

// Usage example
await app.register(myPlugin, {
  breakEncapsulation: true, // Can modify parent context
  accessPlugins: ['@atomic-ehr/fhir-validation'] // Can access specific plugin
});
```

### Dependency Management
```typescript
interface PluginManager {
  register<TOptions, TAugmentation>(
    plugin: PluginDefinition<string, TOptions, TAugmentation>,
    options?: TOptions & PluginRegisterOptions
  ): Promise<TAugmentation>;

  unregister(pluginName: string): Promise<void>;

  getDependencyGraph(): DependencyGraph;

  validateDependencies(): DependencyValidationResult;

  getPlugin<T>(name: string): PluginInstance<T> | undefined;

  getPluginsByTag(tag: string): PluginInstance[];
}

interface DependencyGraph {
  nodes: PluginNode[];
  edges: DependencyEdge[];
  cycles: string[][]; // Circular dependency detection
}

interface DependencyValidationResult {
  valid: boolean;
  missing: PluginDependency[];
  conflicts: VersionConflict[];
  cycles: string[][];
}
```

### Route Contract Types
```typescript
// Generic route definition with type safety
interface RouteDefinition<
  TParams = Record<string, unknown>,
  TQuery = Record<string, unknown>,
  THeaders = Record<string, string>,
  TBody = unknown,
  TReply = unknown
> {
  method: HttpMethod;
  path: string;
  handler: RouteHandler<TParams, TQuery, THeaders, TBody, TReply>;
  hooks?: RouteHookDefinition[];
  schema?: RouteSchema<TParams, TQuery, THeaders, TBody, TReply>;
  config?: RouteConfig;
}

type RouteHandler<TParams, TQuery, THeaders, TBody, TReply> = (
  request: TypedRequestContext<TParams, TQuery, THeaders, TBody>,
  reply: TypedResponseContext<TReply>
) => Promise<TReply> | TReply;

interface TypedRequestContext<TParams, TQuery, THeaders, TBody>
  extends AugmentedRequestContext {
  params: TParams;
  query: TQuery;
  headers: THeaders;
  body: TBody;
}

interface TypedResponseContext<TReply> extends AugmentedResponseContext {
  send(payload: TReply): void;
  status(code: number): TypedResponseContext<TReply>;
  header(name: string, value: string): TypedResponseContext<TReply>;
}
```

### Schema Validation Integration
```typescript
interface RouteSchema<TParams, TQuery, THeaders, TBody, TReply> {
  params?: JSONSchema7 | ValidationFunction<TParams>;
  query?: JSONSchema7 | ValidationFunction<TQuery>;
  headers?: JSONSchema7 | ValidationFunction<THeaders>;
  body?: JSONSchema7 | ValidationFunction<TBody>;
  response?: {
    [statusCode: number]: JSONSchema7 | ValidationFunction<TReply>;
  };
}

type ValidationFunction<T> = (input: unknown) => ValidationResult<T>;

interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
}
```

### Plugin Definition Examples
```typescript
// Simple plugin
const loggerPlugin = definePlugin({
  name: 'logger',
  version: '1.0.0',
  async register(app, options: { level: string }) {
    app.augmentRequest({ logger: createLogger(options.level) });

    app.registerHook({
      name: 'request-logging',
      phase: 'preRequest',
      priority: 1000,
      handler: async (context) => {
        context.logger.info('Request started', {
          method: context.method,
          url: context.url
        });
      }
    });

    return { logger: true }; // Augmentation return type
  }
});

// Complex plugin with dependencies
const fhirValidationPlugin = definePlugin({
  name: '@atomic-ehr/fhir-validation',
  version: '1.0.0',
  dependencies: [
    { name: '@atomic-ehr/canonical-bridge', version: '^1.0.0' },
    { name: 'logger', version: '^1.0.0' }
  ],
  async register(app, options: { strict: boolean }) {
    // Access dependency
    const canonicalBridge = app.getService('@atomic-ehr/canonical-bridge');

    app.augmentRequest({
      validate: (resource: any) => validateFhirResource(resource, canonicalBridge)
    });

    app.registerHook({
      name: 'fhir-validation',
      phase: 'preValidation',
      priority: 900,
      handler: async (context) => {
        if (context.body && context.method === 'POST') {
          const result = context.validate(context.body);
          if (!result.valid) {
            throw new ValidationError('Invalid FHIR resource', result.errors);
          }
        }
      }
    });

    return { fhirValidation: true };
  }
});
```

### Plugin Utilities
```typescript
// Plugin definition helper
function definePlugin<TName extends string, TOptions, TAugmentation>(
  definition: PluginDefinition<TName, TOptions, TAugmentation>
): PluginDefinition<TName, TOptions, TAugmentation> {
  return definition;
}

// Type-safe plugin registration
function createApp() {
  const app = new App();

  // Type-safe registration with inference
  const loggerAugmentation = await app.register(loggerPlugin, { level: 'info' });
  const validationAugmentation = await app.register(fhirValidationPlugin, { strict: true });

  // Augmentations are now available in context types
  return app;
}

// Plugin composition
function createPluginSuite<T extends Record<string, PluginDefinition<any, any, any>>>(
  plugins: T
): PluginSuite<T> {
  return new PluginSuite(plugins);
}
```

### Error Handling
```typescript
// Plugin-specific error types
class PluginError extends Error {
  constructor(
    message: string,
    public pluginName: string,
    public phase: 'registration' | 'initialization' | 'runtime'
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

class DependencyError extends PluginError {
  constructor(
    message: string,
    pluginName: string,
    public missingDependency: string
  ) {
    super(message, pluginName, 'registration');
    this.name = 'DependencyError';
  }
}

class VersionConflictError extends PluginError {
  constructor(
    message: string,
    pluginName: string,
    public conflictingVersions: string[]
  ) {
    super(message, pluginName, 'registration');
    this.name = 'VersionConflictError';
  }
}
```

## Implementation Guidelines

### Plugin Development Best Practices
1. **Single Responsibility**: Each plugin should have a clear, focused purpose
2. **Minimal Dependencies**: Reduce dependency complexity to avoid conflicts
3. **Graceful Degradation**: Handle missing optional dependencies gracefully
4. **Type Safety**: Provide complete TypeScript definitions for all exports
5. **Documentation**: Include comprehensive documentation and examples
6. **Testing**: Include unit tests and integration tests with type checking

### Type Safety Rules
1. **No Any Types**: Avoid `any` types in plugin interfaces
2. **Strict Augmentation**: Use module augmentation for extending base types
3. **Generic Constraints**: Use generic constraints to ensure type safety
4. **Runtime Validation**: Validate inputs at runtime to match type definitions
5. **Error Types**: Define specific error types for different failure modes

### Performance Considerations
1. **Lazy Loading**: Load plugin code only when needed
2. **Dependency Caching**: Cache resolved dependencies to avoid re-resolution
3. **Hook Optimization**: Minimize hook execution overhead
4. **Memory Management**: Clean up plugin resources on unregistration

## Consequences

### Benefits
- **Type Safety**: Complete TypeScript support with inference and validation
- **Encapsulation**: Clear scoping rules prevent plugin interference
- **Reusability**: Plugins can be shared and composed across applications
- **Dependency Management**: Automatic dependency resolution and validation
- **Extensibility**: Easy to extend base functionality without modifying core

### Trade-offs
- **Complexity**: More complex than simple function-based plugins
- **Learning Curve**: Developers need to understand encapsulation and typing rules
- **Performance**: Additional overhead from type checking and dependency resolution
- **Bundle Size**: TypeScript definitions and plugin machinery increase bundle size

### Migration Strategy
- Provide compatibility wrappers for existing middleware
- Gradual migration path from middleware to plugins
- Tooling to automatically generate plugin definitions from existing code
- Comprehensive examples and documentation for common patterns