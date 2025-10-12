# Phase 2: Canonical Provisioning Pipeline

**Timeline**: Week 2
**Goal**: Transform downloaded packages into runtime artifacts.

## Overview

This phase builds the provisioning pipeline that converts FHIR packages (StructureDefinitions, ValueSets, SearchParameters) into concrete runtime artifacts needed by repositories, validators, and the interactions layer.

## Architecture

```
Package Download
      ↓
Canonical Bundle Builder
      ↓
┌─────────────────────────────────────┐
│  Provisioning Pipeline              │
│                                     │
│  ├─ Schema Generator                │
│  │   └─ Repository DDL/migrations   │
│  ├─ Index Builder                   │
│  │   └─ Search parameter indexes    │
│  ├─ Validator Compiler              │
│  │   └─ JSON Schema + TS types      │
│  └─ Terminology Loader              │
│      └─ ValueSets + CodeSystems     │
└─────────────────────────────────────┘
      ↓
Runtime Artifacts
```

## Tasks

### 1. Build Canonical Bundle Compiler

Convert package resources into structured `CanonicalBundle`.

**Implementation**:
```typescript
// packages/services/src/canonical/bundle-builder.ts
export interface CanonicalBundle {
  id: string;
  packageId: string;
  version: string;
  structureDefinitions: StructureDefinition[];
  searchParameters: SearchParameter[];
  valueSets: ValueSet[];
  codeSystems: CodeSystem[];
  capabilityStatement?: CapabilityStatement;
  metadata: {
    generatedAt: string;
    hash: string; // Content hash for change detection
  };
}

export async function buildCanonicalBundle(
  packagePath: string
): Promise<CanonicalBundle> {
  // 1. Load package.json for metadata
  const pkg = await loadPackageJson(packagePath);

  // 2. Scan for FHIR resources
  const resources = await scanPackageResources(packagePath);

  // 3. Group by resource type
  const structureDefinitions = resources.filter(r => r.resourceType === 'StructureDefinition');
  const searchParameters = resources.filter(r => r.resourceType === 'SearchParameter');
  const valueSets = resources.filter(r => r.resourceType === 'ValueSet');
  const codeSystems = resources.filter(r => r.resourceType === 'CodeSystem');

  // 4. Calculate content hash
  const hash = hashContent(resources);

  return {
    id: generateId(),
    packageId: pkg.name,
    version: pkg.version,
    structureDefinitions,
    searchParameters,
    valueSets,
    codeSystems,
    metadata: {
      generatedAt: new Date().toISOString(),
      hash
    }
  };
}
```

**Acceptance Criteria**:
- [ ] Bundle builder extracts all resource types
- [ ] Produces deterministic output
- [ ] Generates content hash for change detection
- [ ] Includes package metadata
- [ ] Tests with fixture packages

### 2. Generate Repository Schema Definitions

Create DDL and migration plans from StructureDefinitions.

**Implementation**:
```typescript
// packages/services/src/canonical/schema-generator.ts
export interface SchemaDefinition {
  resourceType: string;
  profile?: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  constraints: ConstraintDefinition[];
}

export interface MigrationPlan {
  up: string[]; // SQL statements to apply
  down: string[]; // SQL statements to rollback
  changes: SchemaChange[];
}

export function generateSchema(
  structureDefinition: StructureDefinition
): SchemaDefinition {
  const resourceType = structureDefinition.type;

  // Generate columns from elements
  const columns = structureDefinition.snapshot.element
    .map(element => generateColumn(element))
    .filter(Boolean);

  // Generate indexes from search parameters
  const indexes = generateIndexes(structureDefinition);

  // Generate constraints from invariants
  const constraints = generateConstraints(structureDefinition);

  return {
    resourceType,
    profile: structureDefinition.url,
    columns,
    indexes,
    constraints
  };
}

export function createMigrationPlan(
  currentSchema: SchemaDefinition | null,
  targetSchema: SchemaDefinition
): MigrationPlan {
  const changes: SchemaChange[] = [];

  // Detect changes
  if (!currentSchema) {
    // New table
    changes.push({ type: 'create-table', table: targetSchema.resourceType });
  } else {
    // Diff columns
    changes.push(...diffColumns(currentSchema.columns, targetSchema.columns));

    // Diff indexes
    changes.push(...diffIndexes(currentSchema.indexes, targetSchema.indexes));
  }

  // Generate SQL
  const up = changes.map(change => generateUpSQL(change));
  const down = changes.map(change => generateDownSQL(change));

  return { up, down, changes };
}
```

