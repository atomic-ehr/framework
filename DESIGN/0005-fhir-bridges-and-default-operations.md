# ADR-0005: FHIR Bridges and Default Operations

## Status
Proposed

## Context
The `@atomic-ehr/canonical-bridge` must provide seamless integration between the canonical manager and the hook-core routing system. This includes generating typed route specifications from FHIR packages, providing default FHIR resource operations that comply with the specification, and shipping first-class hook bundles for validation, constraints, auth, and observability.

## Decision

### Canonical Bridge Architecture
```typescript
// @atomic-ehr/canonical-bridge
interface CanonicalBridge {
  // Package discovery and activation
  packageManager: CanonicalPackageManager;
  routeGenerator: FhirRouteGenerator;
  hookBundleProvider: HookBundleProvider;

  // Main bridge methods
  discoverPackages(config: PackageDiscoveryConfig): Promise<DiscoveredPackages>;
  generateRoutes(packages: CanonicalPackage[]): Promise<RouteSpecification[]>;
  getHookBundles(packages: CanonicalPackage[]): Promise<HookBundle[]>;

  // Context augmentation
  augmentAppContext(context: AppContext, packages: CanonicalPackage[]): AugmentedAppContext;
  augmentRequestContext(context: RequestContext, route: FhirRoute): AugmentedRequestContext;
}

interface CanonicalPackageManager {
  // Package lifecycle
  loadPackage(packageRef: PackageReference): Promise<CanonicalPackage>;
  unloadPackage(packageId: string): Promise<void>;
  reloadPackage(packageId: string): Promise<CanonicalPackage>;

  // Package queries
  getLoadedPackages(): CanonicalPackage[];
  getPackageById(id: string): CanonicalPackage | undefined;
  findPackagesByResource(resourceType: string): CanonicalPackage[];
  findPackagesByProfile(profileUrl: string): CanonicalPackage[];

  // Dependency resolution
  resolveDependencies(packages: PackageReference[]): Promise<ResolvedDependencies>;
  validateCompatibility(packages: CanonicalPackage[]): CompatibilityReport;
}

interface CanonicalPackage {
  // Package metadata
  id: string;
  version: string;
  canonical: string;
  title: string;
  description: string;
  fhirVersion: string;
  dependencies: PackageDependency[];

  // FHIR artifacts
  structureDefinitions: Map<string, StructureDefinition>;
  operationDefinitions: Map<string, OperationDefinition>;
  searchParameters: Map<string, SearchParameter>;
  capabilityStatements: Map<string, CapabilityStatement>;
  valuesets: Map<string, ValueSet>;
  codeSystems: Map<string, CodeSystem>;

  // Package-specific hooks
  hookBundles: HookBundle[];

  // Discovery metadata
  loadedAt: Date;
  source: PackageSource;
}
```

### Route Specification Generation
```typescript
interface FhirRouteGenerator {
  // Main generation methods
  generateResourceRoutes(
    structureDef: StructureDefinition,
    capabilities?: ResourceCapabilities
  ): RouteSpecification[];

  generateOperationRoutes(
    operationDef: OperationDefinition
  ): RouteSpecification[];

  generateBatchRoutes(
    packages: CanonicalPackage[]
  ): RouteSpecification[];

  // Specialized generators
  generateCrudRoutes(resourceType: string, capabilities: CrudCapabilities): RouteSpecification[];
  generateSearchRoutes(resourceType: string, searchParams: SearchParameter[]): RouteSpecification[];
  generateHistoryRoutes(resourceType: string, capabilities: HistoryCapabilities): RouteSpecification[];
}

interface RouteSpecification {
  // Route identity
  id: string;
  type: 'resource' | 'operation' | 'system';
  method: HttpMethod;
  path: string;

  // FHIR specifics
  resourceType?: string;
  operation?: FhirOperationType;
  profiles: string[];
  fhirVersion: string;

  // Generated components
  handler: DefaultFhirHandler;
  hooks: HookReference[];
  schema: FhirRouteSchema;
  documentation: RouteDocumentation;

  // Source metadata
  source: {
    package: string;
    artifact: string; // StructureDefinition URL, etc.
    generator: string;
  };
}

type FhirOperationType =
  | 'read' | 'vread' | 'update' | 'patch' | 'delete'
  | 'create' | 'search-type' | 'search-system'
  | 'history-instance' | 'history-type' | 'history-system'
  | 'batch' | 'transaction'
  | 'operation-instance' | 'operation-type' | 'operation-system'
  | 'capability' | 'metadata';

interface FhirRouteSchema {
  // Request schema
  parameters: ParameterSchema[];
  queryParameters: QueryParameterSchema[];
  headers: HeaderSchema[];
  body?: BodySchema;

  // Response schema
  responses: ResponseSchema[];

  // FHIR-specific validation
  resourceValidation: ResourceValidationSchema;
  profileValidation: ProfileValidationSchema[];
}
```

