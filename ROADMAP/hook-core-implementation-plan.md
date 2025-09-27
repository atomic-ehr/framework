# FHIR Framework Implementation Plan

## Overview
Implementation plan for a simple hook-based FHIR framework. Build working components first, add features later.

## Phase 1: Foundation (Weeks 1-4)

### Milestone 1.1: Basic Hooks
**Duration:** 1 week

#### Tasks
- `@atomic-ehr/hooks` package
- Hook registry that stores and runs hooks
- Simple request/response context

```typescript
interface Hook {
  name: string;
  phase: string;
  handler: (context: Context) => void;
}

class HookRegistry {
  add(hook: Hook): void;
  run(phase: string, context: Context): void;
}

interface Context {
  request: Request;
  response: Response;
}
```

#### Success Criteria
- [ ] Can register hooks
- [ ] Can run hooks in order
- [ ] Basic tests pass

### Milestone 1.2: HTTP Server
**Duration:** 1 week

#### Tasks
- `@atomic-ehr/http` package
- Basic HTTP server that can receive requests
- Call hooks at request start and response end

```typescript
interface Server {
  listen(port: number): void;
  addHook(hook: Hook): void;
}

class HttpServer implements Server {
  listen(port: number): void;
  addHook(hook: Hook): void;
  private handleRequest(req, res): void;
}
```

#### Success Criteria
- [ ] HTTP server starts and accepts requests
- [ ] Hooks run before and after request handling
- [ ] Can return JSON responses

### Milestone 1.3: FHIR URL Pattern Matching
**Duration:** 1 week

#### Tasks
- Router that matches FHIR URL patterns
- Support for FHIR HTTP specification patterns

```typescript
interface FhirRoute {
  method: string;
  pattern: FhirUrlPattern;
  operation: FhirOperation;
  handler: (context: Context) => void;
}

enum FhirUrlPattern {
  // Instance level: [base]/[type]/[id]
  READ = '/:resourceType/:id',
  UPDATE = '/:resourceType/:id',
  DELETE = '/:resourceType/:id',

  // Type level: [base]/[type]
  CREATE = '/:resourceType',
  SEARCH = '/:resourceType',

  // System level: [base]
  BATCH = '/',
  CAPABILITIES = '/metadata'
}

class FhirRouter {
  match(method: string, url: string): FhirRoute | null;
}
```

#### Success Criteria
- [ ] Match FHIR URL patterns per specification
- [ ] Support instance, type, and system level operations
- [ ] Extract resourceType and id from URLs

## Phase 2: FHIR Basics (Weeks 4-6)

### Milestone 2.1: Package Loading and Schema Conversion
**Duration:** 1 week

#### Tasks
- `@atomic-ehr/packages` module
- Load FHIR packages and extract StructureDefinitions
- Use existing `@atomic-ehr/fhirschema` for conversion
- Generate validation schemas for all resource types

```typescript
import { translate, type FHIRSchema, type StructureDefinition } from '@atomic-ehr/fhirschema';

interface FhirPackage {
  id: string;
  version: string;
  structureDefinitions: StructureDefinition[];
  operationDefinitions: OperationDefinition[];
  searchParameters: SearchParameter[];
  fhirSchemas: Map<string, FHIRSchema>; // Converted schemas
}

class PackageLoader {
  load(packagePath: string): FhirPackage;
  getStructureDefinitions(): StructureDefinition[];
  getOperationDefinitions(): OperationDefinition[];
  getFhirSchemas(): Map<string, FHIRSchema>;
}

class SchemaConverter {
  convertStructureDefinition(structDef: StructureDefinition): FHIRSchema {
    // Use existing fhirschema translate function
    return translate(structDef);
  }

  convertPackage(structDefs: StructureDefinition[]): Map<string, FHIRSchema> {
    const schemas = new Map<string, FHIRSchema>();
    for (const structDef of structDefs) {
      if (structDef.kind === 'resource') {
        const schema = translate(structDef);
        schemas.set(structDef.type, schema);
      }
    }
    return schemas;
  }
}
```

#### Success Criteria
- [ ] Load hl7.fhir.r4.core package successfully
- [ ] Extract all StructureDefinitions from package
- [ ] Convert StructureDefinitions to FHIRSchema using translate()
- [ ] Generate FHIRSchema for Patient, Observation, Practitioner
- [ ] Extract OperationDefinitions for $validate, $everything

### Milestone 2.2: Dynamic Route Generation
**Duration:** 1 week

#### Tasks
- Generate FHIR routes from StructureDefinitions
- Support all FHIR HTTP operations per specification
- Create handlers for each resource type

