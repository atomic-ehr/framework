# Phase 4: Server Integration & Presets

**Timeline**: Week 3
**Goal**: Refactor `@atomic-ehr/server` to consume the interaction layer and surface presets.

## Overview

This phase refactors the server package to use the interaction layer for all FHIR REST endpoints, replacing manual route wiring with dynamic provisioning. It also introduces presets for common deployment scenarios.

## Key Changes

### Before (Current Architecture)
```typescript
export class FhirServer {
  constructor(config: FhirServerConfig) {
    // Creates services internally (hidden)
    this.validator = new ValidationBridge(...)
    this.storage = new MemoryStorageAdapter(...)
  }
}
```

### After (New Architecture)
```typescript
export class FhirServer {
  private context: AtomicContext;

  constructor(context: AtomicContext, config: FhirServerConfig) {
    this.context = context;
  }

  // Expose all services
  get services() {
    return this.context;
  }
}

// Factory for convenience
export async function createFhirServer(config: FhirServerConfig) {
  const services = await createDefaultServices(config);
  const context = await AtomicSystem(services);
  return new FhirServer(context, config);
}
```

## Refactored Structure

```
packages/server/src/
├── server.ts               # FhirServer class (simplified)
├── factory.ts              # createFhirServer() + presets
├── bootstrap/
│   ├── interactions.ts     # Interaction graph wiring
│   └── lifecycle.ts        # Startup/shutdown choreography
├── decorators/
│   ├── built-in.ts         # Built-in decorators
│   └── index.ts
├── presets/
│   ├── minimal.ts          # Bare minimum
│   ├── standard.ts         # Production-ready
│   ├── development.ts      # Dev-friendly
│   └── testing.ts          # Test environment
├── plugins/
│   ├── capability.ts       # CapabilityStatement publisher
│   ├── validation.ts       # Auto-validation plugin
│   ├── audit.ts            # Audit logging plugin
│   ├── cors.ts             # CORS plugin
│   └── metrics.ts          # Metrics collection
└── types.ts
```

## Tasks

### 1. Replace Manual Route Wiring with Interaction Graph

Remove hardcoded routes and use the interaction layer.

**Current Implementation**:
```typescript
// OLD: Manual route registration
this.router.get('/:resourceType/:id', async (req, res) => {
  const resource = await this.storage.read(req.params.resourceType, req.params.id);
  res.json(resource);
});
```

**New Implementation**:
```typescript
// NEW: Dynamic registration from interaction graph
export function registerInteractions(
  server: FhirServer,
  graph: InteractionGraph
): void {
  for (const resource of graph.resources) {
    for (const interaction of resource.interactions) {
      const handler = getInteractionHandler(interaction);
      const pattern = getInteractionPattern(resource.resourceType, interaction);

      server.addRoute({
        method: getHttpMethod(interaction),
        pattern,
        handler
      });
    }
  }

  // Register operations
  for (const operation of graph.operations) {
    server.addRoute({
      method: 'POST',
      pattern: `/${operation.resource || '$'}/${operation.code}`,
      handler: operation.handler
    });
  }
}
```

**Acceptance Criteria**:
- [ ] All manual routes removed from server
- [ ] Routes dynamically registered from interaction graph
- [ ] Route patterns match FHIR REST spec
- [ ] HTTP methods correctly mapped
- [ ] Tests verify route registration

### 2. Implement Bootstrap Pipeline

Orchestrate services → canonical sync → schema migrations → interaction load.

