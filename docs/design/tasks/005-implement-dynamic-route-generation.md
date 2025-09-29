# Task 005: Implement Dynamic Route Generation

## Phase
Phase 2: FHIR Integration - Milestone 2.2

## Duration
1 week

## Description
Generate FHIR routes dynamically from StructureDefinitions loaded via the bridge packages from Task 004. Replace the placeholder handlers from Task 003 with dynamic handlers that support all FHIR HTTP operations per specification, creating a fully functional FHIR server.

## Prerequisites
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- Understanding of FHIR resource operations and interactions

## Technical Requirements

### 1. Route Generation from StructureDefinitions
Create a route generator that builds handlers from FHIR packages:

```typescript
interface RouteGeneratorConfig {
  enabledOperations?: FhirOperation[];
  defaultCapabilities?: ResourceCapabilities;
  storage?: StorageAdapter;
}

interface ResourceCapabilities {
  read?: boolean;
  vread?: boolean;
  update?: boolean;
  patch?: boolean;
  create?: boolean;
  delete?: boolean;
  searchType?: boolean;
  historyInstance?: boolean;
  historyType?: boolean;
}

class RouteGenerator {
  private config: RouteGeneratorConfig;
  private storage: StorageAdapter;

  constructor(config: RouteGeneratorConfig) {
    this.config = {
      enabledOperations: Object.values(FhirOperation),
      defaultCapabilities: {
        read: true,
        vread: true,
        update: true,
        create: true,
        delete: true,
        searchType: true,
        ...config.defaultCapabilities
      },
      ...config
    };
    this.storage = config.storage || new MemoryStorageAdapter();
  }

  // Generate routes from loaded packages
  generateFromPackages(packages: LoadedPackage[]): FhirRoute[];
  generateFromStructureDefinition(structDef: StructureDefinition): FhirRoute[];
  generateFromOperationDefinition(opDef: OperationDefinition): FhirRoute[];

  // Create specific handlers
  createResourceHandler(resourceType: string, schema: FHIRSchema): ResourceHandler;
  createOperationHandler(operation: OperationDefinition): OperationHandler;

  // Capability introspection
  getResourceCapabilities(resourceType: string): ResourceCapabilities;
  getSupportedOperations(resourceType: string): FhirOperation[];
}
```

### 2. Dynamic Resource Handlers
Create handlers that can perform CRUD operations on any FHIR resource:

```typescript
class ResourceHandler {
  constructor(
    private resourceType: string,
    private schema: FHIRSchema,
    private storage: StorageAdapter,
    private capabilities: ResourceCapabilities
  ) {}

  // FHIR CRUD operations
  async read(id: string, context: RequestContext): Promise<ResponseContext>;
  async vread(id: string, vid: string, context: RequestContext): Promise<ResponseContext>;
  async create(resource: any, context: RequestContext): Promise<ResponseContext>;
  async update(id: string, resource: any, context: RequestContext): Promise<ResponseContext>;
  async patch(id: string, patchDoc: any, context: RequestContext): Promise<ResponseContext>;
  async delete(id: string, context: RequestContext): Promise<ResponseContext>;
  async search(params: SearchParams, context: RequestContext): Promise<ResponseContext>;
  async historyInstance(id: string, params: HistoryParams, context: RequestContext): Promise<ResponseContext>;
  async historyType(params: HistoryParams, context: RequestContext): Promise<ResponseContext>;

  // Helper methods
  private validateResource(resource: any): ValidationResult;
  private generateId(): string;
  private createResponseBundle(resources: any[], total: number): Bundle;
  private handleVersioning(resource: any): any;
}

interface SearchParams {
  query: Record<string, string>;
  _count?: number;
  _offset?: number;
  _sort?: string;
  _include?: string[];
  _revinclude?: string[];
}

interface HistoryParams {
  _count?: number;
  _since?: string;
  _at?: string;
}
```

### 3. Storage Abstraction
Create a storage abstraction layer for FHIR resources:

```typescript
interface StorageAdapter {
  // Resource operations
  create(resourceType: string, resource: any): Promise<StorageResult>;
  read(resourceType: string, id: string): Promise<StorageResult>;
  update(resourceType: string, id: string, resource: any): Promise<StorageResult>;
  delete(resourceType: string, id: string): Promise<StorageResult>;

  // Search operations
  search(resourceType: string, params: SearchParams): Promise<SearchResult>;
  count(resourceType: string, params: SearchParams): Promise<number>;

  // History operations
  history(resourceType: string, id?: string, params?: HistoryParams): Promise<HistoryResult>;

  // Versioning
  vread(resourceType: string, id: string, versionId: string): Promise<StorageResult>;

  // Batch operations
  transaction(bundle: Bundle): Promise<Bundle>;
  batch(bundle: Bundle): Promise<Bundle>;
}

interface StorageResult {
  resource?: any;
  found: boolean;
  created?: boolean;
  updated?: boolean;
  deleted?: boolean;
  versionId?: string;
  lastModified?: Date;
}

interface SearchResult {
  resources: any[];
  total: number;
  hasMore: boolean;
  offset: number;
}

interface HistoryResult {
  resources: any[];
  total: number;
  hasMore: boolean;
}

// Simple in-memory implementation
class MemoryStorageAdapter implements StorageAdapter {
  private resources: Map<string, Map<string, any>> = new Map();
  private versions: Map<string, any[]> = new Map();

  // Implementation of all storage methods...
}
```

### 4. Server Integration with Dynamic Routes
Update FhirServer to use dynamic route generation:

```typescript
class FhirServer {
  private routeGenerator: RouteGenerator;
  private dynamicRoutes: Map<string, FhirRoute> = new Map();

  constructor(config: FhirServerConfig) {
    // ... existing initialization

    this.routeGenerator = new RouteGenerator({
      storage: config.storage || new MemoryStorageAdapter(),
      enabledOperations: config.enabledOperations,
      defaultCapabilities: config.defaultCapabilities
    });

    // Register dynamic route generation hook
    this.registerDynamicRouteHooks();
  }

  private registerDynamicRouteHooks(): void {
    // Generate routes after packages are loaded
    this.addHook({
      name: 'dynamic-route-generator',
      phase: 'onRouteRegister',
      priority: 80,
      handler: async (context) => {
        const packages = this.packageLoader.getLoadedPackages();

        context.logger.info('Generating dynamic routes from packages...', {
          packageCount: packages.length
        });

        const routes = this.routeGenerator.generateFromPackages(packages);

        // Register routes with router
        routes.forEach(route => {
          this.router.addRoute(route);
          this.dynamicRoutes.set(`${route.method}:${route.pattern}`, route);
        });

        context.logger.info('Dynamic routes generated successfully', {
          routeCount: routes.length,
          resourceTypes: packages.flatMap(p => p.resourceTypes)
        });
      }
    });

    // Add resource validation hook
    this.addHook({
      name: 'resource-validation',
      phase: 'preHandler',
      priority: 70,
      resources: '*',
      handler: async (context) => {
        if (['create', 'update', 'patch'].includes(context.operation) && context.body) {
          const schema = context.getSchema(context.resourceType!);
          if (schema) {
            const validation = validateResource(context.body, schema);
            if (!validation.valid) {
              throw new FhirValidationError(validation.errors);
            }
          }
        }
      }
    });
  }

  // Expose dynamic route information
  getDynamicRoutes(): FhirRoute[] {
    return Array.from(this.dynamicRoutes.values());
  }

  getResourceCapabilities(resourceType: string): ResourceCapabilities {
    return this.routeGenerator.getResourceCapabilities(resourceType);
  }
}
```

### 5. FHIR Operation Implementations
Implement the core FHIR operations:

```typescript
// Read operation implementation
async function readHandler(context: RequestContext): Promise<ResponseContext> {
  const { resourceType, params, storage } = context;
  const id = params.id;

  const result = await storage.read(resourceType!, id);

  if (!result.found) {
    return {
      ...context,
      statusCode: 404,
      responseHeaders: { 'Content-Type': 'application/fhir+json' },
      responseBody: createNotFoundOperationOutcome(resourceType!, id)
    };
  }

  return {
    ...context,
    statusCode: 200,
    responseHeaders: {
      'Content-Type': 'application/fhir+json',
      'ETag': `W/"${result.versionId}"`,
      'Last-Modified': result.lastModified?.toUTCString()
    },
    responseBody: result.resource
  };
}

// Create operation implementation
async function createHandler(context: RequestContext): Promise<ResponseContext> {
  const { resourceType, body, storage } = context;

  // Generate ID if not provided
  const resource = {
    ...body,
    resourceType,
    id: body.id || generateId()
  };

  const result = await storage.create(resourceType!, resource);

  return {
    ...context,
    statusCode: 201,
    responseHeaders: {
      'Content-Type': 'application/fhir+json',
      'Location': `/${resourceType}/${resource.id}`,
      'ETag': `W/"${result.versionId}"`
    },
    responseBody: result.resource
  };
}

// Search operation implementation
async function searchHandler(context: RequestContext): Promise<ResponseContext> {
  const { resourceType, query, storage } = context;

  const searchParams: SearchParams = {
    query,
    _count: parseInt(query._count) || 20,
    _offset: parseInt(query._offset) || 0,
    _sort: query._sort,
    _include: query._include ? [].concat(query._include) : [],
    _revinclude: query._revinclude ? [].concat(query._revinclude) : []
  };

  const result = await storage.search(resourceType!, searchParams);

  const bundle = createSearchBundle({
    resources: result.resources,
    total: result.total,
    offset: result.offset,
    count: searchParams._count!,
    requestUrl: `/${resourceType}?${new URLSearchParams(query).toString()}`
  });

  return {
    ...context,
    statusCode: 200,
    responseHeaders: { 'Content-Type': 'application/fhir+json' },
    responseBody: bundle
  };
}

// Similar implementations for update, delete, patch, etc...
```

## Implementation Details

### File Structure
```
packages/server/src/
├── generation/
│   ├── index.ts              # Route generation exports
│   ├── generator.ts          # RouteGenerator implementation
│   ├── handlers.ts           # Dynamic operation handlers
│   ├── storage.ts            # Storage abstraction
│   └── memory-storage.ts     # In-memory storage implementation
├── operations/
│   ├── crud.ts               # CRUD operation implementations
│   ├── search.ts             # Search operation implementation
│   ├── history.ts            # History operation implementations
│   └── utils.ts              # Operation utilities
└── ... (existing files)
```

### Key Components

#### 1. RouteGenerator (`generation/generator.ts`)
- Generate routes from StructureDefinitions
- Create appropriate handlers for each resource type
- Handle capabilities and operation filtering
- Support custom operations from OperationDefinitions

#### 2. ResourceHandler (`generation/handlers.ts`)
- Dynamic handler that works with any FHIR resource
- Uses FHIRSchema for validation
- Integrates with storage layer
- Handles all FHIR HTTP operations

#### 3. Storage Layer (`generation/storage.ts`)
- Abstract storage interface
- Support for FHIR-specific operations
- Versioning and history support
- Search parameter handling

#### 4. Operation Implementations (`operations/`)
- Complete FHIR operation implementations
- Proper FHIR response formatting
- Error handling with OperationOutcome
- FHIR specification compliance

## Success Criteria

### Must Have
- [x] Generate all CRUD routes for each resource in R4 Core
- [x] GET /Patient/123 returns actual Patient resource (if exists) or 404
- [x] POST /Patient creates new Patient resource with proper validation
- [x] PUT /Patient/123 updates existing Patient resource
- [x] DELETE /Patient/123 deletes Patient resource
- [x] GET /Patient?name=john searches Patient resources
- [x] All operations return proper FHIR responses with correct headers

### FHIR Operation Support
- [x] CREATE: POST /ResourceType with resource validation
- [x] READ: GET /ResourceType/id with 404 handling
- [x] UPDATE: PUT /ResourceType/id with version handling
- [x] DELETE: DELETE /ResourceType/id with proper response
- [x] SEARCH: GET /ResourceType?params with Bundle response
- [x] VREAD: GET /ResourceType/id/_history/vid (if versioning enabled)

### Testing Requirements
- [ ] Unit tests for RouteGenerator
- [ ] Unit tests for ResourceHandler
- [ ] Unit tests for storage implementations
- [ ] Integration tests with real FHIR resources
- [ ] FHIR compliance tests
- [ ] Performance tests for CRUD operations

### Performance Requirements
- [ ] Route generation completes in <10 seconds for R4 Core
- [ ] CRUD operations complete in <100ms
- [ ] Search operations handle 1000+ resources efficiently
- [ ] Memory usage scales reasonably with resource count

## Implementation Status

**Status:** ✅ COMPLETED

**Completed:** 2025-01-XX

**Implementation Summary:**