```typescript
class RouteGenerator {
  generateFromStructureDefinition(structDef: StructureDefinition): FhirRoute[];
  generateFromOperationDefinition(opDef: OperationDefinition): FhirRoute[];
}

interface GeneratedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  operation: FhirOperation;
  resourceType: string;
  handler: FhirOperationHandler;
}

enum FhirOperation {
  READ = 'read',
  VREAD = 'vread',
  UPDATE = 'update',
  CREATE = 'create',
  DELETE = 'delete',
  SEARCH_TYPE = 'search-type',
  SEARCH_SYSTEM = 'search-system',
  CAPABILITIES = 'capabilities',
  OPERATION = 'operation' // For $validate, $everything, etc.
}

class ResourceHandler {
  constructor(resourceType: string, structureDefinition: StructureDefinition);

  read(id: string): Resource;
  create(resource: Resource): Resource;
  update(id: string, resource: Resource): Resource;
  delete(id: string): void;
  search(params: SearchParams): Bundle;
}
```

#### Success Criteria
- [ ] Generate all CRUD routes for each resource in R4 Core
- [ ] GET /Patient/123 (read operation)
- [ ] POST /Patient (create operation)
- [ ] PUT /Patient/123 (update operation)
- [ ] DELETE /Patient/123 (delete operation)
- [ ] GET /Patient?name=john (search operation)
- [ ] GET /metadata (capabilities operation)
- [ ] POST /Patient/$validate (custom operation)

## Phase 3: Validation (Weeks 7-8)

### Milestone 3.1: FHIRSchema Validation
**Duration:** 1 week

#### Tasks
- Integrate existing `@atomic-ehr/fhirschema` for validation
- Use validateSchema function with proper context
- Return FHIR OperationOutcome on validation errors

```typescript
import {
  validateSchema,
  type FHIRSchema,
  type ValidationContext,
  type ValidationResult,
  type ValidationError
} from '@atomic-ehr/fhirschema';

class FhirSchemaValidator {
  private schemas: Map<string, FHIRSchema> = new Map();

  addSchema(resourceType: string, schema: FHIRSchema): void {
    this.schemas.set(resourceType, schema);
  }

  validate(resource: any, resourceType: string): OperationOutcome {
    const schema = this.schemas.get(resourceType);
    if (!schema) {
      throw new Error(`No schema found for ${resourceType}`);
    }

    const context: ValidationContext = {
      schemas: Object.fromEntries(this.schemas)
    };

    const result = validateSchema(context, [resourceType], resource);
    if (!result.valid) {
      return this.createOperationOutcome(result.errors);
    }

    return { resourceType: 'OperationOutcome', issue: [] };
  }

  private createOperationOutcome(errors: ValidationError[]): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: errors.map(error => ({
        severity: 'error',
        code: 'structure',
        details: { text: error.message || error.type },
        expression: error.path.map(String)
      }))
    };
  }
}

class ValidationHook implements Hook {
  name = 'fhirschema-validation';
  phase = 'before-create';

  constructor(private validator: FhirSchemaValidator) {}

  handler(context: FhirContext): void {
    const outcome = this.validator.validate(context.resource, context.resourceType);

    if (outcome.issue.length > 0) {
      throw new FhirValidationError(outcome);
    }
  }
}
```

#### Success Criteria
- [ ] Use existing @atomic-ehr/fhirschema validateSchema function
- [ ] Validate Patient resources using FHIRSchema
- [ ] Check required fields, cardinality, and type constraints
- [ ] Return detailed OperationOutcome with error paths and types
- [ ] Validation runs for create, update, patch operations
- [ ] Support validation error codes like FS001, FS002, etc.

### Milestone 3.2: Capability Statement Generation
**Duration:** 1 week

#### Tasks
- Generate FHIR CapabilityStatement from loaded packages
- Report supported resources and operations
- Implement /metadata endpoint

```typescript
class CapabilityStatementGenerator {
  generate(packages: FhirPackage[]): CapabilityStatement;
  addResourceCapabilities(structDef: StructureDefinition): RestResource;
  addOperationCapabilities(opDef: OperationDefinition): OperationDefinition;
}

interface RestResource {
  type: string;
  profile?: string;
  supportedProfile?: string[];
  interaction: ResourceInteraction[];
  searchParam?: SearchParameter[];
  operation?: OperationDefinition[];
}

interface ResourceInteraction {
  code: 'read' | 'vread' | 'update' | 'patch' | 'delete' | 'history-instance' | 'history-type' | 'create' | 'search-type';
  documentation?: string;
}
```