**Implementation**:
```typescript
// packages/server/src/bootstrap/lifecycle.ts
export async function bootstrap(
  server: FhirServer,
  config: FhirServerConfig
): Promise<void> {
  const { services, logger } = server;

  logger.info('Starting bootstrap pipeline');

  // 1. Initialize services
  logger.info('Initializing services');
  await initializeServices(services);

  // 2. Load packages
  if (config.packages) {
    logger.info('Loading packages', { packages: config.packages });
    await services.canonicals.loadPackages(config.packages);
  }

  // 3. Build canonical bundle
  logger.info('Building canonical bundle');
  const bundle = await services.canonicals.resolveBundle('*');

  // 4. Run schema migrations
  logger.info('Running schema migrations');
  await runMigrations(services.repository, bundle);

  // 5. Load terminology
  logger.info('Loading terminology');
  await loadTerminology(services.terminology, bundle);

  // 6. Build interaction graph
  logger.info('Building interaction graph');
  const graph = await buildInteractionGraph(bundle);

  // 7. Register interactions
  logger.info('Registering interactions', { resources: graph.resources.length });
  await registerInteractions(server, graph);

  // 8. Publish capability statement
  logger.info('Publishing capability statement');
  publishCapability(server, graph.capability);

  logger.info('Bootstrap complete');
}

export async function shutdown(server: FhirServer): Promise<void> {
  const { services, logger } = server;

  logger.info('Starting shutdown');

  // Stop watchers
  if (server.stopCanonicalWatcher) {
    server.stopCanonicalWatcher();
  }

  // Shutdown services
  await Promise.all([
    services.canonicals.shutdown(),
    services.repository.shutdown(),
    services.validator.shutdown(),
  ]);

  logger.info('Shutdown complete');
}
```

**Acceptance Criteria**:
- [ ] Bootstrap pipeline coordinates all initialization
- [ ] Proper error handling at each step
- [ ] Detailed logging for visibility
- [ ] Graceful shutdown implemented
- [ ] Tests verify bootstrap flow

### 3. Add Lifecycle Hooks for Hot Reload

Support hot reload, graceful drain, and crash recovery.

**Implementation**:
```typescript
// packages/server/src/bootstrap/interactions.ts
export async function refreshInteractions(
  server: FhirServer,
  bundle: CanonicalBundle
): Promise<void> {
  const { logger } = server.services;

  logger.info('Refreshing interactions');

  // 1. Run migrations
  await runMigrations(server.services.repository, bundle);

  // 2. Rebuild interaction graph
  const graph = await buildInteractionGraph(bundle);

  // 3. Graceful drain: wait for in-flight requests
  await server.drain();

  // 4. Unregister old routes
  server.clearRoutes();

  // 5. Register new routes
  await registerInteractions(server, graph);

  // 6. Update capability statement
  publishCapability(server, graph.capability);

  logger.info('Interactions refreshed');
}

export function enableHotReload(server: FhirServer): () => void {
  return server.services.canonicals.watch(async (snapshot) => {
    server.services.logger.info('Canonical update detected', {
      packages: snapshot.packages
    });

    const bundle = await server.services.canonicals.resolveBundle('*');
    await refreshInteractions(server, bundle);
  });
}
```

**Acceptance Criteria**:
- [ ] Hot reload swaps interaction graph without downtime
- [ ] Graceful drain waits for in-flight requests
- [ ] Crash recovery restarts bootstrap pipeline
- [ ] Tests verify hot reload functionality

### 4. Update Presets

Create minimal, standard, development, and testing presets.

**Minimal Preset**:
```typescript
// packages/server/src/presets/minimal.ts
export const minimalPreset: FhirServerConfig = {
  port: 3000,
  services: {
    repository: 'memory',
    logger: 'console',
    validator: 'basic'
  },
  packages: ['hl7.fhir.r4.core#4.0.1'],
  plugins: []
};

export async function createMinimalServer(overrides?: Partial<FhirServerConfig>) {
  const config = { ...minimalPreset, ...overrides };
  return createFhirServer(config);
}
```

**Standard Preset**:
```typescript
// packages/server/src/presets/standard.ts
export const standardPreset: FhirServerConfig = {
  port: 3000,
  services: {
    repository: 'sqlite',
    logger: 'pino',
    validator: 'fhirschema',
    audit: 'structured'
  },
  packages: ['hl7.fhir.r4.core#4.0.1'],
  plugins: [
    'validation',
    'audit',
    'cors',
    'metrics'
  ]
};
```

