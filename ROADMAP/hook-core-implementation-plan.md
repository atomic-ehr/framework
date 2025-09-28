# FHIR Framework Implementation Plan

## Overview
Implementation plan for a simple hook-based FHIR framework. Build working components first, add features later.

## Phase 1: Extend Core (Weeks 1-2)

### Milestone 1.1: Add Hooks to @atomic-ehr/core
**Duration:** 1 week

#### Tasks
- Extend existing `@atomic-ehr/core` package with hooks system
- Build on existing base interfaces (App/Req/Res/Error, DI, Logger, Clock, Config, Events)
- Hook registry and execution pipeline

```typescript
// Extend existing @atomic-ehr/core interfaces
import { AppContext, RequestContext, ResponseContext } from '@atomic-ehr/core';

interface Hook {
  name: string;
  phase: HookPhase;
  resourceType?: string;
  priority?: number;
  handler: (context: HookContext) => Promise<void>;
}

type HookPhase = 'before-request' | 'before-create' | 'before-update' | 'before-delete' | 'after-response' | 'on-error';

interface HookContext extends RequestContext {
  resource?: any;
  resourceType?: string;
  operation?: string;
}

class HookRegistry {
  add(hook: Hook): void;
  run(phase: HookPhase, context: HookContext): Promise<void>;
  getHooks(phase: HookPhase, resourceType?: string): Hook[];
}
```

#### Success Criteria
- [ ] Hooks integrate with existing @atomic-ehr/core interfaces
- [ ] Can register and execute hooks
- [ ] Hook execution pipeline works
- [ ] Tests pass with existing core functionality

### Milestone 1.2: Build @atomic-ehr/server Package
**Duration:** 1 week

#### Tasks
- Create new `@atomic-ehr/server` package
- HTTP server with FHIR URL routing
- Integration with @atomic-ehr/core hooks

```typescript
import { HookRegistry, HookContext } from '@atomic-ehr/core';

interface FhirServerConfig {
  port: number;
  packages: string[];
}

class FhirServer {
  private hooks: HookRegistry;

  constructor(config: FhirServerConfig);

  addHook(hook: Hook): void;
  listen(): Promise<void>;

  private handleRequest(req: Request, res: Response): Promise<void>;
  private callHooks(phase: HookPhase, context: HookContext): Promise<void>;
}
```

#### Success Criteria
- [ ] HTTP server starts and accepts requests
- [ ] FHIR URL patterns recognized (/Patient/123, /Patient, etc.)
- [ ] Hooks execute at appropriate phases
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

## Phase 2: FHIR Integration (Weeks 3-4)

### Milestone 2.1: Bridge Packages
**Duration:** 1 week

#### Tasks
- Create `@atomic-ehr/fhir-bridge` package
- Create `@atomic-ehr/packages` for package loading
- Bridge integration with existing external packages
- Schema conversion using existing `@atomic-ehr/fhirschema`

```typescript
// @atomic-ehr/fhir-bridge - Bridge to external packages
import { translate, type FHIRSchema, type StructureDefinition } from '@atomic-ehr/fhirschema';
import { CanonicalManager } from '@atomic-ehr/fhir-canonical-manager';

class FhirBridge {
  private canonicalManager: CanonicalManager;

  async loadPackage(packageName: string): Promise<FhirPackage>;
  convertToSchemas(structDefs: StructureDefinition[]): Map<string, FHIRSchema>;
}

// @atomic-ehr/packages - Package loading functionality
class PackageLoader {
  constructor(private fhirBridge: FhirBridge);

  async load(packageName: string): Promise<FhirPackage>;
  getSchemas(): Map<string, FHIRSchema>;
}

// Integration into @atomic-ehr/server
class FhirServer {
  constructor(config: FhirServerConfig) {
    this.bridge = new FhirBridge();
    this.packages = new PackageLoader(this.bridge);
  }
}
```

#### Success Criteria
- [ ] Bridge packages created and integrated into server
- [ ] Load hl7.fhir.r4.core via canonical-manager bridge
- [ ] Convert to FHIRSchema using fhirschema bridge
- [ ] FhirServer automatically incorporates bridges
- [ ] No manual bridge wiring required by users

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

## Phase 3: Validation and Capabilities (Weeks 5-6)

### Milestone 3.1: Validation Bridge Integration
**Duration:** 1 week

