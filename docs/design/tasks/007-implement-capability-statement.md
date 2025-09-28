# Task 007: Implement Capability Statement

## Phase
Phase 3: Validation and Capabilities - Milestone 3.2

## Duration
1 week

## Description
Generate FHIR CapabilityStatement from loaded packages and implement the `/metadata` endpoint. The capability statement should accurately report supported resources, operations, search parameters, and profiles based on the dynamically loaded FHIR packages and server configuration.

## Prerequisites
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- Task 005: Implement Dynamic Route Generation (completed)
- Task 006: Integrate Validation Bridge (completed)
- Understanding of FHIR CapabilityStatement structure

## Technical Requirements

### 1. Capability Statement Generator
Create a generator that builds CapabilityStatement from loaded packages:

```typescript
interface CapabilityStatementGeneratorConfig {
  serverName?: string;
  serverVersion?: string;
  serverDescription?: string;
  publisher?: string;
  contact?: ContactDetail[];
  fhirVersion?: string;
  format?: string[];
  acceptLanguage?: string[];
  enabledOperations?: FhirOperation[];
  securityConfiguration?: SecurityConfig;
}

interface SecurityConfig {
  cors?: boolean;
  authentication?: AuthenticationMethod[];
  authorization?: AuthorizationMethod[];
  certificates?: CertificateInfo[];
}

class CapabilityStatementGenerator {
  private config: CapabilityStatementGeneratorConfig;
  private packages: LoadedPackage[] = [];
  private resourceCapabilities: Map<string, ResourceCapabilities> = new Map();

  constructor(config: CapabilityStatementGeneratorConfig = {}) {
    this.config = {
      serverName: '@atomic-ehr/server',
      serverVersion: '0.1.0',
      serverDescription: 'FHIR Server with Hook-based Architecture',
      fhirVersion: '4.0.1',
      format: ['application/fhir+json', 'application/fhir+xml'],
      acceptLanguage: ['en'],
      enabledOperations: Object.values(FhirOperation),
      ...config
    };
  }

  // Main generation method
  generate(): CapabilityStatement {
    return {
      resourceType: 'CapabilityStatement',
      id: 'server-capability',
      url: `${this.getBaseUrl()}/metadata`,
      version: this.config.serverVersion!,
      name: this.config.serverName!,
      title: `${this.config.serverName} Capability Statement`,
      status: 'active',
      experimental: false,
      date: new Date().toISOString(),
      publisher: this.config.publisher || 'Atomic EHR',
      contact: this.config.contact || [],
      description: this.config.serverDescription!,
      kind: 'instance',
      software: this.generateSoftwareComponent(),
      implementation: this.generateImplementationComponent(),
      fhirVersion: this.config.fhirVersion!,
      format: this.config.format!,
      acceptLanguage: this.config.acceptLanguage!,
      rest: [this.generateRestComponent()]
    };
  }

  // Update with loaded packages
  updateWithPackages(packages: LoadedPackage[]): void {
    this.packages = packages;
    this.analyzeResourceCapabilities();
  }

  updateWithResourceCapabilities(capabilities: Map<string, ResourceCapabilities>): void {
    this.resourceCapabilities = capabilities;
  }

  // Component generators
  private generateSoftwareComponent(): CapabilityStatementSoftware {
    return {
      name: this.config.serverName!,
      version: this.config.serverVersion!,
      releaseDate: new Date().toISOString()
    };
  }

  private generateImplementationComponent(): CapabilityStatementImplementation {
    return {
      description: this.config.serverDescription!,
      url: this.getBaseUrl()
    };
  }

  private generateRestComponent(): CapabilityStatementRest {
    return {
      mode: 'server',
      documentation: 'FHIR R4 server with full CRUD operations',
      security: this.generateSecurityComponent(),
      resource: this.generateResourceComponents(),
      operation: this.generateSystemOperations(),
      interaction: this.generateSystemInteractions()
    };
  }

  private generateSecurityComponent(): CapabilityStatementRestSecurity {
    const security: CapabilityStatementRestSecurity = {
      cors: this.config.securityConfiguration?.cors || true,
      description: 'Security configuration for the FHIR server'
    };

    if (this.config.securityConfiguration?.authentication?.length) {
      security.service = this.config.securityConfiguration.authentication.map(auth => ({
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
          code: auth.type,
          display: auth.display
        }]
      }));
    }

    return security;
  }

  private generateResourceComponents(): CapabilityStatementRestResource[] {
    const resources: CapabilityStatementRestResource[] = [];

    for (const pkg of this.packages) {
      for (const resourceType of pkg.resourceTypes) {
        const capabilities = this.resourceCapabilities.get(resourceType);
        if (capabilities) {
          resources.push(this.generateResourceComponent(resourceType, capabilities, pkg));
        }
      }
    }

    return resources.sort((a, b) => a.type.localeCompare(b.type));
  }

  private generateResourceComponent(
    resourceType: string,
    capabilities: ResourceCapabilities,
    pkg: LoadedPackage
  ): CapabilityStatementRestResource {
    const resource: CapabilityStatementRestResource = {
      type: resourceType,
      profile: `http://hl7.org/fhir/StructureDefinition/${resourceType}`,
      supportedProfile: this.getSupportedProfiles(resourceType),
      documentation: `${resourceType} resource with CRUD operations`,
      interaction: this.generateResourceInteractions(capabilities),
      versioning: 'versioned',
      readHistory: capabilities.historyInstance || false,
      updateCreate: capabilities.update || false,
      conditionalCreate: false, // TODO: implement in future
      conditionalRead: 'not-supported',
      conditionalUpdate: false, // TODO: implement in future
      conditionalDelete: 'not-supported',
      searchInclude: this.getSearchIncludes(resourceType),
      searchRevInclude: this.getSearchRevIncludes(resourceType),
      searchParam: this.generateSearchParameters(resourceType, pkg)
    };

    return resource;
  }

  private generateResourceInteractions(capabilities: ResourceCapabilities): ResourceInteraction[] {
    const interactions: ResourceInteraction[] = [];

    if (capabilities.read) {
      interactions.push({ code: 'read', documentation: 'Read resource by ID' });
    }
    if (capabilities.vread) {
      interactions.push({ code: 'vread', documentation: 'Read specific version of resource' });
    }
    if (capabilities.create) {
      interactions.push({ code: 'create', documentation: 'Create new resource' });
    }
    if (capabilities.update) {
      interactions.push({ code: 'update', documentation: 'Update existing resource' });
    }
    if (capabilities.patch) {
      interactions.push({ code: 'patch', documentation: 'Patch existing resource' });
    }
    if (capabilities.delete) {
      interactions.push({ code: 'delete', documentation: 'Delete resource' });
    }
    if (capabilities.searchType) {
      interactions.push({ code: 'search-type', documentation: 'Search resources of this type' });
    }
    if (capabilities.historyInstance) {
      interactions.push({ code: 'history-instance', documentation: 'Get resource history' });
    }
    if (capabilities.historyType) {
      interactions.push({ code: 'history-type', documentation: 'Get resource type history' });
    }

    return interactions;
  }

  private generateSearchParameters(resourceType: string, pkg: LoadedPackage): SearchParam[] {
    // Extract search parameters from package
    const searchParams: SearchParam[] = [];

    // Add common search parameters
    searchParams.push(
      {
        name: '_id',
        type: 'token',
        documentation: 'Logical resource identifier'
      },
      {
        name: '_lastUpdated',
        type: 'date',
        documentation: 'When the resource was last updated'
      },
      {
        name: '_profile',
        type: 'reference',
        documentation: 'Profiles this resource claims to conform to'
      }
    );

    // TODO: Extract resource-specific search parameters from StructureDefinition
    // This would require parsing the StructureDefinition to find searchable elements

    return searchParams;
  }

  private generateSystemOperations(): OperationDefinition[] {
    const operations: OperationDefinition[] = [];

    // Add standard system operations
    if (this.config.enabledOperations?.includes(FhirOperation.BATCH)) {
      operations.push({
        name: 'batch',
        definition: 'http://hl7.org/fhir/OperationDefinition/Bundle-batch'
      });
    }

    if (this.config.enabledOperations?.includes(FhirOperation.TRANSACTION)) {
      operations.push({
        name: 'transaction',
        definition: 'http://hl7.org/fhir/OperationDefinition/Bundle-transaction'
      });
    }

    return operations;
  }

  private generateSystemInteractions(): SystemInteraction[] {
    const interactions: SystemInteraction[] = [];

    if (this.config.enabledOperations?.includes(FhirOperation.SEARCH_SYSTEM)) {
      interactions.push({
        code: 'search-system',
        documentation: 'Search across all resource types'
      });
    }

    if (this.config.enabledOperations?.includes(FhirOperation.HISTORY_SYSTEM)) {
      interactions.push({
        code: 'history-system',
        documentation: 'Get system-wide history'
      });
    }

    if (this.config.enabledOperations?.includes(FhirOperation.BATCH)) {
      interactions.push({
        code: 'batch',
        documentation: 'Batch operation processing'
      });
    }

    if (this.config.enabledOperations?.includes(FhirOperation.TRANSACTION)) {
      interactions.push({
        code: 'transaction',
        documentation: 'Transaction operation processing'
      });
    }

    return interactions;
  }

  // Helper methods
  private getSupportedProfiles(resourceType: string): string[] {
    const profiles = [`http://hl7.org/fhir/StructureDefinition/${resourceType}`];

    // Add profiles from loaded packages
    for (const pkg of this.packages) {
      // TODO: Extract profiles from package that constrain this resource type
      // This would require analyzing StructureDefinitions in the package
    }

    return profiles;
  }

  private getSearchIncludes(resourceType: string): string[] {
    // TODO: Analyze resource structure to determine valid _include values
    return [];
  }

  private getSearchRevIncludes(resourceType: string): string[] {
    // TODO: Analyze resource structure to determine valid _revinclude values
    return [];
  }

  private getBaseUrl(): string {
    // TODO: Get from server configuration
    return 'http://localhost:3000';
  }

  private analyzeResourceCapabilities(): void {
    // Analyze loaded packages to determine what resources are available
    // This is populated by the route generator
  }
}
```

### 2. Capability Statement Integration
Integrate capability statement generation into the server:

```typescript
// Update FhirServer to include capability statement generation
class FhirServer {
  private capabilityGenerator: CapabilityStatementGenerator;

