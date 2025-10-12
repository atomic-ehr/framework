# Phase 6: Documentation & Examples

**Timeline**: Week 4
**Goal**: Deliver comprehensive guidance aligned with the dynamic architecture.

## Overview

This phase focuses on creating complete documentation and working examples that demonstrate the framework's capabilities. Documentation should be clear, practical, and aligned with the progressive complexity model.

## Documentation Structure

```
docs/
├── architecture/
│   ├── overview.md               # High-level architecture
│   ├── layers.md                 # 4-layer architecture
│   ├── provisioning.md           # Canonical provisioning pipeline
│   └── diagrams/                 # Architecture diagrams
├── getting-started/
│   ├── installation.md           # Installation guide
│   ├── quickstart.md             # 3-line server
│   ├── first-server.md           # First complete server
│   └── deployment.md             # Deployment guide
├── guides/
│   ├── services.md               # Service customization
│   ├── interactions.md           # Interaction extension
│   ├── search.md                 # Search capabilities
│   ├── operations.md             # Custom operations
│   ├── plugins.md                # Plugin development
│   ├── decorators.md             # Decorator usage
│   └── hooks.md                  # Hook system
├── api/
│   ├── server.md                 # FhirServer API
│   ├── services.md               # Service interfaces
│   ├── interactions.md           # Interaction layer
│   └── types.md                  # Type definitions
├── migration/
│   └── from-v1.md                # Migration from current version
└── troubleshooting/
    ├── common-issues.md          # Common problems
    └── debugging.md              # Debugging guide
```

## Tasks

### 1. Architecture Documentation

Create comprehensive architecture docs with diagrams.

**Content**:
- Overview of 4-layer architecture
- Explanation of each layer's responsibility
- Data flow diagrams
- Provisioning pipeline diagram
- Interaction graph visualization
- Package-to-runtime flow

**Diagrams to Create**:
- Layer architecture (already in overview)
- Bootstrap pipeline flow
- Hot reload sequence
- Request processing flow
- Search execution flow

**Acceptance Criteria**:
- [ ] Architecture overview written
- [ ] Each layer documented
- [ ] Diagrams created and included
- [ ] Provisioning pipeline explained
- [ ] Technical but accessible

### 2. API Reference

Document all public APIs.

**Server API**:
```markdown
## FhirServer

### Constructor

```typescript
new FhirServer(context: AtomicContext, config: FhirServerConfig)
```

Creates a new FHIR server instance.

**Parameters:**
- `context` - AtomicContext containing all services
- `config` - Server configuration

### Properties

#### services

```typescript
server.services: AtomicContext
```

Access to all registered services.

### Methods

#### start()

```typescript
async start(): Promise<void>
```

Start the server.

#### stop()

```typescript
async stop(): Promise<void>
```

Stop the server gracefully.

#### register()

```typescript
async register(plugin: Plugin, options?: any): Promise<void>
```

Register a plugin.

... (continue for all methods)
```

**Acceptance Criteria**:
- [ ] Server API fully documented
- [ ] Service interfaces documented
- [ ] Interaction layer API documented
- [ ] Type definitions included
- [ ] Examples for each API

### 3. Getting Started Guide

Create comprehensive getting started documentation.

**Installation Guide**:
```markdown
# Installation

## Prerequisites

- Bun >= 1.0.0 (or Node.js >= 18)
- TypeScript >= 5.0 (for TypeScript projects)

## Install via npm

```bash
npm install @atomic-ehr/server @atomic-ehr/services
```

## Install via bun

```bash
bun add @atomic-ehr/server @atomic-ehr/services
```

## Verify Installation

```bash
bun --version
```
```

**Quickstart**:
```markdown
# Quickstart

Get a FHIR server running in 3 lines:

```typescript
import { createFhirServer } from '@atomic-ehr/server';

const server = await createFhirServer({ port: 3000 });
await server.start();

console.log('FHIR server running on http://localhost:3000');
```

Test it:

```bash
curl http://localhost:3000/metadata
```

You should see a CapabilityStatement!
```

**Acceptance Criteria**:
- [ ] Installation guide complete
- [ ] Quickstart works as documented
- [ ] First server tutorial complete
- [ ] Deployment guide written
- [ ] Tested with fresh installation

### 4. Service Customization Guide

Explain how to replace and customize services.

**Content**:
```markdown
# Service Customization

## Replacing a Single Service

```typescript
import { createDefaultServices } from '@atomic-ehr/services';
import { PostgresRepository } from './my-postgres-repository';

