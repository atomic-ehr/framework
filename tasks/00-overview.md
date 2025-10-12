# Architecture Overview

**Vision**: Create a Fastify-like DX for building FHIR servers with progressive complexity, full exposure of primitives, and leveraging existing Atomic libraries.

## Layer Architecture

The framework is built on four layers:

```
┌─────────────────────────────────────────┐
│     @atomic-ehr/server                  │
│  (High-level Fastify-like framework)    │
│  - FhirServer class                     │
│  - Factory functions                    │
│  - Presets (minimal, standard, dev)     │
│  - Built-in plugins                     │
└─────────────────────────────────────────┘
                    │
                    │ uses
                    ▼
┌─────────────────────────────────────────┐
│  @atomic-ehr/interactions               │
│  (FHIR REST orchestration layer)        │
│  - Interaction router & handlers        │
│  - Capability statement builder         │
│  - OperationOutcome normalization       │
│  - Dynamic endpoint registry            │
└─────────────────────────────────────────┘
                    │
                    │ coordinates
                    ▼
┌─────────────────────────────────────────┐
│     @atomic-ehr/services                │
│  (Default service implementations)      │
│  - CanonicalManagerService              │
│  - FHIRPathEvaluatorService             │
│  - FhirSchemaValidator                  │
│  - Repositories (Memory, SQLite, PG)    │
│  - Logger, Audit, Terminology           │
└─────────────────────────────────────────┘
                    │
                    │ implements
                    ▼
┌─────────────────────────────────────────┐
│     @atomic-ehr/core                    │
│  (Primitives & Interfaces)              │
│  - Service interfaces                   │
│  - AtomicSystem lifecycle               │
│  - Hook system                          │
│  - Plugin system                        │
│  - Type system                          │
└─────────────────────────────────────────┘
                    │
                    │ wraps
                    ▼
┌─────────────────────────────────────────┐
│     Existing Atomic Libraries           │
│  - @atomic-ehr/fhir-canonical-manager   │
│  - @atomic-ehr/fhirpath                 │
│  - @atomic-ehr/fhirschema               │
└─────────────────────────────────────────┘
```

## Design Principles

### 1. Progressive Complexity

Users start simple and add complexity only when needed:

- **Level 1**: 3-line server (dead simple)
- **Level 2**: Add plugins (common patterns)
- **Level 3**: Replace services (custom implementations)
- **Level 4**: Full control (everything exposed)

### 2. Full Exposure - No Magic

All services are accessible. No hidden abstractions:

```typescript
// Every service is accessible
server.services.validator.validate(...)
server.services.repository.create(...)
server.services.canonicals.resolve(...)
server.services.fhirpath.evaluate(...)
```

### 3. Type-Safe Everywhere

Full TypeScript support with schema-driven types:

```typescript
import { FhirR4 } from '@atomic-ehr/types-r4';

const context = await AtomicSystem<FhirR4>({
  repository: new Repository<FhirR4>(),
  validator: new Validator<FhirR4>(),
  // ... fully typed
});

// Operations are type-safe
const patient = await context.repository.read({
  resourceType: 'Patient', // ✅ autocomplete
  id: '123'
}); // Returns: Patient (fully typed)
```

### 4. Plugin-First Architecture

Everything can be a plugin. Plugins have full access to services:

```typescript
const myPlugin = definePlugin(
  { name: 'my-plugin', version: '1.0.0' },
  async (context, options) => {
    // Full access to all services
    context.repository
    context.validator
    context.logger

    // Add hooks, routes, decorators
    server.addHook({ ... })
    server.decorate('myFeature', ...)
  }
);
```

### 5. Fastify-like DX

Familiar API for Fastify users:

- `server.decorate()` - Add properties to server
- `server.decorateRequest()` - Add properties to request
- `server.register()` - Register plugins
- `server.addHook()` - Add lifecycle hooks
- `server.start()` / `server.stop()` - Lifecycle management

### 6. Profile-Driven Provisioning

Canonical packages drive everything. Loading or updating packages triggers:

- Schema derivation for repositories and validators
- Dynamic endpoint registration across all RESTful interactions
- CapabilityStatement regeneration and publication
- TypeScript declaration generation for strict compile-time safety
- Search parameter registration, indexing, and migrations