  constructor(config: FhirServerConfig) {
    // ... existing initialization

    this.capabilityGenerator = new CapabilityStatementGenerator({
      serverName: config.serverName || '@atomic-ehr/server',
      serverVersion: config.version || '0.1.0',
      serverDescription: config.description,
      fhirVersion: config.fhirVersion || '4.0.1',
      enabledOperations: config.enabledOperations,
      securityConfiguration: config.security
    });

    this.registerCapabilityHooks();
  }

  private registerCapabilityHooks(): void {
    // Update capability statement when packages are loaded
    this.addHook({
      name: 'capability-package-integration',
      phase: 'onRouteRegister',
      priority: 70, // After packages and routes are loaded
      handler: async (context) => {
        const packages = this.packageLoader.getLoadedPackages();
        this.capabilityGenerator.updateWithPackages(packages);

        const resourceCapabilities = new Map<string, ResourceCapabilities>();
        for (const pkg of packages) {
          for (const resourceType of pkg.resourceTypes) {
            const capabilities = this.routeGenerator.getResourceCapabilities(resourceType);
            resourceCapabilities.set(resourceType, capabilities);
          }
        }

        this.capabilityGenerator.updateWithResourceCapabilities(resourceCapabilities);

        context.logger.info('Capability statement updated', {
          resourceCount: resourceCapabilities.size,
          packageCount: packages.length
        });
      }
    });
  }