**Schema Example**:
```typescript
// For Patient resource
{
  resourceType: 'Patient',
  profile: 'http://hl7.org/fhir/StructureDefinition/Patient',
  columns: [
    { name: 'id', type: 'VARCHAR(64)', primaryKey: true },
    { name: 'resource', type: 'JSONB', nullable: false },
    { name: 'identifier', type: 'JSONB', indexed: true },
    { name: 'name', type: 'JSONB', indexed: true },
    { name: 'birthDate', type: 'DATE', indexed: true },
    { name: 'gender', type: 'VARCHAR(20)', indexed: true },
    { name: 'lastUpdated', type: 'TIMESTAMP', nullable: false }
  ],
  indexes: [
    { name: 'idx_patient_identifier', columns: ['identifier'], type: 'gin' },
    { name: 'idx_patient_name', columns: ['name'], type: 'gin' },
    { name: 'idx_patient_birthdate', columns: ['birthDate'], type: 'btree' }
  ],
  constraints: []
}
```

**Acceptance Criteria**:
- [ ] Schema generator produces DDL for all resource types
- [ ] Migration planner detects schema changes
- [ ] Generates SQL for up/down migrations
- [ ] Supports multiple database backends (SQLite, Postgres)
- [ ] Tests verify schema correctness

### 3. Produce Validator JSON Schema and TypeScript Declarations

Generate validation artifacts per profile.

**Implementation**:
```typescript
// packages/services/src/canonical/validator-compiler.ts
export interface ValidatorArtifacts {
  jsonSchema: JSONSchema;
  typeDeclaration: string;
}

export function compileValidator(
  structureDefinition: StructureDefinition
): ValidatorArtifacts {
  // Generate JSON Schema
  const jsonSchema = generateJSONSchema(structureDefinition);

  // Generate TypeScript interface
  const typeDeclaration = generateTypeScript(structureDefinition);

  return { jsonSchema, typeDeclaration };
}

function generateJSONSchema(sd: StructureDefinition): JSONSchema {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const element of sd.snapshot.element) {
    if (element.path === sd.type) continue; // Skip root

    const property = elementToProperty(element);
    const name = element.path.split('.').pop()!;

    properties[name] = property;

    if (element.min > 0) {
      required.push(name);
    }
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    required,
    additionalProperties: true
  };
}

function generateTypeScript(sd: StructureDefinition): string {
  const interfaceName = sd.type;
  const properties: string[] = [];

  for (const element of sd.snapshot.element) {
    if (element.path === sd.type) continue;

    const name = element.path.split('.').pop()!;
    const type = elementToTSType(element);
    const optional = element.min === 0 ? '?' : '';

    properties.push(`  ${name}${optional}: ${type};`);
  }

  return `
export interface ${interfaceName} {
  resourceType: '${interfaceName}';
${properties.join('\n')}
}
  `.trim();
}
```

**Output Example**:
```typescript
// Generated: packages/types-r4/src/Patient.ts
export interface Patient {
  resourceType: 'Patient';
  id?: string;
  meta?: Meta;
  identifier?: Identifier[];
  name?: HumanName[];
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
}
```

