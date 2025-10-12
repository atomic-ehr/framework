# Phase 1: Create Service Adapters

**Timeline**: Week 1
**Goal**: Ship `@atomic-ehr/services` with implementations ready for dynamic provisioning.

## Overview

This phase focuses on creating concrete implementations of all service interfaces defined in `@atomic-ehr/core`. These implementations wrap existing Atomic libraries and provide pluggable alternatives for different deployment scenarios.

## Package Structure

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

## Tasks

### 1. Create Package Structure ✅

Set up the basic package structure with proper configuration.

**Acceptance Criteria**:
- [ ] Package directory created at `packages/services/`
- [ ] `package.json` configured with:
  - Name: `@atomic-ehr/services`
  - Workspace dependencies on `@atomic-ehr/core`, `@atomic-ehr/fhir-canonical-manager`, `@atomic-ehr/fhirpath`, `@atomic-ehr/fhirschema`
  - Build scripts using tsup
- [ ] `tsconfig.json` extends base config
- [ ] `tsup.config.ts` configured for ESM output with type declarations
- [ ] Directory structure created

### 2. Implement CanonicalManagerService

Wrap `@atomic-ehr/fhir-canonical-manager` and emit change events.

**Implementation**:
```typescript
// packages/services/src/canonical/canonical-manager-service.ts
import { createCanonicalManager } from '@atomic-ehr/fhir-canonical-manager';
import type { CanonicalManager, Canonical, CanonicalBundle, CanonicalSnapshot } from '@atomic-ehr/core';

export class CanonicalManagerService implements CanonicalManager {
  private manager: ReturnType<typeof createCanonicalManager>;

  constructor(config?: {
    cacheDir?: string;
    workingDir?: string;
    packages?: string[];
  }) {
    // Initialize manager
  }

  async init(): Promise<void> {
    this.manager = createCanonicalManager({
      cacheDir: this.config.cacheDir || '.fhir-cache',
      workingDir: this.config.workingDir || process.cwd()
    });

    if (this.config.packages) {
      await this.manager.loadPackages(this.config.packages);
    }
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

  async shutdown(): Promise<void> {
    // Cleanup
  }
}
```

**Acceptance Criteria**:
- [ ] Service implements `CanonicalManager` interface from core
- [ ] Wraps `createCanonicalManager` from fhir-canonical-manager
- [ ] Supports package loading configuration
- [ ] Implements `watch()` for package change events
- [ ] Has proper TypeScript types
- [ ] Includes unit tests with fixture packages

### 3. Implement FHIRPathEvaluatorService

Wrap `@atomic-ehr/fhirpath`.

**Implementation**:
```typescript
// packages/services/src/fhirpath/fhirpath-evaluator-service.ts
import { evaluate, analyze, Interpreter } from '@atomic-ehr/fhirpath';
import type { FHIRPathEvaluator, ExpressionAnalysis } from '@atomic-ehr/core';

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

  async shutdown(): Promise<void> {
    // Cleanup if needed
  }
}
```

**Acceptance Criteria**:
- [ ] Service implements `FHIRPathEvaluator` interface
- [ ] Wraps fhirpath library correctly
- [ ] Supports expression evaluation with context
- [ ] Supports static analysis
- [ ] Has proper TypeScript types
- [ ] Includes unit tests for common FHIRPath expressions

### 4. Implement FhirSchemaValidator

Use `@atomic-ehr/fhirschema` with precompiled schema cache.

**Implementation**:
```typescript
// packages/services/src/validation/fhirschema-validator.ts
import { FHIRSchema } from '@atomic-ehr/fhirschema';
import type { Validator, ValidationResult, StructureDefinition } from '@atomic-ehr/core';

export class FhirSchemaValidator implements Validator {
  private schemas: Map<string, FHIRSchema> = new Map();

  async init(): Promise<void> {
    // Initialize with base schemas
  }

  async loadSchema(definition: StructureDefinition): Promise<void> {
    const schema = FHIRSchema.fromStructureDefinition(definition);
    this.schemas.set(definition.id, schema);
  }

  async validate({ resource, profile }): Promise<ValidationResult> {
    const schemaId = profile || resource.resourceType;
    const schema = this.schemas.get(schemaId);

    if (!schema) {
      return {
        ok: false,
        errors: [{ message: 'Unknown resource type or profile' }]
      };
    }

    return schema.validate(resource);
  }

  async shutdown(): Promise<void> {
    this.schemas.clear();
  }
}
```