**Development Preset**:
```typescript
// packages/server/src/presets/development.ts
export const developmentPreset: FhirServerConfig = {
  port: 3000,
  services: {
    repository: 'memory',
    logger: { type: 'console', pretty: true },
    validator: 'fhirschema'
  },
  packages: ['hl7.fhir.r4.core#4.0.1'],
  plugins: ['cors'],
  hotReload: true,
  verbose: true
};
```

**Testing Preset**:
```typescript
// packages/server/src/presets/testing.ts
export const testingPreset: FhirServerConfig = {
  port: 0, // Random port
  services: {
    repository: 'memory',
    logger: 'silent',
    validator: 'basic'
  },
  packages: [],
  plugins: []
};
```

**Acceptance Criteria**:
- [ ] All presets defined and exported
- [ ] Presets include provisioning defaults
- [ ] Easy to customize via overrides
- [ ] Tests verify preset configurations

### 5. Refresh Decorator Typings

Expose resource-aware helpers.

**Implementation**:
```typescript
// packages/server/src/decorators/built-in.ts
export function registerBuiltInDecorators(server: FhirServer): void {
  // Request logger with request ID
  server.decorateRequest('logger', (req) => {
    return server.services.logger.child({
      requestId: req.requestId,
      timestamp: req.startTime
    });
  });

  // Resource definition from interaction graph
  server.decorateRequest('resourceDefinition', null);

  // Profile URL
  server.decorateRequestGetter('profileUrl', function() {
    return this.resourceDefinition?.url;
  });

  // Timing helpers
  server.decorateRequest('timers', {});

  server.decorateRequest('startTimer', function(name: string) {
    this.timers[name] = Date.now();
  });

  server.decorateRequest('endTimer', function(name: string) {
    const start = this.timers[name];
    if (!start) return 0;
    return Date.now() - start;
  });

  // Response helpers
  server.decorateResponse('fhir', function(resource: any) {
    this.statusCode = 200;
    this.responseHeaders['Content-Type'] = 'application/fhir+json';
    this.responseBody = resource;
  });

  server.decorateResponse('operationOutcome', function(
    severity: string,
    code: string,
    diagnostics: string
  ) {
    this.statusCode = code === 'not-found' ? 404 : 400;
    this.responseBody = createOperationOutcome(severity, code, diagnostics);
  });
}
```

**Type Declarations**:
```typescript
// packages/server/src/types.ts
declare module '@atomic-ehr/server' {
  interface ServerDecorators {
    // User-defined decorators
  }

  interface RequestDecorators {
    logger: Logger;
    resourceDefinition: StructureDefinition | null;
    profileUrl: string | undefined;
    timers: Record<string, number>;
    startTimer(name: string): void;
    endTimer(name: string): number;
  }

  interface ResponseDecorators {
    fhir(resource: any): void;
    operationOutcome(severity: string, code: string, diagnostics: string): void;
  }
}
```

**Acceptance Criteria**:
- [ ] Built-in decorators registered on server start
- [ ] Type declarations updated
- [ ] Request logger includes request ID
- [ ] Resource definition available in context
- [ ] Tests verify decorators work

### 6. Implement Built-in Plugins

Create capability, validation, audit, metrics, and CORS plugins.

**Validation Plugin**:
```typescript
// packages/server/src/plugins/validation.ts
export const validationPlugin = definePlugin(
  { name: 'validation', version: '1.0.0' },
  async (context, options) => {
    const { validator, logger } = context;

    server.addHook({
      name: 'validation',
      phase: 'preHandler',
      priority: 100,
      async handler(ctx, next) {
        if (ctx.body && ctx.method !== 'GET') {
          const result = await validator.validate({
            resource: ctx.body,
            profile: ctx.profileUrl
          });

          if (!result.ok) {
            logger.warn('Validation failed', {
              resourceType: ctx.resourceType,
              errors: result.errors
            });

            if (options.strictMode) {
              throw result.outcome;
            }
          }
        }

        return next();
      }
    });
  }
);
```