**Acceptance Criteria**:
- [ ] JSON Schema generator produces valid schemas
- [ ] TypeScript generator produces compilable types
- [ ] Artifacts written to `/generated` directory
- [ ] Cache invalidation on package changes
- [ ] Tests verify generated artifacts

### 4. Register Search Parameters and Index Requirements

Map search parameters to repository indexes.

**Implementation**:
```typescript
// packages/services/src/canonical/search-registry.ts
export interface SearchParameterRegistration {
  code: string;
  resourceType: string;
  type: 'string' | 'token' | 'reference' | 'date' | 'number' | 'quantity';
  expression?: string; // FHIRPath expression
  xpath?: string;
  target?: string[]; // For reference parameters
  modifier?: string[];
  indexStrategy: 'btree' | 'gin' | 'gist' | 'hash';
}

export class SearchRegistry {
  private parameters: Map<string, SearchParameterRegistration[]> = new Map();

  register(searchParam: SearchParameter): void {
    for (const base of searchParam.base) {
      if (!this.parameters.has(base)) {
        this.parameters.set(base, []);
      }

      const registration: SearchParameterRegistration = {
        code: searchParam.code,
        resourceType: base,
        type: searchParam.type,
        expression: searchParam.expression,
        xpath: searchParam.xpath,
        target: searchParam.target,
        modifier: searchParam.modifier,
        indexStrategy: this.determineIndexStrategy(searchParam)
      };

      this.parameters.get(base)!.push(registration);
    }
  }

  getForResource(resourceType: string): SearchParameterRegistration[] {
    return this.parameters.get(resourceType) || [];
  }

  private determineIndexStrategy(param: SearchParameter): 'btree' | 'gin' | 'gist' | 'hash' {
    switch (param.type) {
      case 'string':
        return 'gin'; // Full-text search
      case 'token':
        return 'hash'; // Exact match
      case 'date':
      case 'number':
        return 'btree'; // Range queries
      case 'reference':
        return 'btree'; // FK lookups
      default:
        return 'btree';
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Search registry maps parameters to indexes
- [ ] Supports all search parameter types
- [ ] Determines optimal index strategy
- [ ] Integrated with schema generator
- [ ] Tests verify index generation

### 5. Implement Change Detection

Hash-based diffing and cache invalidation.

**Implementation**:
```typescript
// packages/services/src/canonical/change-detector.ts
export interface ChangeSet {
  added: string[]; // Resource URLs
  modified: string[];
  removed: string[];
  hash: string;
}

export class ChangeDetector {
  private lastHash?: string;
  private lastBundle?: CanonicalBundle;

  detect(newBundle: CanonicalBundle): ChangeSet {
    if (!this.lastBundle) {
      return {
        added: this.getAllUrls(newBundle),
        modified: [],
        removed: [],
        hash: newBundle.metadata.hash
      };
    }

    const changeSet: ChangeSet = {
      added: [],
      modified: [],
      removed: [],
      hash: newBundle.metadata.hash
    };

    // Compare structure definitions
    const oldDefs = new Map(
      this.lastBundle.structureDefinitions.map(sd => [sd.url, sd])
    );
    const newDefs = new Map(
      newBundle.structureDefinitions.map(sd => [sd.url, sd])
    );

    // Find added/modified
    for (const [url, newDef] of newDefs) {
      const oldDef = oldDefs.get(url);
      if (!oldDef) {
        changeSet.added.push(url);
      } else if (hashResource(oldDef) !== hashResource(newDef)) {
        changeSet.modified.push(url);
      }
    }

    // Find removed
    for (const url of oldDefs.keys()) {
      if (!newDefs.has(url)) {
        changeSet.removed.push(url);
      }
    }

    this.lastBundle = newBundle;
    return changeSet;
  }
}
```

**Acceptance Criteria**:
- [ ] Change detector identifies added/modified/removed resources
- [ ] Uses content hashing for comparison
- [ ] Triggers appropriate cache invalidation
- [ ] Tests verify change detection accuracy

### 6. Orchestrate Terminology Refresh Hooks

Load terminology after package updates.

**Implementation**:
```typescript
// packages/services/src/canonical/terminology-orchestrator.ts
export class TerminologyOrchestrator {
  constructor(
    private terminology: Terminology,
    private logger: Logger
  ) {}