### Default FHIR Operations
```typescript
// Minimal baseline operations for R4/R5 compliance
interface DefaultFhirOperations {
  // Instance-level operations
  read: DefaultReadOperation;
  vread: DefaultVreadOperation;
  update: DefaultUpdateOperation;
  patch: DefaultPatchOperation;
  delete: DefaultDeleteOperation;
  historyInstance: DefaultHistoryInstanceOperation;

  // Type-level operations
  create: DefaultCreateOperation;
  searchType: DefaultSearchTypeOperation;
  historyType: DefaultHistoryTypeOperation;

  // System-level operations
  searchSystem: DefaultSearchSystemOperation;
  historySystem: DefaultHistorySystemOperation;
  batch: DefaultBatchOperation;
  transaction: DefaultTransactionOperation;
  capability: DefaultCapabilityOperation;

  // Standard operations
  validate: DefaultValidateOperation;
  everything: DefaultEverythingOperation;
}

// Example: Default READ operation
interface DefaultReadOperation {
  // Operation metadata
  name: 'read';
  fhirType: 'instance';
  httpMethod: 'GET';
  pathPattern: '/{resourceType}/{id}';

  // Required hooks
  requiredHooks: HookRequirement[];

  // Handler implementation
  handler: ReadOperationHandler;

  // Specification compliance
  specification: {
    fhirVersion: string[];
    httpStatus: number[];
    conditionalSupport: boolean;
    transactionSupport: boolean;
  };
}

type ReadOperationHandler = (
  context: FhirRequestContext<ReadRequestParams>
) => Promise<FhirResponse<Resource>>;

interface ReadRequestParams {
  resourceType: string;
  id: string;
  _format?: string;
  _summary?: SummaryType;
  _elements?: string[];
}

interface FhirRequestContext<TParams = unknown> extends RequestContext {
  // FHIR-specific context
  fhir: {
    resourceType: string;
    operation: FhirOperationType;
    profiles: string[];
    version: string;
    acceptHeader: string;
    contentType: string;
  };

  // Typed parameters
  params: TParams;

  // FHIR services (injected by canonical bridge)
  services: {
    storage: FhirStorageService;
    validator: FhirValidationService;
    search: FhirSearchService;
    terminology: TerminologyService;
    packages: CanonicalPackageManager;
  };
}

interface FhirResponse<T = unknown> {
  // FHIR response
  resource?: T;
  bundle?: Bundle;
  operationOutcome?: OperationOutcome;

  // HTTP response
  status: number;
  headers: Record<string, string>;

  // Metadata
  timestamp: string;
  version?: string;
  location?: string;
  etag?: string;
}
```