  // Override the default capabilities handler
  private createCapabilitiesHandler(): FhirOperationHandler {
    return async (context: RequestContext): Promise<ResponseContext> => {
      const capabilityStatement = this.capabilityGenerator.generate();

      return {
        ...context,
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        },
        responseBody: capabilityStatement
      };
    };
  }

  // Expose capability statement
  getCapabilityStatement(): CapabilityStatement {
    return this.capabilityGenerator.generate();
  }
}
```

### 3. Enhanced Metadata Endpoint
Create a comprehensive metadata endpoint with additional features:

```typescript
// Enhanced metadata handler with format negotiation
class MetadataHandler {
  constructor(
    private capabilityGenerator: CapabilityStatementGenerator,
    private packageLoader: PackageLoader
  ) {}

  async handle(context: RequestContext): Promise<ResponseContext> {
    const acceptHeader = context.headers.accept || 'application/fhir+json';
    const format = this.negotiateFormat(acceptHeader);

    const capabilityStatement = this.capabilityGenerator.generate();

    // Add server-specific metadata
    this.enrichCapabilityStatement(capabilityStatement, context);

    return {
      ...context,
      statusCode: 200,
      responseHeaders: {
        'Content-Type': format,
        'Cache-Control': 'public, max-age=300',
        'Last-Modified': new Date().toUTCString(),
        'Vary': 'Accept'
      },
      responseBody: this.formatResponse(capabilityStatement, format)
    };
  }