const services = await createDefaultServices();

// Replace repository with PostgreSQL
services.repository = new PostgresRepository({
  host: 'localhost',
  database: 'fhir'
});

const context = await AtomicSystem(services);
const server = new FhirServer(context, { port: 3000 });
```

## Building Services from Scratch

```typescript
const context = await AtomicSystem({
  canonicals: new MyCanonicalManager(),
  validator: new MyValidator(),
  repository: new MyRepository(),
  logger: new MyLogger(),
  audit: new MyAudit(),
  terminology: new MyTerminology(),
  fhirpath: new MyFHIRPathEvaluator()
});
```

## Custom Repository Example

```typescript
export class MyRepository implements Repository {
  async create<T>(resource: T): Promise<T> {
    // Your implementation
  }

  async read<T>(resourceType: string, id: string): Promise<T | null> {
    // Your implementation
  }

  // ... implement all interface methods
}
```
```

**Acceptance Criteria**:
- [ ] Guide explains service replacement
- [ ] Examples for common customizations
- [ ] PostgreSQL repository example
- [ ] Custom logger example
- [ ] Tests verify examples work

### 5. Interaction Extension Guide

Document custom operations and conditional logic.

**Content**:
```markdown
# Interaction Extensions

## Custom Operations

Define custom FHIR operations:

```typescript
const matchOperation = defineOperation({
  name: 'match',
  resource: 'Patient',
  type: 'instance',
  async handler(context) {
    const { body, services } = context;

    // Custom matching logic
    const matches = await services.repository.search({
      resourceType: 'Patient',
      parameters: extractMatchCriteria(body)
    });

    return {
      statusCode: 200,
      body: {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: matches.resources.map(r => ({ resource: r }))
      }
    };
  }
});

server.register(matchOperation);
```

## Conditional Interactions

Override conditional create logic:

```typescript
server.addHook({
  name: 'custom-conditional-create',
  phase: 'preHandler',
  async handler(context, next) {
    if (context.headers['if-none-exist']) {
      // Custom conditional logic
      const existing = await findExisting(context);

      if (existing) {
        context.setResponse({ statusCode: 200, body: existing });
        context.takeOver();
        return;
      }
    }

    return next();
  }
});
```
```

**Acceptance Criteria**:
- [ ] Custom operations documented
- [ ] Conditional logic examples
- [ ] Integration with hooks explained
- [ ] Examples tested

### 6. Create Working Examples

Build 5+ examples demonstrating progressive complexity.

**Example 1: Minimal Server**:
```typescript
// examples/01-minimal/server.ts
import { createFhirServer } from '@atomic-ehr/server';

const server = await createFhirServer({ port: 3000 });
await server.start();

console.log('FHIR server running on http://localhost:3000');
```

**Example 2: Profiled Server**:
```typescript
// examples/02-profiled/server.ts
import { createFhirServer } from '@atomic-ehr/server';

const server = await createFhirServer({
  port: 3000,
  packages: [
    'hl7.fhir.r4.core#4.0.1',
    'hl7.fhir.us.core#7.0.0'
  ]
});

await server.start();
```

**Example 3: Repository Swap**:
```typescript
// examples/03-repository-swap/server.ts
import { AtomicSystem } from '@atomic-ehr/core';
import { createDefaultServices } from '@atomic-ehr/services';
import { FhirServer } from '@atomic-ehr/server';
import { PostgresRepository } from '@atomic-ehr/services/postgres';

const services = await createDefaultServices();

services.repository = new PostgresRepository({
  host: process.env.DB_HOST,
  database: 'fhir',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

const context = await AtomicSystem(services);
const server = new FhirServer(context, { port: 3000 });

await server.start();
```

**Example 4: Advanced Search**:
```typescript
// examples/04-search-depth/server.ts
import { createFhirServer } from '@atomic-ehr/server';
import { searchPlugin } from './plugins/search';

const server = await createFhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

// Custom search plugin with advanced features
await server.register(searchPlugin, {
  enableChaining: true,
  enableRevInclude: true,
  maxIncludes: 10
});

await server.start();
```

**Example 5: Custom Operations**:
```typescript
// examples/05-operations/server.ts
import { createFhirServer } from '@atomic-ehr/server';
import { defineOperation } from '@atomic-ehr/core';

const server = await createFhirServer({ port: 3000 });

// $match operation
const matchOperation = defineOperation({
  name: 'match',
  resource: 'Patient',
  async handler(context) {
    // Implementation
  }
});

await server.register(matchOperation);
await server.start();
```