### Default Operation Implementations
```typescript
// READ operation implementation
class DefaultReadHandler implements ReadOperationHandler {
  async handle(context: FhirRequestContext<ReadRequestParams>): Promise<FhirResponse<Resource>> {
    const { resourceType, id } = context.params;
    const { storage, validator } = context.services;

    try {
      // 1. Validate request parameters
      await this.validateReadRequest(context);

      // 2. Retrieve resource from storage
      const resource = await storage.read(resourceType, id);

      if (!resource) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/fhir+json' },
          operationOutcome: this.createNotFoundOutcome(resourceType, id)
        };
      }

      // 3. Apply _summary and _elements parameters
      const filteredResource = this.applyOutputFilters(resource, context.params);

      // 4. Set response headers
      const headers = this.buildResponseHeaders(resource, context);

      return {
        status: 200,
        headers,
        resource: filteredResource,
        version: resource.meta?.versionId,
        etag: `W/"${resource.meta?.versionId}"`
      };

    } catch (error) {
      return this.handleError(error, context);
    }
  }

  private async validateReadRequest(context: FhirRequestContext<ReadRequestParams>): Promise<void> {
    // Parameter validation logic
  }

  private applyOutputFilters(resource: Resource, params: ReadRequestParams): Resource {
    // _summary and _elements filtering logic
  }

  private buildResponseHeaders(resource: Resource, context: FhirRequestContext): Record<string, string> {
    return {
      'Content-Type': context.fhir.acceptHeader,
      'Last-Modified': resource.meta?.lastUpdated || new Date().toISOString(),
      'ETag': `W/"${resource.meta?.versionId}"`,
      'X-FHIR-Version': context.fhir.version
    };
  }

  private createNotFoundOutcome(resourceType: string, id: string): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        details: {
          text: `${resourceType}/${id} not found`
        }
      }]
    };
  }

  private handleError(error: Error, context: FhirRequestContext): FhirResponse {
    // Error handling logic
  }
}

// CREATE operation implementation
class DefaultCreateHandler implements CreateOperationHandler {
  async handle(context: FhirRequestContext<CreateRequestParams>): Promise<FhirResponse<Resource>> {
    const { resourceType } = context.params;
    const { storage, validator } = context.services;
    const resource = context.body as Resource;

    try {
      // 1. Validate resource structure
      await validator.validateResource(resource, context.fhir.profiles);

      // 2. Generate ID if not provided
      if (!resource.id) {
        resource.id = await this.generateResourceId();
      }

      // 3. Set metadata
      resource.meta = {
        ...resource.meta,
        versionId: '1',
        lastUpdated: new Date().toISOString()
      };

      // 4. Check conditional create
      if (context.headers['if-none-exist']) {
        const existing = await this.checkConditionalCreate(
          resourceType,
          context.headers['if-none-exist'],
          storage
        );
        if (existing) {
          return {
            status: 200,
            headers: { 'Content-Type': 'application/fhir+json' },
            resource: existing
          };
        }
      }

      // 5. Store resource
      const created = await storage.create(resource);

      // 6. Build response
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${resourceType}/${created.id}`,
          'ETag': `W/"${created.meta?.versionId}"`,
          'Last-Modified': created.meta?.lastUpdated || new Date().toISOString()
        },
        resource: created
      };

    } catch (error) {
      return this.handleError(error, context);
    }
  }

  private async generateResourceId(): Promise<string> {
    // ID generation logic (UUID, sequential, etc.)
  }

  private async checkConditionalCreate(
    resourceType: string,
    condition: string,
    storage: FhirStorageService
  ): Promise<Resource | null> {
    // Conditional create logic
  }
}
```

### Hook Bundles
```typescript
interface HookBundleProvider {
  // Get all available hook bundles
  getAvailableBundles(): HookBundle[];

  // Get bundles for specific packages
  getBundlesForPackages(packages: CanonicalPackage[]): HookBundle[];

  // Get bundles by category
  getBundlesByCategory(category: HookBundleCategory): HookBundle[];

  // Create bundle from package
  createBundleFromPackage(pkg: CanonicalPackage): HookBundle[];
}

interface HookBundle {
  // Bundle metadata
  id: string;
  name: string;
  version: string;
  description: string;
  category: HookBundleCategory;

  // Hook definitions
  hooks: HookDefinition[];

  // Dependencies
  dependencies: string[];
  provides: string[];

  // Target scope
  scope: HookBundleScope;

  // Installation metadata
  source: {
    package?: string;
    plugin?: string;
    builtin?: boolean;
  };
}

type HookBundleCategory =
  | 'validation'      // FHIR schema and profile validation
  | 'constraints'     // FHIRPath invariants and business rules
  | 'search'          // Search parameter processing
  | 'auth'            // Authentication and authorization
  | 'observability'   // Logging, metrics, tracing
  | 'transformation'  // Resource transformation and mapping
  | 'terminology'     // ValueSet and CodeSystem validation
  | 'workflow';       // Business process and workflow

interface HookBundleScope {
  resources: string[] | '*'; // Resource types
  profiles: string[];        // Specific profiles
  operations: FhirOperationType[] | '*'; // FHIR operations
  phases: HookPhase[];       // Hook phases
}
```

### Built-in Hook Bundles
```typescript
// @atomic-ehr/fhir-validation - FHIR schema validation
const fhirValidationBundle: HookBundle = {
  id: '@atomic-ehr/fhir-validation',
  name: 'FHIR Validation',
  version: '1.0.0',
  description: 'FHIR resource validation using fhirschema',
  category: 'validation',
  scope: {
    resources: '*',
    profiles: [],
    operations: ['create', 'update', 'patch'],
    phases: ['preValidation', 'preResponse']
  },
  hooks: [
    {
      name: 'fhir-request-validation',
      phase: 'preValidation',
      priority: 900,
      resources: '*',
      async handler(context: FhirRequestContext) {
        const { validator, packages } = context.services;
        const resource = context.body as Resource;

        if (resource) {
          const profiles = context.fhir.profiles;
          const result = await validator.validateResource(resource, profiles);

          if (!result.valid) {
            throw new FhirValidationError('Invalid FHIR resource', result.errors);
          }

          // Augment context with validation result
          context.validation = result;
        }
      }
    },
    {
      name: 'fhir-response-validation',
      phase: 'preResponse',
      priority: 100,
      resources: '*',
      async handler(context: ResponseContext) {
        // Validate outgoing FHIR resources
      }
    }
  ],
  dependencies: [],
  provides: ['fhir-validation'],
  source: { builtin: true }
};