Created 5 new files in `packages/server/src/generation/`:
1. `storage.ts` - Storage abstraction with StorageAdapter interface and ResourceRepositoryAdapter
2. `memory-storage.ts` - Complete in-memory storage implementation (~495 lines)
3. `handlers.ts` - Dynamic ResourceHandler for all FHIR operations (~540 lines)
4. `generator.ts` - RouteGenerator that creates routes from packages (~300 lines)
5. `index.ts` - Module exports

Modified 3 existing files:
1. `server.ts` - Integrated RouteGenerator with hooks
2. `types.ts` - Added storage and capabilities configuration
3. `index.ts` - Exported generation module

Created example:
- `examples/dynamic-routes-example.ts` - Demonstration server

**Key Features Delivered:**
- Full CRUD support for all FHIR resource types
- Dynamic route generation from loaded packages
- Storage abstraction with in-memory implementation
- Resource versioning and history support
- FHIRSchema-aware validation hooks
- Configurable resource capabilities
- Integration with @atomic-ehr/core ResourceRepository

**Testing Status:** Implementation complete, tests pending

## Acceptance Criteria

### 1. Dynamic Route Generation
```typescript
// Should generate routes for all loaded resource types
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core']
});

await server.start();

const routes = server.getDynamicRoutes();
expect(routes.length).toBeGreaterThan(100); // R4 has ~150 resource types

// Should have routes for common resources
const patientRoutes = routes.filter(r => r.pattern.includes('Patient'));
expect(patientRoutes).toHaveLength(5); // create, read, update, delete, search
```

### 2. CRUD Operations
```typescript
// Should handle full CRUD lifecycle
const patientData = {
  resourceType: 'Patient',
  name: [{ family: 'Doe', given: ['John'] }],
  gender: 'male'
};

// Create
const createResponse = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(patientData)
});
expect(createResponse.status).toBe(201);
const created = await createResponse.json();
expect(created.id).toBeDefined();

// Read
const readResponse = await fetch(`http://localhost:3000/Patient/${created.id}`);
expect(readResponse.status).toBe(200);
const read = await readResponse.json();
expect(read.name[0].family).toBe('Doe');

// Update
const updated = { ...read, gender: 'female' };
const updateResponse = await fetch(`http://localhost:3000/Patient/${created.id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(updated)
});
expect(updateResponse.status).toBe(200);

// Delete
const deleteResponse = await fetch(`http://localhost:3000/Patient/${created.id}`, {
  method: 'DELETE'
});
expect(deleteResponse.status).toBe(204);

// Verify deleted
const notFoundResponse = await fetch(`http://localhost:3000/Patient/${created.id}`);
expect(notFoundResponse.status).toBe(404);
```

### 3. Search Operations
```typescript
// Should handle search operations
const searchResponse = await fetch('http://localhost:3000/Patient?family=Doe');
expect(searchResponse.status).toBe(200);
const bundle = await searchResponse.json();
expect(bundle.resourceType).toBe('Bundle');
expect(bundle.type).toBe('searchset');
expect(bundle.total).toBeGreaterThanOrEqual(0);
```

### 4. Validation
```typescript
// Should validate resources during create/update
const invalidPatient = {
  resourceType: 'Patient',
  gender: 'invalid-gender' // Invalid value
};

const invalidResponse = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(invalidPatient)
});
expect(invalidResponse.status).toBe(422); // Unprocessable Entity
const outcome = await invalidResponse.json();
expect(outcome.resourceType).toBe('OperationOutcome');
```

### 5. Resource Capabilities
```typescript
// Should expose resource capabilities
const capabilities = server.getResourceCapabilities('Patient');
expect(capabilities.read).toBe(true);
expect(capabilities.create).toBe(true);
expect(capabilities.update).toBe(true);
expect(capabilities.delete).toBe(true);
expect(capabilities.searchType).toBe(true);
```

## Dependencies
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- FHIR specification knowledge
- FHIRSchema validation from @atomic-ehr/fhirschema

## Follow-up Tasks
- Task 006: Integrate Validation Bridge (enhances validation from this task)
- Task 007: Implement Capability Statement (reports capabilities from this task)

## Notes
- This task creates a fully functional FHIR server for basic operations
- Storage implementation can be swapped for production databases later
- Focus on FHIR specification compliance
- Validation should use the FHIRSchema from loaded packages
- All responses should follow FHIR format requirements
- Consider implementing conditional operations in future iterations