  async refresh(bundle: CanonicalBundle): Promise<void> {
    this.logger.info('Refreshing terminology', {
      valueSets: bundle.valueSets.length,
      codeSystems: bundle.codeSystems.length
    });

    // Load ValueSets
    for (const valueSet of bundle.valueSets) {
      await this.terminology.loadValueSet(valueSet);
    }

    // Load CodeSystems
    for (const codeSystem of bundle.codeSystems) {
      await this.terminology.loadCodeSystem(codeSystem);
    }

    this.logger.info('Terminology refresh complete');
  }
}
```

**Acceptance Criteria**:
- [ ] Orchestrator triggers terminology refresh on package changes
- [ ] Loads ValueSets and CodeSystems
- [ ] Logs refresh status
- [ ] Tests verify terminology loading

### 7. Write Integration Tests

Test package add/remove/update scenarios.

**Test Scenarios**:
```typescript
// packages/services/test/provisioning.test.ts
describe('Provisioning Pipeline', () => {
  test('should provision new package', async () => {
    // Load package
    const bundle = await buildCanonicalBundle('fixtures/hl7.fhir.r4.core.tgz');

    // Generate schemas
    const schemas = bundle.structureDefinitions.map(generateSchema);
    expect(schemas).toHaveLength(bundle.structureDefinitions.length);

    // Generate artifacts
    const artifacts = bundle.structureDefinitions.map(compileValidator);
    expect(artifacts).toHaveLength(bundle.structureDefinitions.length);
  });

  test('should detect schema changes', async () => {
    const bundle1 = await buildCanonicalBundle('fixtures/package-v1.tgz');
    const bundle2 = await buildCanonicalBundle('fixtures/package-v2.tgz');

    const detector = new ChangeDetector();
    detector.detect(bundle1);
    const changes = detector.detect(bundle2);

    expect(changes.modified).toContain('http://example.org/Patient');
  });

  test('should generate migration plan', async () => {
    const oldSchema = generateSchema(patientV1);
    const newSchema = generateSchema(patientV2);

    const plan = createMigrationPlan(oldSchema, newSchema);

    expect(plan.up).toContain('ALTER TABLE');
    expect(plan.changes.length).toBeGreaterThan(0);
  });
});
```

**Acceptance Criteria**:
- [ ] Integration tests for full pipeline
- [ ] Tests cover package add/remove/update
- [ ] Tests verify schema migrations
- [ ] Tests verify artifact generation
- [ ] Automated regression suite in place

## Deliverables

- ✅ Canonical bundle builder with deterministic output
- ✅ Schema/index migration plan artifacts
- ✅ Type-safe declaration output published to `/generated`
- ✅ Automated regression suite for package updates

## Dependencies

- Phase 1: Service adapters must be complete
- `@atomic-ehr/fhir-canonical-manager` for package loading
- `@atomic-ehr/fhirschema` for validation logic

## Integration Points

- Canonical bundle feeds into interaction layer (Phase 3)
- Schema definitions used by repository implementations
- Validator artifacts used by validation services
- Search registry used by interaction layer

## Success Metrics

- [ ] Provisioning pipeline processes packages end-to-end
- [ ] Schema migrations work correctly
- [ ] Generated TypeScript types compile without errors
- [ ] Change detection accurately identifies diffs
- [ ] Full test coverage for all scenarios
- [ ] Ready for Phase 3 integration

---

**Status**: Not Started
**Previous Phase**: [01-service-adapters.md](./01-service-adapters.md)
**Next Phase**: [03-interaction-layer.md](./03-interaction-layer.md)
