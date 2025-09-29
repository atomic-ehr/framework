# @atomic-ehr/fhir-bridge

> Bridge package integrating FHIR canonical-manager and fhirschema into the Atomic EHR framework

## Overview

`@atomic-ehr/fhir-bridge` provides a unified interface to FHIR-related functionality by bridging `@atomic-ehr/fhir-canonical-manager` and `@atomic-ehr/fhirschema` packages. This abstraction layer ensures loose coupling between the core framework and specific FHIR implementations.

## Purpose

The bridge pattern is used to:

- ✅ **Decouple** - Separate the framework from specific FHIR implementations
- ✅ **Abstract** - Provide a clean, simple API for FHIR operations
- ✅ **Centralize** - Single point of integration for all FHIR functionality
- ✅ **Extend** - Easy to swap or enhance FHIR implementations
- ✅ **Maintain** - Isolated changes to FHIR packages don't ripple through framework

## Architecture

```
┌──────────────────────────────────────┐
│     @atomic-ehr/server               │
│     @atomic-ehr/core                 │
│     @atomic-ehr/validation-bridge    │
└──────────────────────────────────────┘
                  │
                  ↓
┌──────────────────────────────────────┐
│     @atomic-ehr/fhir-bridge          │  ← Abstraction Layer
└──────────────────────────────────────┘
          │                    │
          ↓                    ↓
┌────────────────────┐  ┌────────────────────┐
│ fhir-canonical-    │  │    fhirschema      │
│    manager         │  │                    │
└────────────────────┘  └────────────────────┘
```

## Installation

```bash
bun add @atomic-ehr/fhir-bridge
```

## Features

### Package Management Bridge

Provides unified access to FHIR package loading and management:

```typescript
import { CanonicalManager } from '@atomic-ehr/fhir-bridge';

const manager = new CanonicalManager();

// Load FHIR packages
await manager.loadPackage('hl7.fhir.r4.core', '4.0.1');
await manager.loadPackage('hl7.fhir.us.core', '7.0.0');

// Query resources
const patientDefinition = manager.getResource('Patient');
const searchParams = manager.getSearchParameters('Patient');
```

### Schema Bridge

Provides access to FHIRSchema functionality:

```typescript
import { SchemaManager } from '@atomic-ehr/fhir-bridge';

const schema = new SchemaManager();

// Get resource schema
const patientSchema = schema.getSchema('Patient');

// Validate against schema
const isValid = schema.validate('Patient', patientResource);
```

## API Reference

### CanonicalManager

Manages FHIR package loading and canonical resource access.

#### Methods

##### loadPackage()

Load a FHIR package by name and version.

```typescript
async loadPackage(name: string, version: string): Promise<void>
```

**Example:**
```typescript
await manager.loadPackage('hl7.fhir.r4.core', '4.0.1');
```

##### getResource()

Get a resource definition by type.

```typescript
getResource(resourceType: string): StructureDefinition | undefined
```

**Example:**
```typescript
const patientDef = manager.getResource('Patient');
console.log(patientDef.url);  // http://hl7.org/fhir/StructureDefinition/Patient
```

##### getSearchParameters()

Get search parameters for a resource type.

```typescript
getSearchParameters(resourceType: string): SearchParameter[]
```

**Example:**
```typescript
const params = manager.getSearchParameters('Patient');
params.forEach(param => {
  console.log(`${param.name}: ${param.type}`);
});
```

##### getValueSet()

Get a ValueSet by URL.

```typescript
getValueSet(url: string): ValueSet | undefined
```

##### getCodeSystem()

Get a CodeSystem by URL.

```typescript
getCodeSystem(url: string): CodeSystem | undefined
```

##### getAllResourceTypes()

Get list of all available resource types.

```typescript
getAllResourceTypes(): string[]
```

### SchemaManager

Manages FHIRSchema access and validation.

#### Methods

##### getSchema()

Get JSON schema for a resource type.

```typescript
getSchema(resourceType: string): object
```

**Example:**
```typescript
const schema = manager.getSchema('Patient');
// Returns JSON Schema definition
```

##### validate()

Validate a resource against its schema.

```typescript
validate(resourceType: string, resource: any): ValidationResult
```

**Example:**
```typescript
const result = manager.validate('Patient', patientResource);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

##### supportsResource()

Check if a resource type is supported.

```typescript
supportsResource(resourceType: string): boolean
```

## Usage in Framework

### In Server Package

```typescript
import { CanonicalManager } from '@atomic-ehr/fhir-bridge';

class FhirServer {
  private canonicalManager: CanonicalManager;

  constructor(config) {
    this.canonicalManager = new CanonicalManager();
  }

  async loadPackages(packages: string[]) {
    for (const pkg of packages) {
      const [name, version] = pkg.split('#');
      await this.canonicalManager.loadPackage(name, version);
    }
  }

  getSupportedResourceTypes() {
    return this.canonicalManager.getAllResourceTypes();
  }
}
```

### In Validation Bridge

```typescript
import { SchemaManager } from '@atomic-ehr/fhir-bridge';

class ValidationBridge {
  private schemaManager: SchemaManager;

  constructor() {
    this.schemaManager = new SchemaManager();
  }

  async validate(resourceType: string, resource: any) {
    return this.schemaManager.validate(resourceType, resource);
  }
}
```

## Type Definitions

The package exports TypeScript types for all FHIR resources:

```typescript
import type {
  StructureDefinition,
  SearchParameter,
  ValueSet,
  CodeSystem,
  OperationDefinition
} from '@atomic-ehr/fhir-bridge';
```

## Dependencies

This package bridges:

- `@atomic-ehr/fhir-canonical-manager` - FHIR package management
- `@atomic-ehr/fhirschema` - FHIR schema and validation

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run dev

# Type checking
bun run typecheck

# Tests
bun test

# Clean
bun run clean
```

## Design Rationale

### Why a Bridge?

1. **Modularity** - Core framework doesn't depend directly on FHIR implementations
2. **Testability** - Easy to mock for testing
3. **Flexibility** - Can swap FHIR implementations without framework changes
4. **Evolution** - FHIR packages can evolve independently
5. **Clarity** - Clear boundary between framework and FHIR specifics

### Bridge Pattern Benefits

```typescript
// Without bridge - direct dependency
import { loadPackage } from '@some-fhir-library';  // ❌ Tight coupling

// With bridge - abstraction
import { CanonicalManager } from '@atomic-ehr/fhir-bridge';  // ✅ Loose coupling
```

## Integration Points

### Server Integration

The server package uses the bridge for:
- Loading FHIR packages specified in configuration
- Generating capability statements from loaded resources
- Providing resource metadata to routes

### Validation Integration

The validation package uses the bridge for:
- Accessing resource schemas
- Validating resources against FHIR specifications
- Checking cardinality and required fields

### Routing Integration

The routing package uses the bridge for:
- Discovering available resource types
- Finding search parameters for each resource
- Validating operation parameters

## Future Enhancements

Planned additions to the bridge:

- [ ] Terminology service integration
- [ ] Narrative generation
- [ ] Resource conversion between versions
- [ ] Profile validation
- [ ] Reference resolution
- [ ] Subscription support

## Contributing

This package is part of the Atomic EHR framework. See the main repository for contribution guidelines.

## License

MIT © Atomic EHR Team