// @atomic-ehr/fhir-constraints - FHIRPath invariants
const fhirConstraintsBundle: HookBundle = {
  id: '@atomic-ehr/fhir-constraints',
  name: 'FHIR Constraints',
  version: '1.0.0',
  description: 'FHIRPath invariant evaluation and search coercion',
  category: 'constraints',
  scope: {
    resources: '*',
    profiles: [],
    operations: ['create', 'update', 'patch', 'search-type'],
    phases: ['preHandler', 'preResponse']
  },
  hooks: [
    {
      name: 'fhir-invariant-evaluation',
      phase: 'preHandler',
      priority: 800,
      resources: '*',
      async handler(context: FhirRequestContext) {
        const { packages } = context.services;
        const resource = context.body as Resource;

        if (resource && context.fhir.profiles.length > 0) {
          for (const profileUrl of context.fhir.profiles) {
            const profile = this.findProfile(profileUrl, packages);
            if (profile?.constraint) {
              await this.evaluateConstraints(resource, profile.constraint, context);
            }
          }
        }
      }
    },
    {
      name: 'search-parameter-coercion',
      phase: 'preHandler',
      priority: 750,
      resources: '*',
      async handler(context: FhirRequestContext) {
        if (context.fhir.operation === 'search-type') {
          // Coerce and validate search parameters
          await this.coerceSearchParameters(context);
        }
      }
    }
  ],
  dependencies: ['@atomic-ehr/fhir-validation'],
  provides: ['fhir-constraints', 'search-coercion'],
  source: { builtin: true }
};
```

### Context Augmentation
```typescript
// Canonical bridge augments app and request contexts
declare module '@atomic-ehr/core' {
  namespace Plugins {
    interface AppContext {
      canonical: {
        packages: CanonicalPackageManager;
        bridge: CanonicalBridge;

        // Package-derived services
        terminology: TerminologyService;
        search: FhirSearchService;

        // Cached lookups
        profileCache: Map<string, StructureDefinition>;
        valuesetCache: Map<string, ValueSet>;
      };
    }

    interface RequestContext {
      fhir?: {
        // Request classification
        resourceType: string;
        operation: FhirOperationType;
        profiles: string[];
        version: string;

        // Content negotiation
        acceptHeader: string;
        contentType: string;

        // Request metadata
        requestId: string;
        correlationId?: string;

        // Validation state
        validation?: ValidationResult;
        constraints?: ConstraintEvaluation[];

        // Search context (for search operations)
        search?: SearchContext;
      };
    }
  }
}

interface SearchContext {
  parameters: SearchParameter[];
  normalizedQuery: NormalizedSearchQuery;
  includes: IncludeSpec[];
  revIncludes: RevIncludeSpec[];
  sort: SortSpec[];
  summary: SummaryType;
  count: number;
  offset: number;
}
```

### Implementation Guide for Custom Operations
```markdown
# Guide: Implementing Correct Custom FHIR Operations

## Overview
This guide covers best practices for implementing custom FHIR operations that integrate properly with the hook system and maintain FHIR compliance.

## Required Invariants

### 1. Resource Identity
- **ID Generation**: Use consistent ID generation strategy (UUID v4 recommended)
- **ID Validation**: Validate ID format according to FHIR specification
- **ID Uniqueness**: Ensure IDs are unique within resource type scope

### 2. Metadata Management
- **Version Control**: Always increment versionId on updates
- **Timestamps**: Set lastUpdated on all create/update operations
- **Source**: Include source information in meta.source when applicable

### 3. HTTP Compliance
- **Status Codes**: Use correct HTTP status codes per FHIR specification
- **Headers**: Include required headers (Content-Type, ETag, Location)
- **Conditional Operations**: Implement If-Match, If-None-Match, If-Modified-Since

### 4. Error Handling
- **OperationOutcome**: Return OperationOutcome for all error conditions
- **Error Codes**: Use standardized FHIR issue codes
- **Error Details**: Provide actionable error messages

## Hook Integration Points