#### Tasks
- Create `@atomic-ehr/validation-bridge` package
- Integrate existing `@atomic-ehr/fhirschema` validation
- Auto-integrate validation bridge into server
- FHIR OperationOutcome error responses

```typescript
// @atomic-ehr/validation-bridge - Validation integration bridge
import { validateSchema, type ValidationContext } from '@atomic-ehr/fhirschema';
import { Hook, HookContext } from '@atomic-ehr/core';

class ValidationBridge {
  private schemas: Map<string, FHIRSchema> = new Map();

  setSchemas(schemas: Map<string, FHIRSchema>): void {
    this.schemas = schemas;
  }

  createValidationHook(): Hook {
    return {
      name: 'fhir-validation',
      phase: 'before-create',
      handler: async (context: HookContext) => {
        const result = validateSchema(
          { schemas: Object.fromEntries(this.schemas) },
          [context.resourceType],
          context.resource
        );

        if (!result.valid) {
          throw new FhirValidationError(this.createOperationOutcome(result.errors));
        }
      }
    };
  }
}

// Auto-integration into @atomic-ehr/server
class FhirServer {
  constructor(config: FhirServerConfig) {
    this.validationBridge = new ValidationBridge();

    // Auto-register validation hook
    this.addHook(this.validationBridge.createValidationHook());
  }
}
```

#### Success Criteria
- [ ] Validation bridge auto-integrates into FhirServer
- [ ] Uses existing @atomic-ehr/fhirschema validateSchema function
- [ ] Validation hook automatically registered
- [ ] Returns proper FHIR OperationOutcome on errors
- [ ] No manual validation setup required by users

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

## Phase 4: Polish and Documentation (Weeks 7-8)

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

### Core Framework Packages (within framework monorepo):
- `@atomic-ehr/core` - **Existing package extended** with hooks system + base interfaces
- `@atomic-ehr/server` - Main FHIR server with HTTP handling and dynamic routing
- `@atomic-ehr/packages` - FHIR package loading and schema conversion

### Bridge Packages (separate but incorporated):
- `@atomic-ehr/fhir-bridge` - Bridge to fhirschema and canonical-manager
- `@atomic-ehr/validation-bridge` - Validation integration bridge

### External Dependencies (existing):
- `@atomic-ehr/fhirschema` - FHIRSchema converter and validator (existing)
- `@atomic-ehr/fhir-canonical-manager` - FHIR package management (existing)

### FHIRSchema API (from existing package):
- `translate(structureDefinition)` - Convert StructureDefinition to FHIRSchema
- `validateSchema(context, schemaUrls, resource)` - Validate resource against schema
- Types: `FHIRSchema`, `ValidationContext`, `ValidationResult`, `ValidationError`

## Example Usage

```typescript
import { FhirServer } from '@atomic-ehr/server';

// Simple server setup - bridges auto-integrate
const server = new FhirServer({
  packages: ['hl7.fhir.r4.core'],
  port: 3000
});

// Add custom business logic via hooks
server.addHook({
  name: 'custom-patient-validation',
  phase: 'before-create',
  resourceType: 'Patient',
  handler: async (context) => {
    // Custom business logic
    if (!context.resource.name?.[0]?.family) {
      throw new FhirValidationError('Patient must have family name');
    }
  }
});

await server.listen();
console.log('FHIR server running on port 3000');
```

**What you get automatically**:

### Auto-integrated Bridges:
- `@atomic-ehr/fhir-bridge` - Loads packages via canonical-manager
- `@atomic-ehr/validation-bridge` - Validates using fhirschema
- `@atomic-ehr/packages` - Converts StructureDefinitions to schemas

### Auto-generated Routes (from hl7.fhir.r4.core):
- `GET /Patient/123` (read Patient)
- `POST /Patient` (create Patient) + auto-validation
- `PUT /Patient/123` (update Patient) + auto-validation
- `DELETE /Patient/123` (delete Patient)
- `GET /Patient?name=smith` (search Patients)
- ... (same for all ~150 R4 resource types)
- `GET /metadata` (CapabilityStatement)

### Auto-registered Hooks:
- FHIR validation (before create/update/patch)
- Error handling (FHIR OperationOutcome responses)
- Capability statement generation

**Result**: Production-ready FHIR R4 server in ~15 lines of code with full CRUD operations, validation, and FHIR compliance.