**Audit Plugin**:
```typescript
// packages/server/src/plugins/audit.ts
export const auditPlugin = definePlugin(
  { name: 'audit', version: '1.0.0' },
  async (context, options) => {
    const { audit, logger } = context;

    server.addHook({
      name: 'audit-log',
      phase: 'onResponse',
      async handler(ctx, next) {
        await audit.log({
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          method: ctx.method,
          url: ctx.url,
          resourceType: ctx.resourceType,
          resourceId: ctx.params.id,
          statusCode: ctx.statusCode,
          userId: ctx.user?.id,
          duration: ctx.endTimer('request')
        });

        return next();
      }
    });
  }
);
```

**CORS Plugin**:
```typescript
// packages/server/src/plugins/cors.ts
export const corsPlugin = definePlugin(
  { name: 'cors', version: '1.0.0' },
  async (context, options) => {
    server.addHook({
      name: 'cors',
      phase: 'preHandler',
      priority: 1000,
      async handler(ctx, next) {
        ctx.setHeader('Access-Control-Allow-Origin', options.origins || '*');
        ctx.setHeader('Access-Control-Allow-Methods', options.methods?.join(', ') || 'GET, POST, PUT, DELETE');
        ctx.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (ctx.method === 'OPTIONS') {
          ctx.statusCode = 204;
          ctx.takeOver();
          return;
        }

        return next();
      }
    });
  }
);
```

**Acceptance Criteria**:
- [ ] All built-in plugins implemented
- [ ] Plugins configurable via options
- [ ] Plugins integrate with services
- [ ] Tests for all plugins

### 7. Document Server Lifecycle

Add integration tests for presets and document lifecycle.

**Documentation**:
```markdown
# Server Lifecycle

## Bootstrap Phase

1. Initialize services (canonicals, repository, validator, logger, etc.)
2. Load FHIR packages
3. Build canonical bundle
4. Run schema migrations
5. Load terminology
6. Build interaction graph
7. Register interactions
8. Publish capability statement

## Runtime Phase

- Handle requests using interaction handlers
- Apply hooks (validation, audit, etc.)
- Execute CRUD operations via repository

## Hot Reload Phase

1. Detect canonical update
2. Run schema migrations
3. Rebuild interaction graph
4. Graceful drain (wait for in-flight requests)
5. Unregister old routes
6. Register new routes
7. Update capability statement

## Shutdown Phase

1. Stop canonical watcher
2. Shutdown services
3. Close connections
```

**Acceptance Criteria**:
- [ ] Lifecycle documented
- [ ] Integration tests for each preset
- [ ] Tests verify bootstrap and shutdown
- [ ] Observability (startup logs, readiness signals)

## Deliverables

- ✅ Server boots from canonical packages with zero manual endpoints
- ✅ Presets documented and validated end-to-end
- ✅ Lifecycle observability (startup logs, readiness signals) in place
- ✅ Hot reload path verified

## Dependencies

- Phase 1: Service adapters
- Phase 2: Canonical provisioning
- Phase 3: Interaction layer
- `@atomic-ehr/services` for default implementations
- `@atomic-ehr/interactions` for graph registration

## Success Metrics

- [ ] Server fully refactored to use interaction layer
- [ ] All presets working correctly
- [ ] Bootstrap pipeline reliable
- [ ] Hot reload functional
- [ ] Built-in plugins tested
- [ ] Documentation complete
- [ ] Ready for Phase 5

---

**Status**: Not Started
**Previous Phase**: [03-interaction-layer.md](./03-interaction-layer.md)
**Next Phase**: [05-search-observability.md](./05-search-observability.md)