**Acceptance Criteria**:
- [ ] Service implements `Validator` interface
- [ ] Uses fhirschema for validation
- [ ] Supports dynamic schema loading
- [ ] Caches compiled schemas
- [ ] Returns structured validation results
- [ ] Includes tests with valid and invalid resources

### 5. Implement Repository Services

Create Memory, SQLite, and Postgres implementations with schema migration hooks.

**Memory Repository**:
```typescript
// packages/services/src/repository/memory-repository.ts
import type { Repository, Resource, SearchQuery, SearchResult } from '@atomic-ehr/core';

export class MemoryRepository implements Repository {
  private store: Map<string, Map<string, Resource>> = new Map();
  private history: Map<string, Resource[]> = new Map();

  async create<T extends Resource>(resource: T): Promise<T> {
    const resourceType = resource.resourceType;
    if (!this.store.has(resourceType)) {
      this.store.set(resourceType, new Map());
    }

    const id = resource.id || generateId();
    const versioned = { ...resource, id, meta: { versionId: '1', lastUpdated: new Date().toISOString() } };

    this.store.get(resourceType)!.set(id, versioned);
    this.addToHistory(resourceType, id, versioned);

    return versioned as T;
  }

  async read<T extends Resource>(resourceType: string, id: string): Promise<T | null> {
    return this.store.get(resourceType)?.get(id) as T || null;
  }

  async update<T extends Resource>(resource: T): Promise<T> {
    // Implementation
  }

  async delete(resourceType: string, id: string): Promise<void> {
    // Implementation
  }

  async search<T extends Resource>(query: SearchQuery): Promise<SearchResult<T>> {
    // Implementation
  }

  async history(resourceType: string, id: string): Promise<Resource[]> {
    const key = `${resourceType}/${id}`;
    return this.history.get(key) || [];
  }
}
```

**Acceptance Criteria**:
- [ ] MemoryRepository fully implemented
- [ ] SQLiteRepository with SQL-based storage
- [ ] Both implement `Repository` interface
- [ ] Support all CRUD operations
- [ ] Support basic search
- [ ] Support history tracking
- [ ] PostgresRepository stubbed for future work
- [ ] Schema migration hooks defined
- [ ] Comprehensive tests for all operations

### 6. Implement Logger/Audit Services

Create logger and audit implementations for lifecycle visibility.

**Console Logger**:
```typescript
// packages/services/src/logger/console-logger.ts
import type { Logger, LogEntry } from '@atomic-ehr/core';

export class ConsoleLogger implements Logger {
  constructor(private config?: { level?: string; pretty?: boolean }) {}

  async log({ level, message, data }: LogEntry): Promise<void> {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (this.config?.pretty) {
      console.log(`${prefix} ${message}`, data || '');
    } else {
      console.log(JSON.stringify({ timestamp, level, message, ...data }));
    }
  }

  async info(message: string, data?: any): Promise<void> {
    await this.log({ level: 'info', message, data });
  }

  async warn(message: string, data?: any): Promise<void> {
    await this.log({ level: 'warn', message, data });
  }

  async error(message: string, data?: any): Promise<void> {
    await this.log({ level: 'error', message, data });
  }
}
```

**Acceptance Criteria**:
- [ ] ConsoleLogger implemented
- [ ] FileAudit for file-based audit logging
- [ ] StructuredAudit for JSON logs
- [ ] All implement core interfaces
- [ ] Support different log levels
- [ ] Configurable output formats
- [ ] Tests for all implementations

### 7. Implement Terminology Service

Support `$expand` and `$lookup`.

**Implementation**:
```typescript
// packages/services/src/terminology/package-terminology.ts
import type { Terminology, ValueSet, CodeSystem, LookupResult } from '@atomic-ehr/core';

export class PackageTerminology implements Terminology {
  private valueSets: Map<string, ValueSet> = new Map();
  private codeSystems: Map<string, CodeSystem> = new Map();

  async loadFromPackage(packageResources: any[]): Promise<void> {
    for (const resource of packageResources) {
      if (resource.resourceType === 'ValueSet') {
        this.valueSets.set(resource.url, resource);
      } else if (resource.resourceType === 'CodeSystem') {
        this.codeSystems.set(resource.url, resource);
      }
    }
  }

  async expand(valueSetUrl: string): Promise<ValueSet> {
    const valueSet = this.valueSets.get(valueSetUrl);
    if (!valueSet) {
      throw new Error(`ValueSet not found: ${valueSetUrl}`);
    }

    // Expand the value set
    return expandValueSet(valueSet, this.codeSystems);
  }

  async lookup(system: string, code: string): Promise<LookupResult> {
    const codeSystem = this.codeSystems.get(system);
    if (!codeSystem) {
      throw new Error(`CodeSystem not found: ${system}`);
    }

    // Lookup the code
    return lookupCode(codeSystem, code);
  }
}
```

