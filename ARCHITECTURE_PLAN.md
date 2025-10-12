# Atomic FHIR Framework Architecture Plan

**Vision**: Create a Fastify-like DX for building FHIR servers with progressive complexity, full exposure of primitives, and leveraging existing Atomic libraries.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Design Principles](#design-principles)
- [Using Existing Libraries](#using-existing-libraries)
- [Build System & Development Workflow](#build-system--development-workflow)
- [4-Layer Architecture](#4-layer-architecture)
- [Decorator Pattern](#decorator-pattern)
- [Progressive Complexity Examples](#progressive-complexity-examples)
- [Implementation Roadmap](#implementation-roadmap)
- [Success Criteria](#success-criteria)

## Architecture Overview

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

`@atomic-ehr/interactions` is the contract boundary between HTTP concerns and pure services. It consumes structural definitions emitted by the canonical manager, materializes REST interactions (read/vread/update/history/transaction, operations, batch), publishes them to the server layer, and keeps the runtime CapabilityStatement in sync. Whenever packages change, the interactions layer coordinates schema migrations, repository index rebuilds, and regeneration of TypeScript declaration output so the server always reflects the active implementation guide set.

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

## Using Existing Libraries

### @atomic-ehr/fhir-canonical-manager

**Purpose**: Package loading, canonical URL resolution, FHIR resource management

```typescript
import { createCanonicalManager } from '@atomic-ehr/fhir-canonical-manager';

// Wrapped in CanonicalManagerService
export class CanonicalManagerService implements CanonicalManager {
  private manager: ReturnType<typeof createCanonicalManager>;

  async init(): Promise<void> {
    this.manager = createCanonicalManager({
      cacheDir: '.fhir-cache',
      workingDir: process.cwd()
    });

    // Load packages
    await this.manager.loadPackages([
      'hl7.fhir.r4.core#4.0.1',
      'hl7.fhir.us.core#7.0.0'
    ]);
  }

  async resolve(canonical: string): Promise<Canonical> {
    return this.manager.resolve(canonical);
  }

  async search(query: string): Promise<Canonical[]> {
    return this.manager.search(query);
  }

  async resolveBundle(profileUrl: string): Promise<CanonicalBundle> {
    return this.manager.resolveBundle(profileUrl);
  }

  watch(onChange: (snapshot: CanonicalSnapshot) => Promise<void>): () => void {
    return this.manager.watchPackages(onChange);
  }
}
```

**Features Used**:
- Package downloading and caching
- Canonical URL resolution
- Resource indexing and search
- Profile and extension management

**Provisioning Pipeline**:
- Emit `StructureDefinition`, `SearchParameter`, and `CapabilityStatement` inputs to the interactions layer
- Trigger repository schema and index migrations based on differential definitions
- Rebuild JSON schema/TS declaration artifacts consumed by validator and DX tooling
- Notify the server layer to hot reload routes without downtime (graceful drain)

### @atomic-ehr/fhirpath

**Purpose**: FHIRPath expression evaluation and analysis

```typescript
import { evaluate, analyze, Interpreter } from '@atomic-ehr/fhirpath';

// Wrapped in FHIRPathEvaluatorService
export class FHIRPathEvaluatorService implements FHIRPathEvaluator {
  private interpreter?: Interpreter;

  async init(): Promise<void> {
    this.interpreter = new Interpreter();
  }

  async evaluate({ expression, input, context }): Promise<any> {
    return evaluate(expression, {
      input,
      variables: context
    });
  }

  async analyze({ expression }): Promise<ExpressionAnalysis> {
    return analyze(expression) as ExpressionAnalysis;
  }
}
```

**Features Used**:
- Expression evaluation
- Static analysis
- Type inference
- Model provider integration

### @atomic-ehr/fhirschema

**Purpose**: FHIR resource validation against schemas

```typescript
import { FHIRSchema } from '@atomic-ehr/fhirschema';

// Wrapped in FhirSchemaValidator
export class FhirSchemaValidator implements Validator {
  private schemas: Map<string, FHIRSchema> = new Map();

  async init(): Promise<void> {
    // Load schemas from packages
  }

  validate({ resource, profile }): ValidationResult {
    const schema = this.schemas.get(resource.resourceType);
    if (!schema) {
      return { valid: false, errors: ['Unknown resource type'] };
    }

    return schema.validate(resource);
  }
}
```

**Features Used**:
- StructureDefinition-based validation
- Profile validation
- Extension validation
- Constraint checking

## Build System & Development Workflow

### Using tsup for Package Building

All packages in the framework use **tsup** for building, providing fast builds and excellent TypeScript support.

#### Why tsup?

- ✅ **Fast**: Built on esbuild for lightning-fast builds
- ✅ **Zero Config**: Works out of the box for most use cases
- ✅ **TypeScript First**: Automatic .d.ts generation
- ✅ **Multiple Formats**: ESM, CJS, IIFE support
- ✅ **Watch Mode**: Built-in watch mode for development
- ✅ **Tree Shaking**: Automatic code splitting and tree shaking

### Package Configuration

Each package has a standard tsup configuration:

```json
// packages/services/package.json
{
  "name": "@atomic-ehr/services",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "tsup",
    "build:watch": "tsup --watch",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.0.0",
    "@types/bun": "latest"
  }
}
```

```typescript
// packages/services/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,           // Generate .d.ts files
  sourcemap: true,     // Generate sourcemaps
  clean: true,         // Clean dist before build
  splitting: false,    // Code splitting
  treeshake: true,     // Tree shaking
  minify: false,       // Don't minify in dev
  outDir: 'dist',
});
```

### Development Workflow

#### Working on a Single Package

```bash
# Navigate to package
cd packages/services

# Install dependencies
bun install

# Development mode (watch mode)
bun run dev
# or
bun run build:watch

# The package rebuilds automatically on file changes
```

#### Working on Multiple Packages Simultaneously

When developing features that span multiple packages (e.g., adding a new service in `@atomic-ehr/services` and using it in `@atomic-ehr/server`):

**Terminal 1: Watch @atomic-ehr/services**
```bash
cd packages/services
bun run dev
# Rebuilds on every change in services
```

**Terminal 2: Watch @atomic-ehr/server**
```bash
cd packages/server
bun run dev
# Rebuilds on every change in server
# Automatically picks up changes from services
```

**Terminal 3: Run example**
```bash
cd examples/01-minimal
bun run dev
# Hot reloads when packages rebuild
```

#### Monorepo Development

For the entire framework:

```bash
# From root
bun install

# Build all packages once
bun run build

# Watch all packages (using workspaces)
bun run dev

# Or manually in separate terminals
cd packages/services && bun run dev &
cd packages/server && bun run dev &
```

### Watch Mode in Action

When you make changes:

```typescript
// packages/services/src/logger/console-logger.ts
export class ConsoleLogger implements Logger {
  async log({ level, message, data }: LogEntry): Promise<void> {
    console.log(`[${level}] ${message}`, data);
    // ⚡ Save file → tsup detects change → rebuilds in ~50ms
  }
}
```

Terminal output:
```
CLI Building entry: src/index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup ✓ Build success in 47ms
DTS Build start
DTS ⚡️ Build success in 123ms
```

### Package Linking for Development

Use workspace protocol for local development:

```json
// packages/server/package.json
{
  "dependencies": {
    "@atomic-ehr/core": "workspace:*",
    "@atomic-ehr/services": "workspace:*",
    "@atomic-ehr/fhir-canonical-manager": "workspace:*",
    "@atomic-ehr/fhirpath": "workspace:*",
    "@atomic-ehr/fhirschema": "workspace:*"
  }
}
```

With Bun workspaces:

```json
// Root package.json
{
  "workspaces": [
    "packages/*",
    "examples/*"
  ]
}
```

This automatically links packages during development, so changes in one package are immediately available in others.

### Build Scripts

Each package should have consistent scripts:

```json
{
  "scripts": {
    "build": "tsup",
    "build:watch": "tsup --watch",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "typecheck:watch": "tsc --noEmit --watch",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "clean": "rm -rf dist",
    "prepublishOnly": "bun run clean && bun run build"
  }
}
```

### TypeScript Configuration

Use a base tsconfig for consistency:

```json
// packages/services/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

```json
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### Development Tips

1. **Keep Watch Running**: Always keep watch mode running during development for instant feedback

2. **Use TypeCheck in Parallel**: Run typecheck in watch mode alongside tsup:
   ```bash
   # Terminal 1
   bun run dev

   # Terminal 2
   bun run typecheck:watch
   ```

3. **Hot Reload Examples**: Examples automatically pick up package changes when using watch mode

4. **Build Before Publishing**: Always run full build before publishing:
   ```bash
   bun run clean && bun run build && bun test
   ```

5. **Check Bundle Size**: Use tsup's metafile to analyze bundle:
   ```bash
   tsup --metafile
   ```

### CI/CD Integration

```yaml
# .github/workflows/build.yml
name: Build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Type check
        run: bun run typecheck

      - name: Build all packages
        run: bun run build

      - name: Run tests
        run: bun test
```

### Example Development Session

```bash
# 1. Start fresh
cd /Users/alexanderstreltsov/work/atomic-ehr/framework

# 2. Install everything
bun install

# 3. Build once
bun run build

# 4. Start developing services
cd packages/services
bun run dev

# Terminal shows:
# > @atomic-ehr/services@0.1.0 dev
# > tsup --watch
#
# CLI Building entry: src/index.ts
# CLI Using tsconfig: tsconfig.json
# CLI tsup ✓ Build success in 47ms
# DTS Build start
# DTS ⚡️ Build success in 123ms
#
# Watching for changes...

# 5. In another terminal, start server in watch mode
cd packages/server
bun run dev

# 6. In another terminal, run an example
cd examples/01-minimal
bun run dev

# Now you can edit code in services or server,
# and see changes reflected immediately in the example!
```

## 4-Layer Architecture

### Layer 1: @atomic-ehr/core (Primitives)

**Location**: `../core/`

**Purpose**: Define interfaces and primitives. NO implementations.

**Key Exports**:
```typescript
// Service interfaces
export interface CanonicalManager { ... }
export interface Validator { ... }
export interface Repository { ... }
export interface Logger { ... }
export interface Audit { ... }
export interface Terminology { ... }
export interface FHIRPathEvaluator { ... }

// AtomicSystem lifecycle
export async function AtomicSystem<Schema>(
  context: AtomicContext<Schema>
): Promise<AtomicContext<Schema>>

// Hook system
export class HooksManager { ... }
export function defineHook(...) { ... }

// Plugin system
export class PluginRegistry { ... }
export function definePlugin(...) { ... }
export class DecoratorManager { ... }
```

**Status**: ✅ Already implemented

### Layer 2: @atomic-ehr/services (Implementations)

**Location**: `packages/services/` (NEW)

**Purpose**: Provide default implementations of all core services.

**Structure**:
```
packages/services/
├── src/
│   ├── canonical/
│   │   └── canonical-manager-service.ts  # Wraps fhir-canonical-manager
│   ├── fhirpath/
│   │   └── fhirpath-evaluator-service.ts # Wraps fhirpath
│   ├── validation/
│   │   ├── fhirschema-validator.ts       # Uses fhirschema
│   │   └── basic-validator.ts            # Simple validation
│   ├── repository/
│   │   ├── memory-repository.ts          # In-memory storage
│   │   ├── sqlite-repository.ts          # SQLite backend
│   │   └── postgres-repository.ts        # PostgreSQL (future)
│   ├── terminology/
│   │   ├── package-terminology.ts        # Extract from packages
│   │   └── tx-server-terminology.ts      # External terminology server
│   ├── audit/
│   │   ├── console-audit.ts              # Console logging
│   │   ├── file-audit.ts                 # File-based
│   │   └── structured-audit.ts           # Structured logs (JSON)
│   ├── logger/
│   │   ├── console-logger.ts             # Console logger
│   │   └── pino-logger.ts                # Pino integration
│   ├── factory.ts                        # createDefaultServices()
│   └── index.ts                          # Export all
├── package.json
└── tsconfig.json
```

**Key Export**:
```typescript
// packages/services/src/factory.ts
export async function createDefaultServices(config?: ServicesConfig): Promise<AtomicContext> {
  return {
    canonicals: new CanonicalManagerService(config?.canonicals),
    fhirpath: new FHIRPathEvaluatorService(),
    validator: new FhirSchemaValidator(config?.validation),
    repository: new MemoryRepository(config?.repository),
    logger: new ConsoleLogger(config?.logger),
    audit: new ConsoleAudit(config?.audit),
    terminology: new PackageTerminology(config?.terminology),
  };
}
```

### Layer 3: @atomic-ehr/interactions (FHIR REST Orchestration)

**Location**: `packages/interactions/` (NEW)

**Purpose**: Translate canonical definitions into concrete REST interactions and keep runtime capabilities aligned with packages.

**Responsibilities**:
- Build interaction handlers for read/vread/update/delete/history/search/transaction and custom operations
- Maintain a dynamic endpoint registry keyed by resource type + profile
- Materialize search parameter semantics (chaining, include/revinclude, `_has`, pagination)
- Normalize `OperationOutcome` responses and centralize error handling
- Generate and publish the live `CapabilityStatement` and supplemental conformance artifacts
- Coordinate with repositories to evolve storage schemas and search indexes
- Expose hot-reload hooks so the server swaps interaction graphs without downtime

**Key Exports**:
```typescript
export interface InteractionGraph {
  resources: ResourceNode[];
  capability: CapabilityStatement;
  searchParameters: RegisteredSearchParameter[];
}

export async function buildInteractionGraph(input: CanonicalBundle): Promise<InteractionGraph>;
export function registerInteractions(server: FhirServer, graph: InteractionGraph): Promise<void>;
export function watchCanonicalUpdates(manager: CanonicalManager, onChange: (bundle) => Promise<void>): () => void;
```

### Layer 4: @atomic-ehr/server (Framework)

**Location**: `packages/server/` (REFACTOR)

**Purpose**: High-level Fastify-like framework.

**Changes**:
```typescript
// Before (current)
export class FhirServer {
  constructor(config: FhirServerConfig) {
    // Creates services internally
    this.validator = new ValidationBridge(...)
    this.storage = new MemoryStorageAdapter(...)
    // Hidden, not accessible
  }
}

// After (new)
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

// Factory function for convenience
export async function createFhirServer(config: FhirServerConfig) {
  const services = await createDefaultServices(config);
  const context = await AtomicSystem(services);
  return new FhirServer(context, config);
}
```

**Structure**:
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

## Decorator Pattern

Inspired by Fastify, the decorator pattern allows extending server and request contexts.

### Server Decorators

Add properties/methods to the server instance:

```typescript
// Add a property
server.decorate('db', databaseConnection);

// Add a method
server.decorate('refreshCanonicals', async function(canonicalUrl) {
  const bundle = await this.services.canonicals.resolveBundle(canonicalUrl);
  await this.bootstrapInteractions(bundle);
});

// Add a getter
server.decorateGetter('config', () => loadConfig());

// Use decorator
const db = server.db;
await server.refreshCanonicals('http://example.org/fhir/StructureDefinition/MyProfile');
```

### Request Decorators

Add properties/methods to request contexts:

```typescript
// Add request logger with request ID (YOUR USE CASE!)
server.decorateRequest('logger', (req) => {
  return createLogger({
    requestId: req.requestId,
    service: 'fhir-server',
    timestamp: req.startTime
  });
});

// Add resource definition context emitted by interactions layer
server.decorateRequest('resourceDefinition', null);

// Add getter for profile URL
server.decorateRequestGetter('profileUrl', function() {
  return this.resourceDefinition?.url;
});

// Use in hooks
server.addHook({
  name: 'log-request',
  phase: 'preHandler',
  async handler(context, next) {
    // Logger already has request ID!
    context.logger.info('Processing request', {
      method: context.method,
      url: context.url,
      resourceType: context.resourceType,
      profile: context.profileUrl
    });
    return next();
  }
});
```

### Response Decorators

Add properties/methods to response contexts:

```typescript
// Add response helpers
server.decorateResponse('success', function(data: any) {
  this.statusCode = 200;
  this.responseBody = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: Array.isArray(data) ? data : [data]
  };
});

server.decorateResponse('error', function(code: string, message: string) {
  this.statusCode = code === 'not-found' ? 404 : 400;
  this.responseBody = {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code, diagnostics: message }]
  };
});

// Use in handlers
server.addRoute({
  method: 'GET',
  pattern: '/Patient',
  async handler(context) {
    const patients = await context.services.repository.search({
      resourceType: 'Patient',
      query: context.query
    });
    context.success(patients); // Use decorator!
    return context;
  }
});
```

### TypeScript Support

Use declaration merging for type safety:

```typescript
// Extend decorator interfaces
declare module '@atomic-ehr/server' {
  interface ServerDecorators {
    db: DatabaseConnection;
    refreshCanonicals(canonicalUrl: string): Promise<void>;
    stopCanonicalWatcher?: () => void;
  }

  interface RequestDecorators {
    logger: Logger;
    resourceDefinition: StructureDefinition | null;
    profileUrl: string | undefined;
    profileName: string | undefined;
  }

  interface ResponseDecorators {
    success(data: any): void;
    error(code: string, message: string): void;
  }
}
```

### Built-in Decorators

The framework provides these decorators by default:

```typescript
// 1. Services always available
server.services.validator
server.services.repository
server.services.logger
// ... etc

// 2. Request logger with request ID
context.logger // Already has requestId

// 3. Timing helpers
context.startTimer('db-query')
context.endTimer('db-query') // Returns duration

// 4. Response helpers
context.json({ data: ... })
context.fhir(patient)
context.operationOutcome('error', 'invalid', 'Invalid resource')
```

## Progressive Complexity Examples

### Level 1: Minimal Server (3 Lines)

Dead simple. Perfect for getting started or prototyping:

```typescript
import { createFhirServer } from '@atomic-ehr/server';

const server = await createFhirServer({ port: 3000 });
await server.start();

console.log('FHIR server running on http://localhost:3000');
```

**What you get**:
- ✅ Memory-based storage
- ✅ Basic validation
- ✅ Console logging
- ✅ All FHIR CRUD operations
- ✅ Dynamic routes from packages

### Level 2: With Plugins

Add common functionality via plugins:

```typescript
import { createFhirServer } from '@atomic-ehr/server';
import {
  validationPlugin,
  auditPlugin,
  corsPlugin
} from '@atomic-ehr/server/plugins';

const server = await createFhirServer({ port: 3000 });

// Register plugins
await server.register(validationPlugin, {
  strictMode: true,
  failOnWarnings: false
});

await server.register(auditPlugin, {
  logLevel: 'info',
  destination: './audit.log'
});

await server.register(corsPlugin, {
  origins: ['http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE']
});

await server.start();
```

**What you get**:
- ✅ Strict FHIR validation
- ✅ Comprehensive audit logging
- ✅ CORS configuration
- ✅ All services still accessible

### Level 3: Custom Services

Replace individual services with custom implementations:

```typescript
import { AtomicSystem } from '@atomic-ehr/core';
import { createDefaultServices } from '@atomic-ehr/services';
import { FhirServer } from '@atomic-ehr/server';
import { PostgresRepository } from './my-postgres-repository';
import { PinoLogger } from './my-pino-logger';

// Get default services
const services = await createDefaultServices();

// Replace repository with PostgreSQL
services.repository = new PostgresRepository({
  host: 'localhost',
  port: 5432,
  database: 'fhir'
});

// Replace logger with Pino
services.logger = new PinoLogger({
  level: 'info',
  prettyPrint: true
});

// Initialize AtomicSystem
const context = await AtomicSystem(services);

// Create server
const server = new FhirServer(context, { port: 3000 });

// Access services
console.log('Using repository:', server.services.repository.constructor.name);

await server.start();
```

**What you get**:
- ✅ Custom PostgreSQL repository
- ✅ Custom Pino logger
- ✅ Default services for everything else
- ✅ Full control over specific services

### Level 4: Full Control with Decorators

Maximum flexibility. Build everything from scratch:

```typescript
import { AtomicSystem } from '@atomic-ehr/core';
import { FhirServer } from '@atomic-ehr/server';
import { definePlugin } from '@atomic-ehr/core';

// Build context from scratch
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

// Add database decorator
const db = await createDbPool({ ... });
server.decorate('db', db);

// Add request logger with request ID
server.decorateRequest('logger', (req) => {
  return server.services.logger.child({
    requestId: req.requestId,
    timestamp: req.startTime
  });
});

// Observe canonical updates and trigger hot reloads
const stopWatching = await server.services.canonicals.watch(async (snapshot) => {
  server.services.logger.info('Provisioning update received', {
    packages: snapshot.packages,
    updatedAt: snapshot.updatedAt
  });
  await server.refreshCanonicals(snapshot.capabilityUrl);
});
server.decorate('stopCanonicalWatcher', stopWatching);

// Expose profile metadata on each request
server.decorateRequest('resourceDefinition', null);
server.decorateRequest('profileUrl', undefined);
server.decorateRequestGetter('profileName', function() {
  return this.resourceDefinition?.name;
});

// Add cache decorator
const redis = new Redis();
server.decorate('cache', redis);

server.decorateRequest('getCached', async function(key: string) {
  const cached = await server.cache.get(key);
  return cached ? JSON.parse(cached) : null;
});

server.decorateRequest('setCached', async function(key: string, value: any, ttl = 300) {
  await server.cache.setex(key, ttl, JSON.stringify(value));
});

// Enforce that incoming payloads conform to provisioned profiles
server.addHook({
  name: 'profile-enforcement',
  phase: 'preHandler',
  priority: 100,
  async handler(context, next) {
    if (context.resourceDefinition) {
      const result = await server.services.validator.validate({
        resource: context.body,
        definition: context.resourceDefinition
      });

      if (!result.ok) {
        context.logger.warn('Profile validation failed', {
          resourceType: context.resourceType,
          profile: context.profileUrl
        });
        throw result.outcome;
      }
    }
    return next();
  }
});

// Add caching hook
server.addHook({
  name: 'cache-check',
  phase: 'preHandler',
  async handler(context, next) {
    const cacheKey = `${context.method}:${context.url}`;
    const cached = await context.getCached(cacheKey);

    if (cached) {
      context.logger.info('Cache hit', { key: cacheKey });
      context.setResponse({
        statusCode: 200,
        responseHeaders: { 'X-Cache': 'HIT' },
        responseBody: cached
      });
      context.takeOver();
      return;
    }

    return next();
  }
});

// Add validation hook using FHIRPath
server.addHook({
  name: 'custom-validation',
  phase: 'preHandler',
  async handler(context, next) {
    if (context.body && context.resourceType === 'Patient') {
      const names = await server.services.fhirpath.evaluate({
        expression: 'Patient.name',
        input: context.body
      });

      if (!names || names.length === 0) {
        throw new Error('Patient must have at least one name');
      }
    }
    return next();
  }
});

// Custom plugin
const myPlugin = definePlugin(
  { name: 'my-plugin', version: '1.0.0' },
  async (context, options) => {
    // Full access to all services
    await context.canonicals.resolve('http://...');
    await context.repository.create({ ... });
    context.logger.info('Plugin initialized');

    // Add custom routes
    server.addRoute({
      method: 'GET',
      pattern: '/custom',
      async handler(ctx) {
        return { message: 'Custom endpoint' };
      }
    });
  }
);

await server.register(myPlugin);

// TypeScript declarations
declare module '@atomic-ehr/server' {
  interface ServerDecorators {
    db: DbPool;
    cache: Redis;
    stopCanonicalWatcher?: () => void;
  }

  interface RequestDecorators {
    logger: Logger;
    resourceDefinition: StructureDefinition | null;
    profileUrl: string | undefined;
    profileName: string | undefined;
    getCached(key: string): Promise<any>;
    setCached(key: string, value: any, ttl?: number): Promise<void>;
  }
}

await server.start();
```

**What you get**:
- ✅ Complete control over all services
- ✅ Custom decorators for db, cache, logger
- ✅ Request-scoped logger with request ID
- ✅ Dynamic endpoints provisioned from canonical packages
- ✅ Caching with Redis
- ✅ Custom validation with FHIRPath
- ✅ Type-safe decorators
- ✅ All services accessible

## Implementation Roadmap

### Phase 1: Create Service Adapters (Week 1)

**Goal**: Ship `@atomic-ehr/services` with implementations ready for dynamic provisioning.

**Tasks**:
1. Create package structure
2. Implement CanonicalManagerService (wraps fhir-canonical-manager) and emit change events
3. Implement FHIRPathEvaluatorService (wraps fhirpath)
4. Implement FhirSchemaValidator (uses fhirschema) with precompiled schema cache
5. Implement repository services (Memory, SQLite, Postgres) with schema migration hooks
6. Implement logger/audit services for lifecycle visibility
7. Implement terminology service with `$expand`/`$lookup` support
8. Create `createDefaultServices()` factory
9. Add contract tests and fixture packages to validate adapters

**Deliverables**:
- ✅ Working `@atomic-ehr/services` package
- ✅ All services implement `@atomic-ehr/core` interfaces
- ✅ Services emit provisioning telemetry (schema diffs, load status)
- ✅ Test coverage > 80%

### Phase 2: Canonical Provisioning Pipeline (Week 2)

**Goal**: Transform downloaded packages into runtime artifacts.

**Tasks**:
1. Build compiler that converts packages into `CanonicalBundle` (StructureDefinitions, ValueSets, SearchParameters)
2. Generate repository schema definitions and migration plans from differentials
3. Produce validator JSON schema and TypeScript declaration artifacts per profile
4. Register search parameters and index requirements
5. Implement change detection (hashing/diffing) and cache invalidation
6. Orchestrate terminology refresh hooks after package updates
7. Write integration tests exercising package add/remove/update scenarios

**Deliverables**:
- ✅ Canonical bundle builder with deterministic output
- ✅ Schema/index migration plan artifacts
- ✅ Type-safe declaration output published to `/generated`
- ✅ Automated regression suite for package updates

### Phase 3: Interaction Layer & Capability Sync (Week 2-3)

**Goal**: Implement `@atomic-ehr/interactions` and sync capabilities with runtime state.

**Tasks**:
1. Create package scaffolding and register with workspace
2. Implement interaction graph builder covering read/vread/update/delete/history/search/transaction
3. Support conditional create/update/delete and batch/transaction atomicity
4. Normalize `OperationOutcome` responses and error mapping
5. Generate live `CapabilityStatement`, `Conformance` bundle, and test endpoints (e.g., `$metadata`)
6. Wire canonical watcher to rebuild interaction graph on change
7. Provide test harness using fixture packages to assert available routes and capability diff

**Deliverables**:
- ✅ `@atomic-ehr/interactions` package published
- ✅ Interaction graph registration API
- ✅ Capability artifacts generated on boot and reload
- ✅ OperationOutcome contract tests

### Phase 4: Server Integration & Presets (Week 3)

**Goal**: Refactor `@atomic-ehr/server` to consume the interaction layer and surface presets.

**Tasks**:
1. Replace manual route wiring with interaction graph registration
2. Implement bootstrap pipeline (services → canonical sync → schema migrations → interaction load)
3. Add lifecycle hooks for hot reload, graceful drain, and crash recovery
4. Update minimal/standard/dev/testing presets to include provisioning defaults
5. Refresh decorator typings to expose resource-aware helpers (e.g., `context.resource`)
6. Implement built-in plugins: capability publisher, validation, audit, metrics, CORS
7. Document server lifecycle and add integration tests for presets

**Deliverables**:
- ✅ Server boots from canonical packages with zero manual endpoints
- ✅ Presets documented and validated end-to-end
- ✅ Lifecycle observability (startup logs, readiness signals) in place
- ✅ Hot reload path verified

### Phase 5: Search Semantics & Observability (Week 3-4)

**Goal**: Codify search behaviour and operational visibility.

**Tasks**:
1. Define supported search parameter matrix (chaining, `_include`, `_revinclude`, `_has`, `_summary`, `_count`)
2. Implement search registry that maps parameters to repository index strategies
3. Provide pagination, sorting, and total modes (none/accurate/estimate)
4. Add resource-specific search acceptance tests using example packages
5. Expose health endpoints (liveness, readiness) with provisioning status
6. Emit metrics/tracing for provisioning, request latency, and search execution plans
7. Document troubleshooting workflows and observability story

**Deliverables**:
- ✅ Search behaviour spec with automated verification
- ✅ Repository adapters honoring search registry
- ✅ Healthz/readiness endpoints wired into presets
- ✅ Metrics hooks exporting canonical load + search timings

### Phase 6: Documentation & Examples (Week 4)

**Goal**: Deliver comprehensive guidance aligned with the dynamic architecture.

**Tasks**:
1. Architecture documentation (this plan + generated diagrams)
2. API reference covering services, interactions, and presets
3. Getting started guide walking through package-driven provisioning
4. Service customization guide (override repository/terminology/search implementations)
5. Interaction extension guide (custom operations, conditional logic)
6. Create 5+ examples:
   - 01-minimal: 3-line server auto-provisioned from core package
   - 02-profiled: custom IG adds new resource endpoints
   - 03-repository-swap: Postgres backend with migrations
   - 04-search-depth: advanced search parameter usage
   - 05-operations: custom operation leveraging canonical graph
7. Migration guide from current architecture with checklist

**Deliverables**:
- ✅ Complete documentation set
- ✅ 5+ working examples kept in CI
- ✅ Migration guide
- ✅ Performance & conformance test appendix

## Success Criteria

The implementation is successful when:

1. ✅ **Use existing libraries**
   - @atomic-ehr/fhir-canonical-manager for package loading
   - @atomic-ehr/fhirpath for FHIRPath evaluation
   - @atomic-ehr/fhirschema for validation

2. ✅ **3-line minimal server works**
   ```typescript
   const server = await createFhirServer({ port: 3000 });
   await server.start();
   ```

3. ✅ **Service adapters ready for provisioning**
   - `@atomic-ehr/services` implements all core interfaces
   - Canonical, terminology, validator, and repository services emit lifecycle events
   - Adapter test suite covers fixture packages and schema migrations

4. ✅ **Interaction layer auto-configures endpoints**
   - Routes for read/vread/update/delete/history/search/transaction materialize from packages
   - Conditional interactions and custom operations supported
   - OperationOutcome normalization used across the stack

5. ✅ **Capability artifacts always in sync**
   - `$metadata` endpoint reflects live interaction graph
   - CapabilityStatement and supplementary conformance bundles generated on boot and on package change
   - Tests guard against drift between declared and actual interactions

6. ✅ **Provisioning pipeline generates schemas & types**
   - Repository schema/index plans generated and applied
   - Validator JSON schemas and TypeScript declarations emitted per profile
   - Hot reload path swaps interaction graph without downtime

7. ✅ **Search semantics codified**
   - `_include`, `_revinclude`, chaining, `_has`, `_summary`, `_count`, pagination, and sorting documented and implemented
   - Search registry maps parameters to repository strategies
   - Automated tests cover positive/negative search cases

8. ✅ **Terminology contract fulfilled**
   - `$expand` and `$lookup` supported via terminology service
   - Version pinning and cache refresh strategies documented
   - Failover behaviour validated

9. ✅ **Observability built-in**
   - Healthz/readiness endpoints expose provisioning state
   - Metrics/tracing for canonical load, search performance, and request latency
   - Structured logging emitted during bootstrap and reload

10. ✅ **Documentation & examples complete**
   - Architecture, API reference, and provisioning guides published
   - 5+ examples exercised in CI
   - Migration guide outlines steps from legacy architecture

## Next Steps

1. Review and approve this plan
2. Create task files in `tasks/` directory
3. Start with Phase 1: Service adapters
4. Implement progressively
5. Test thoroughly at each phase
6. Document as we go

---

**Version**: 1.0
**Last Updated**: 2025-10-12
**Status**: Planning