#### Success Criteria
- [ ] Generate CapabilityStatement for loaded R4 Core
- [ ] List all supported resource types (Patient, Observation, etc.)
- [ ] Report supported interactions per resource
- [ ] Include search parameters for each resource
- [ ] GET /metadata returns valid CapabilityStatement

## Phase 4: Polish (Weeks 9-10)

### Milestone 4.1: Error Handling
**Duration:** 1 week

#### Tasks
- Proper FHIR error responses
- Logging and debugging
- Better validation messages

```typescript
class FhirError extends Error {
  statusCode: number;
  operationOutcome: OperationOutcome;
}

class ErrorHook implements Hook {
  phase = 'on-error';
  handler(context: Context): void;
}
```

#### Success Criteria
- [ ] All errors return proper OperationOutcome
- [ ] Log requests and errors
- [ ] Clear error messages for developers

### Milestone 4.2: Documentation
**Duration:** 1 week

#### Tasks
- Write getting started guide
- API documentation
- Code examples

#### Success Criteria
- [ ] 15-minute tutorial that builds working FHIR server
- [ ] Document all public APIs
- [ ] Examples for common use cases

## Success Metrics

### Must Have (End of Phase 4)
- [ ] Working FHIR R4 server with all resource types from hl7.fhir.r4.core
- [ ] Dynamic route generation from StructureDefinitions
- [ ] All FHIR HTTP operations: read, vread, create, update, delete, search
- [ ] StructureDefinition-based validation
- [ ] Proper FHIR OperationOutcome error responses
- [ ] GET /metadata returns CapabilityStatement

### FHIR Compliance Requirements
Per https://build.fhir.org/http.html, server MUST support:
- [ ] Content negotiation (application/fhir+json, application/fhir+xml)
- [ ] Resource versioning (ETag, If-Match, If-None-Match headers)
- [ ] Proper HTTP status codes (200, 201, 404, 409, 422, etc.)
- [ ] OperationOutcome for all error conditions
- [ ] Case-sensitive URLs
- [ ] UTF-8 encoding

### Nice to Have (Future phases)
- [ ] Search parameters from SearchParameter definitions
- [ ] Conditional operations (conditional create, update, delete)
- [ ] Bundle operations (batch/transaction)
- [ ] History operations
- [ ] Custom operations from OperationDefinitions

## Package Structure

Final packages:
- `@atomic-ehr/hooks` - Hook registry and execution
- `@atomic-ehr/http` - HTTP server and routing
- `@atomic-ehr/packages` - FHIR package loading and schema conversion
- `@atomic-ehr/server` - Main server class and configuration

External dependencies:
- `@atomic-ehr/fhirschema` - FHIRSchema converter and validator (existing)
- `@atomic-ehr/fhir-canonical-manager` - FHIR package management

FHIRSchema API (from existing package):
- `translate(structureDefinition)` - Convert StructureDefinition to FHIRSchema
- `validateSchema(context, schemaUrls, resource)` - Validate resource against schema
- Types: `FHIRSchema`, `ValidationContext`, `ValidationResult`, `ValidationError`

## Example Usage

```typescript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  packages: ['hl7.fhir.r4.core'],
  port: 3000
});

// Add custom validation hook
server.addHook({
  name: 'custom-patient-validation',
  phase: 'before-create',
  resourceType: 'Patient',
  handler: (context) => {
    // Custom business logic
    if (!context.resource.name?.[0]?.family) {
      throw new FhirValidationError('Patient must have family name');
    }
  }
});

await server.start();
```

**Result**: Working FHIR R4 server with ~150 resource types and full CRUD operations.

**Auto-generated routes** (from hl7.fhir.r4.core StructureDefinitions):
- `GET /Patient/123` (read Patient)
- `POST /Patient` (create Patient)
- `PUT /Patient/123` (update Patient)
- `DELETE /Patient/123` (delete Patient)
- `GET /Patient?name=smith` (search Patients)
- `GET /Observation/456` (read Observation)
- `POST /Observation` (create Observation)
- ... (same for all ~150 R4 resource types)
- `GET /metadata` (CapabilityStatement)

**Auto-generated validation** (using @atomic-ehr/fhirschema):
- Patient.name cardinality 1..* (required, array)
- Patient.birthDate must be valid date format
- Patient.gender must be enum value (male|female|other|unknown)
- Observation.status required enum (registered|preliminary|final|amended|...)
- Observation.code required CodeableConcept
- Observation.subject required Reference(Patient|Group|Device|Location)
- ... (all R4 constraints with rich FHIRSchema validation)