**Acceptance Criteria**:
- [ ] PackageTerminology extracts from packages
- [ ] TxServerTerminology for external terminology server
- [ ] Both implement `Terminology` interface
- [ ] Support `$expand` operation
- [ ] Support `$lookup` operation
- [ ] Handle missing value sets gracefully
- [ ] Tests with example value sets

### 8. Create Factory Function

Implement `createDefaultServices()`.

**Implementation**:
```typescript
// packages/services/src/factory.ts
import type { AtomicContext } from '@atomic-ehr/core';
import { CanonicalManagerService } from './canonical/canonical-manager-service';
import { FHIRPathEvaluatorService } from './fhirpath/fhirpath-evaluator-service';
import { FhirSchemaValidator } from './validation/fhirschema-validator';
import { MemoryRepository } from './repository/memory-repository';
import { ConsoleLogger } from './logger/console-logger';
import { ConsoleAudit } from './audit/console-audit';
import { PackageTerminology } from './terminology/package-terminology';

export interface ServicesConfig {
  canonicals?: any;
  validation?: any;
  repository?: any;
  logger?: any;
  audit?: any;
  terminology?: any;
}

export async function createDefaultServices(config?: ServicesConfig): Promise<AtomicContext> {
  const canonicals = new CanonicalManagerService(config?.canonicals);
  const fhirpath = new FHIRPathEvaluatorService();
  const validator = new FhirSchemaValidator(config?.validation);
  const repository = new MemoryRepository(config?.repository);
  const logger = new ConsoleLogger(config?.logger);
  const audit = new ConsoleAudit(config?.audit);
  const terminology = new PackageTerminology(config?.terminology);

  // Initialize all services
  await Promise.all([
    canonicals.init(),
    fhirpath.init(),
    validator.init(),
  ]);

  return {
    canonicals,
    fhirpath,
    validator,
    repository,
    logger,
    audit,
    terminology,
  };
}
```

**Acceptance Criteria**:
- [ ] Factory creates all default services
- [ ] Accepts optional configuration
- [ ] Initializes services properly
- [ ] Returns properly typed context
- [ ] Tests verify all services are created

### 9. Add Contract Tests

Create tests with fixture packages to validate adapters.

**Test Structure**:
```
packages/services/test/
├── fixtures/
│   ├── test-package.tgz
│   └── resources/
│       ├── patient-example.json
│       └── observation-example.json
├── canonical.test.ts
├── fhirpath.test.ts
├── validator.test.ts
├── repository.test.ts
├── logger.test.ts
├── audit.test.ts
├── terminology.test.ts
└── factory.test.ts
```

**Acceptance Criteria**:
- [ ] Contract tests for each service
- [ ] Tests use fixture packages
- [ ] Tests verify interface compliance
- [ ] Tests cover error cases
- [ ] Test coverage > 80%
- [ ] All tests pass

## Deliverables

- ✅ Working `@atomic-ehr/services` package
- ✅ All services implement `@atomic-ehr/core` interfaces
- ✅ Services emit provisioning telemetry (schema diffs, load status)
- ✅ Test coverage > 80%

## Dependencies

- `@atomic-ehr/core` interfaces must be defined
- `@atomic-ehr/fhir-canonical-manager` available
- `@atomic-ehr/fhirpath` available
- `@atomic-ehr/fhirschema` available

## Success Metrics

- [ ] All services implemented and tested
- [ ] Factory function works correctly
- [ ] Services can be swapped out easily
- [ ] Full type safety maintained
- [ ] Documentation complete
- [ ] Ready for Phase 2 integration

---

**Status**: Not Started
**Next Phase**: [02-canonical-provisioning.md](./02-canonical-provisioning.md)