## Key Architectural Concepts

### Interaction Layer as Contract Boundary

`@atomic-ehr/interactions` is the contract boundary between HTTP concerns and pure services. It:

- Consumes structural definitions emitted by the canonical manager
- Materializes REST interactions (read/vread/update/history/transaction, operations, batch)
- Publishes them to the server layer
- Keeps the runtime CapabilityStatement in sync

Whenever packages change, the interactions layer coordinates:
- Schema migrations
- Repository index rebuilds
- Regeneration of TypeScript declaration output

This ensures the server always reflects the active implementation guide set.

### Request Pipeline

```text
Request → Router → Handler → Storage → Response
           ↓         ↓         ↓
      Route Match  Resource  SQLite
                   Operation
                      ↓
                  Hooks Pipeline
                 (before/after)
```

## Build System

All packages use **tsup** for building:

- ✅ **Fast**: Built on esbuild
- ✅ **Zero Config**: Works out of the box
- ✅ **TypeScript First**: Automatic .d.ts generation
- ✅ **Multiple Formats**: ESM, CJS, IIFE support
- ✅ **Watch Mode**: Built-in watch mode for development
- ✅ **Tree Shaking**: Automatic code splitting

### Standard Configuration

```json
{
  "scripts": {
    "build": "tsup",
    "build:watch": "tsup --watch",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
}
```

### Development Workflow

```bash
# Watch multiple packages
cd packages/services && bun run dev &
cd packages/server && bun run dev &

# Or watch all with workspaces
bun run dev
```

## Progressive Complexity Examples

### Level 1: Minimal Server (3 Lines)

```typescript
import { createFhirServer } from '@atomic-ehr/server';

const server = await createFhirServer({ port: 3000 });
await server.start();
```

### Level 2: With Plugins

```typescript
import { createFhirServer } from '@atomic-ehr/server';
import { validationPlugin, auditPlugin } from '@atomic-ehr/server/plugins';

const server = await createFhirServer({ port: 3000 });
await server.register(validationPlugin, { strictMode: true });
await server.register(auditPlugin, { destination: './audit.log' });
await server.start();
```

### Level 3: Custom Services

```typescript
import { AtomicSystem } from '@atomic-ehr/core';
import { createDefaultServices } from '@atomic-ehr/services';
import { FhirServer } from '@atomic-ehr/server';

const services = await createDefaultServices();
services.repository = new PostgresRepository({ ... });
services.logger = new PinoLogger({ ... });

const context = await AtomicSystem(services);
const server = new FhirServer(context, { port: 3000 });
await server.start();
```

### Level 4: Full Control

```typescript
import { AtomicSystem } from '@atomic-ehr/core';
import { FhirServer } from '@atomic-ehr/server';

const context = await AtomicSystem({
  canonicals: new MyCanonicalManager(),
  validator: new MyValidator(),
  repository: new PostgresRepository(),
  logger: new PinoLogger(),
  audit: new StructuredAudit(),
  terminology: new TxServerTerminology(),
  fhirpath: new MyFHIRPathEvaluator(),
});

const server = new FhirServer(context, { port: 3000 });

// Add decorators
server.decorate('db', dbPool);
server.decorateRequest('logger', (req) => createRequestLogger(req));

// Add hooks
server.addHook({
  name: 'custom-validation',
  phase: 'preHandler',
  async handler(context, next) {
    // Custom logic
    return next();
  }
});

await server.start();
```

## Next Steps

See individual task files for detailed implementation plans:
- `tasks/01-service-adapters.md` - Phase 1: Service implementations
- `tasks/02-canonical-provisioning.md` - Phase 2: Provisioning pipeline
- `tasks/03-interaction-layer.md` - Phase 3: Interaction layer
- `tasks/04-server-integration.md` - Phase 4: Server integration
- `tasks/05-search-observability.md` - Phase 5: Search and observability
- `tasks/06-documentation-examples.md` - Phase 6: Documentation
- `tasks/success-criteria.md` - Validation checklist

---

**Version**: 1.0
**Last Updated**: 2025-10-12
**Status**: Planning