**Acceptance Criteria**:
- [ ] All 5 examples created
- [ ] Each example has README
- [ ] Examples progressively increase complexity
- [ ] All examples tested in CI
- [ ] Examples include comments

### 7. Migration Guide

Create guide for migrating from current architecture.

**Content**:
```markdown
# Migration Guide

## Overview

This guide helps you migrate from the current architecture to the new layered architecture.

## Key Changes

1. **Services are now explicit**: Previously hidden, now fully accessible
2. **Dynamic provisioning**: Routes generated from packages
3. **Plugin system**: New plugin architecture
4. **Decorator pattern**: Extend server and request contexts

## Migration Checklist

### Step 1: Update Dependencies

```json
{
  "dependencies": {
    "@atomic-ehr/server": "^2.0.0",
    "@atomic-ehr/services": "^1.0.0",
    "@atomic-ehr/core": "^1.0.0"
  }
}
```

### Step 2: Update Server Creation

**Before:**
```typescript
const app = new Atomic({ port: 3000 });
await app.start();
```

**After:**
```typescript
const server = await createFhirServer({ port: 3000 });
await server.start();
```

### Step 3: Update Resource Definitions

**Before:**
```typescript
defineResource({
  resourceType: 'Patient',
  handlers: { ... }
});
```

**After:**
```typescript
// Resources auto-provisioned from packages
// Override specific handlers via hooks
server.addHook({
  name: 'custom-patient-create',
  phase: 'beforeCreate',
  resources: 'Patient',
  async handler(resource, context) {
    // Custom logic
    return resource;
  }
});
```

### Step 4: Update Storage Adapters

**Before:**
```typescript
storage: new SQLiteAdapter({ ... })
```

**After:**
```typescript
const services = await createDefaultServices();
services.repository = new SQLiteRepository({ ... });

const context = await AtomicSystem(services);
const server = new FhirServer(context, { port: 3000 });
```

## Breaking Changes

- `defineResource()` replaced by package provisioning
- Storage adapters renamed to repositories
- Validator API changed
- Hook system refactored

## Migration Support

If you need help migrating, please open an issue or reach out to the community.
```

**Acceptance Criteria**:
- [ ] Migration guide complete
- [ ] Step-by-step instructions
- [ ] Breaking changes documented
- [ ] Examples for common migrations
- [ ] Tested with real migration

### 8. Performance & Conformance Test Appendix

Document testing approach and results.

**Content**:
```markdown
# Performance & Conformance

## Performance Benchmarks

### Server Startup

- Minimal preset: ~100ms
- Standard preset with R4 Core: ~500ms
- With US Core: ~1000ms

### Request Latency

- Read operation: ~2ms (memory), ~5ms (SQLite)
- Search operation: ~10ms (simple), ~50ms (complex with includes)
- Transaction: ~20ms (5 entries)

### Package Loading

- R4 Core (4.0.1): ~300ms
- US Core (7.0.0): ~500ms

## Conformance

### FHIR Conformance

The framework passes the following FHIR conformance tests:

- ✅ CapabilityStatement generation
- ✅ All CRUD operations
- ✅ Conditional operations
- ✅ Transaction/batch processing
- ✅ Search parameters
- ✅ Include/revinclude
- ✅ History operations

### Validation

- ✅ StructureDefinition-based validation
- ✅ Profile validation
- ✅ Extension validation
- ✅ Constraint checking

## Test Coverage

- Core: 95%
- Services: 87%
- Interactions: 91%
- Server: 89%

## Running Tests

```bash
# All tests
bun test

# Specific package
cd packages/services
bun test

# Performance tests
bun run test:perf
```
```

**Acceptance Criteria**:
- [ ] Performance benchmarks documented
- [ ] Conformance tests listed
- [ ] Test coverage reported
- [ ] Instructions for running tests
- [ ] Results verified

## Deliverables

- ✅ Complete documentation set
- ✅ 5+ working examples kept in CI
- ✅ Migration guide
- ✅ Performance & conformance test appendix

## Success Metrics

- [ ] All documentation complete and reviewed
- [ ] Examples work as documented
- [ ] Migration guide tested
- [ ] Documentation hosted and accessible
- [ ] Ready for public release

---

**Status**: Not Started
**Previous Phase**: [05-search-observability.md](./05-search-observability.md)
**Next**: [success-criteria.md](./success-criteria.md)