  private negotiateFormat(acceptHeader: string): string {
    if (acceptHeader.includes('application/fhir+xml')) {
      return 'application/fhir+xml; charset=utf-8';
    }
    return 'application/fhir+json; charset=utf-8';
  }

  private enrichCapabilityStatement(
    capability: CapabilityStatement,
    context: RequestContext
  ): void {
    // Add runtime information
    capability.implementation!.url = `${context.headers.host ? 'https://' + context.headers.host : 'http://localhost:3000'}`;

    // Add package information
    const packages = this.packageLoader.getLoadedPackages();
    if (packages.length > 0) {
      capability.implementationGuide = packages.map(pkg => ({
        url: `${pkg.name}#${pkg.version}`,
        version: pkg.version
      }));
    }

    // Add server uptime
    capability.extension = [
      {
        url: 'http://atomic-ehr.org/fhir/StructureDefinition/server-uptime',
        valueDateTime: new Date(process.uptime() * 1000).toISOString()
      }
    ];
  }

  private formatResponse(capability: CapabilityStatement, format: string): string {
    if (format.includes('xml')) {
      // TODO: Implement XML formatting
      return this.toXml(capability);
    }
    return JSON.stringify(capability, null, 2);
  }

  private toXml(capability: CapabilityStatement): string {
    // TODO: Implement FHIR XML serialization
    throw new Error('XML format not yet implemented');
  }
}
```

### 4. Capability Statement Validation
Add validation for the generated capability statement:

```typescript
class CapabilityStatementValidator {
  validateCapabilityStatement(capability: CapabilityStatement): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate required fields
    if (!capability.status || !['draft', 'active', 'retired', 'unknown'].includes(capability.status)) {
      errors.push({
        path: 'status',
        message: 'CapabilityStatement.status is required and must be a valid value'
      });
    }

    if (!capability.date) {
      errors.push({
        path: 'date',
        message: 'CapabilityStatement.date is required'
      });
    }

    if (!capability.kind || !['instance', 'capability', 'requirements'].includes(capability.kind)) {
      errors.push({
        path: 'kind',
        message: 'CapabilityStatement.kind is required and must be a valid value'
      });
    }

    if (!capability.fhirVersion) {
      errors.push({
        path: 'fhirVersion',
        message: 'CapabilityStatement.fhirVersion is required'
      });
    }