### Required Hooks
```typescript
// All custom operations MUST support these hooks
const requiredHooks = [
  'preValidation',  // FHIR validation
  'preHandler',     // Constraints and business rules
  'preResponse',    // Response validation
  'onError'         // Error handling
];
```

### Hook Compliance
1. **preValidation**: Must validate request against FHIR schema and profiles
2. **preHandler**: Must evaluate FHIRPath constraints and business rules
3. **preResponse**: Must validate response format and content
4. **onError**: Must format errors as OperationOutcome

## Testing Checklist

### Functional Tests
- [ ] Create with valid resource succeeds
- [ ] Create with invalid resource fails with 400
- [ ] Read existing resource returns 200
- [ ] Read non-existent resource returns 404
- [ ] Update with valid resource succeeds
- [ ] Update with version mismatch fails with 409
- [ ] Delete existing resource returns 204
- [ ] Delete non-existent resource returns 404

### Conditional Operation Tests
- [ ] Conditional create with If-None-Exist works correctly
- [ ] Conditional update with If-Match works correctly
- [ ] Conditional delete with If-Match works correctly

### Error Handling Tests
- [ ] Validation errors return OperationOutcome
- [ ] System errors return OperationOutcome
- [ ] Error responses have correct HTTP status codes
- [ ] Error responses include correlation IDs

### Performance Tests
- [ ] Operations complete within acceptable time limits
- [ ] Memory usage remains within bounds
- [ ] Concurrent operations don't interfere

## Common Pitfalls

### 1. Missing Metadata
```typescript
// ❌ WRONG - missing metadata
const resource = { resourceType: 'Patient', name: [...] };

// ✅ CORRECT - includes metadata
const resource = {
  resourceType: 'Patient',
  id: generateId(),
  meta: {
    versionId: '1',
    lastUpdated: new Date().toISOString(),
    source: 'my-app'
  },
  name: [...]
};
```

### 2. Incorrect Status Codes
```typescript
// ❌ WRONG - should be 201 for create
return { status: 200, resource };

// ✅ CORRECT - 201 for successful create
return { status: 201, resource, headers: { Location: `Patient/${resource.id}` } };
```

### 3. Missing Error Handling
```typescript
// ❌ WRONG - throws unhandled error
if (!resource.id) {
  throw new Error('Missing ID');
}

// ✅ CORRECT - returns FHIR OperationOutcome
if (!resource.id) {
  return {
    status: 400,
    operationOutcome: {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'required',
        details: { text: 'Resource ID is required' }
      }]
    }
  };
}
```
```

## Implementation Guidelines

### Package Integration Best Practices
1. **Lazy Loading**: Load packages only when needed to minimize startup time
2. **Caching**: Cache frequently accessed artifacts (profiles, valuesets)
3. **Validation**: Validate package integrity and FHIR compliance
4. **Error Recovery**: Handle package loading failures gracefully
5. **Hot Reload**: Support dynamic package loading without restart

### Hook Bundle Development
1. **Single Purpose**: Each bundle should have a clear, focused purpose
2. **Minimal Dependencies**: Reduce coupling between bundles
3. **Performance**: Optimize hook execution for common operations
4. **Error Handling**: Handle errors gracefully without breaking the pipeline
5. **Documentation**: Include comprehensive documentation and examples

### Default Operation Guidelines
1. **FHIR Compliance**: Strict adherence to FHIR specification
2. **Performance**: Optimize for common use cases
3. **Extensibility**: Support customization through hooks and overrides
4. **Error Handling**: Comprehensive error handling with OperationOutcome
5. **Testing**: Extensive test coverage for all operation variants

## Consequences

### Benefits
- **FHIR Compliance**: Automatic generation of compliant FHIR operations
- **Package Integration**: Seamless integration with canonical package ecosystem
- **Extensibility**: Easy customization through hooks and overrides
- **Type Safety**: Strong typing throughout the FHIR operation pipeline
- **Best Practices**: Built-in guidance for correct FHIR implementation
- **Performance**: Optimized implementations for common operations

### Trade-offs
- **Complexity**: Rich feature set adds complexity to the system
- **Learning Curve**: Developers need to understand FHIR concepts and patterns
- **Package Dependencies**: Reliance on external FHIR packages
- **Performance Overhead**: Hook execution and validation add latency
- **Memory Usage**: Package loading and caching increases memory usage

### Migration Strategy
- Provide wrapper utilities for existing FHIR implementations
- Gradual migration from custom operations to default operations
- Comprehensive documentation and examples for common patterns
- Tools to validate custom operations against FHIR specifications
- Support for hybrid approaches during transition