    // Validate REST component
    if (capability.rest) {
      for (let i = 0; i < capability.rest.length; i++) {
        const rest = capability.rest[i];
        if (!rest.mode || !['client', 'server'].includes(rest.mode)) {
          errors.push({
            path: `rest[${i}].mode`,
            message: 'CapabilityStatement.rest.mode is required and must be client or server'
          });
        }

        // Validate resources
        if (rest.resource) {
          for (let j = 0; j < rest.resource.length; j++) {
            const resource = rest.resource[j];
            if (!resource.type) {
              errors.push({
                path: `rest[${i}].resource[${j}].type`,
                message: 'CapabilityStatement.rest.resource.type is required'
              });
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## Implementation Details

### File Structure
```
packages/server/src/
├── capability/
│   ├── index.ts              # Capability exports
│   ├── generator.ts          # CapabilityStatementGenerator
│   ├── handler.ts            # MetadataHandler
│   ├── validator.ts          # CapabilityStatementValidator
│   └── types.ts              # Capability-specific types
└── ... (existing files)
```

### Key Components

#### 1. CapabilityStatementGenerator (`capability/generator.ts`)
- Generate complete CapabilityStatement from server state
- Include all loaded packages and their resources
- Report accurate resource capabilities and operations
- Support configuration options for security and features

#### 2. MetadataHandler (`capability/handler.ts`)
- Handle /metadata endpoint requests
- Support content negotiation (JSON/XML)
- Add runtime server information
- Implement caching for performance

#### 3. Integration Hooks
- Update capability statement when packages change
- Refresh capability information when routes are regenerated
- Include validation capabilities from validation bridge

## Success Criteria

### Must Have
- [ ] Generate CapabilityStatement for loaded R4 Core
- [ ] List all supported resource types (Patient, Observation, etc.)
- [ ] Report supported interactions per resource (create, read, update, delete, search)
- [ ] Include search parameters for each resource
- [ ] GET /metadata returns valid CapabilityStatement
- [ ] Capability statement reflects actual server capabilities

### FHIR Compliance
- [ ] CapabilityStatement conforms to FHIR R4 specification
- [ ] All required fields are present and valid
- [ ] Resource capabilities match actual server capabilities
- [ ] Search parameters are accurately reported
- [ ] Supported profiles are listed correctly

### Testing Requirements
- [ ] Unit tests for CapabilityStatementGenerator
- [ ] Unit tests for MetadataHandler
- [ ] Integration tests with loaded packages
- [ ] Validation tests for generated capability statement
- [ ] Content negotiation tests (JSON/XML)
- [ ] Caching tests for metadata endpoint

### Performance Requirements
- [ ] Capability statement generation completes in <1 second
- [ ] /metadata endpoint responds in <200ms
- [ ] Capability statement caching improves response times
- [ ] Memory usage for capability statement is reasonable

## Acceptance Criteria

### 1. Basic Capability Statement Generation
```typescript
// Should generate valid capability statement
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core']
});

await server.start();

const capability = server.getCapabilityStatement();
expect(capability.resourceType).toBe('CapabilityStatement');
expect(capability.status).toBe('active');
expect(capability.kind).toBe('instance');
expect(capability.fhirVersion).toBe('4.0.1');
expect(capability.rest).toHaveLength(1);
expect(capability.rest[0].mode).toBe('server');
```

### 2. Resource Capabilities
```typescript
// Should accurately report resource capabilities
const capability = server.getCapabilityStatement();
const patientResource = capability.rest[0].resource.find(r => r.type === 'Patient');

expect(patientResource).toBeDefined();
expect(patientResource.interaction).toContainEqual({ code: 'read' });
expect(patientResource.interaction).toContainEqual({ code: 'create' });
expect(patientResource.interaction).toContainEqual({ code: 'update' });
expect(patientResource.interaction).toContainEqual({ code: 'delete' });
expect(patientResource.interaction).toContainEqual({ code: 'search-type' });
```

### 3. Metadata Endpoint
```typescript
// Should serve capability statement at /metadata
const response = await fetch('http://localhost:3000/metadata');
expect(response.status).toBe(200);
expect(response.headers.get('Content-Type')).toBe('application/fhir+json; charset=utf-8');

const capability = await response.json();
expect(capability.resourceType).toBe('CapabilityStatement');
expect(capability.rest[0].resource.length).toBeGreaterThan(50); // R4 has many resources
```

### 4. Search Parameters
```typescript
// Should include search parameters for resources
const capability = server.getCapabilityStatement();
const patientResource = capability.rest[0].resource.find(r => r.type === 'Patient');

expect(patientResource.searchParam).toContainEqual({
  name: '_id',
  type: 'token',
  documentation: 'Logical resource identifier'
});

expect(patientResource.searchParam).toContainEqual({
  name: '_lastUpdated',
  type: 'date',
  documentation: 'When the resource was last updated'
});
```

### 5. Content Negotiation
```typescript
// Should support content negotiation
const jsonResponse = await fetch('http://localhost:3000/metadata', {
  headers: { 'Accept': 'application/fhir+json' }
});
expect(jsonResponse.headers.get('Content-Type')).toBe('application/fhir+json; charset=utf-8');

// TODO: When XML is implemented
// const xmlResponse = await fetch('http://localhost:3000/metadata', {
//   headers: { 'Accept': 'application/fhir+xml' }
// });
// expect(xmlResponse.headers.get('Content-Type')).toBe('application/fhir+xml; charset=utf-8');
```

### 6. Caching
```typescript
// Should implement caching headers
const response = await fetch('http://localhost:3000/metadata');
expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
expect(response.headers.get('Last-Modified')).toBeDefined();
```

## Dependencies
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- Task 005: Implement Dynamic Route Generation (completed)
- Task 006: Integrate Validation Bridge (completed)
- Understanding of FHIR CapabilityStatement specification

## Follow-up Tasks
- Task 008: Implement Error Handling (enhances error reporting in capability statement)
- Task 009: Create Documentation (documents capability statement usage)

## Notes
- Capability statement should accurately reflect actual server capabilities
- Consider implementing incremental updates when server configuration changes
- XML support can be added in future iterations
- Search parameter extraction from StructureDefinitions can be enhanced
- Capability statement should be cached for performance
- Consider adding extensions for server-specific capabilities