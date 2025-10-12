/**
 * FHIR CapabilityStatement generator
 */

import type { LoadedPackage } from '../packages-loader/index.js';
import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import type { ResourceCapabilities } from '../generation/handlers.js';
import type {
  CapabilityStatement,
  CapabilityStatementGeneratorConfig,
  CapabilityStatementSoftware,
  CapabilityStatementImplementation,
  CapabilityStatementRest,
  CapabilityStatementRestSecurity,
  CapabilityStatementRestResource,
  ResourceInteraction,
  SystemInteraction,
  SearchParam,
  OperationDefinitionReference
} from './types.js';

/**
 * Generator for FHIR CapabilityStatement
 */
export class CapabilityStatementGenerator {
  private config: Required<CapabilityStatementGeneratorConfig>;
  private packages: LoadedPackage[] = [];
  private resourceCapabilities: Map<string, ResourceCapabilities> = new Map();
  private baseUrl: string = 'http://localhost:3000';

  constructor(config: CapabilityStatementGeneratorConfig = {}) {
    this.config = {
      serverName: config.serverName || '@atomic-ehr/server',
      serverVersion: config.serverVersion || '0.1.0',
      serverDescription: config.serverDescription || 'FHIR Server with Hook-based Architecture',
      publisher: config.publisher || 'Atomic EHR',
      contact: config.contact || [],
      fhirVersion: config.fhirVersion || '4.0.1',
      format: config.format || ['application/fhir+json', 'application/fhir+xml'],
      acceptLanguage: config.acceptLanguage || ['en'],
      enabledOperations: config.enabledOperations || [],
      securityConfiguration: config.securityConfiguration || { cors: true }
    };
  }

  /**
   * Generate complete capability statement
   */
  generate(): CapabilityStatement {
    return {
      resourceType: 'CapabilityStatement',
      id: 'server-capability',
      url: `${this.baseUrl}/metadata`,
      version: this.config.serverVersion,
      name: this.config.serverName.replace(/[@\/-]/g, '_'),
      title: `${this.config.serverName} Capability Statement`,
      status: 'active',
      experimental: false,
      date: new Date().toISOString(),
      publisher: this.config.publisher,
      contact: this.config.contact,
      description: this.config.serverDescription,
      kind: 'instance',
      software: this.generateSoftwareComponent(),
      implementation: this.generateImplementationComponent(),
      fhirVersion: this.config.fhirVersion,
      format: this.config.format,
      patchFormat: ['application/json-patch+json', 'application/fhir+json'],
      implementationGuide: this.generateImplementationGuides(),
      rest: [this.generateRestComponent()]
    };
  }

  /**
   * Update with loaded packages
   */
  updateWithPackages(packages: LoadedPackage[]): void {
    this.packages = packages;
  }

  /**
   * Update with resource capabilities
   */
  updateWithResourceCapabilities(capabilities: Map<string, ResourceCapabilities>): void {
    this.resourceCapabilities = capabilities;
  }

  /**
   * Set base URL for the server
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate software component
   */
  private generateSoftwareComponent(): CapabilityStatementSoftware {
    return {
      name: this.config.serverName,
      version: this.config.serverVersion,
      releaseDate: new Date().toISOString()
    };
  }

  /**
   * Generate implementation component
   */
  private generateImplementationComponent(): CapabilityStatementImplementation {
    return {
      description: this.config.serverDescription,
      url: this.baseUrl
    };
  }

  /**
   * Generate implementation guide references
   */
  private generateImplementationGuides(): string[] {
    return this.packages.map(pkg => `${pkg.name}#${pkg.version}`);
  }

  /**
   * Generate REST component
   */
  private generateRestComponent(): CapabilityStatementRest {
    return {
      mode: 'server',
      documentation: 'FHIR R4 server with full CRUD operations and hook-based architecture',
      security: this.generateSecurityComponent(),
      resource: this.generateResourceComponents(),
      interaction: this.generateSystemInteractions(),
      operation: this.generateSystemOperations()
    };
  }

  /**
   * Generate security component
   */
  private generateSecurityComponent(): CapabilityStatementRestSecurity {
    const security: CapabilityStatementRestSecurity = {
      cors: this.config.securityConfiguration.cors || true,
      description: 'Security configuration for the FHIR server'
    };

    if (this.config.securityConfiguration.authentication?.length) {
      security.service = this.config.securityConfiguration.authentication.map(auth => ({
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
          code: auth.type,
          display: auth.display
        }],
        text: auth.description || undefined
      }));
    }

    return security;
  }

  /**
   * Generate resource components
   */
  private generateResourceComponents(): CapabilityStatementRestResource[] {
    const resources: CapabilityStatementRestResource[] = [];
    const processedTypes = new Set<string>();

    // Generate resource components from capabilities
    for (const [resourceType, capabilities] of this.resourceCapabilities.entries()) {
      if (processedTypes.has(resourceType)) {
        continue;
      }
      processedTypes.add(resourceType);

      const resource = this.generateResourceComponent(resourceType, capabilities);
      resources.push(resource);
    }

    return resources.sort((a, b) => a.type.localeCompare(b.type));
  }

  /**
   * Generate resource component for a specific resource type
   */
  private generateResourceComponent(
    resourceType: string,
    capabilities: ResourceCapabilities
  ): CapabilityStatementRestResource {
    return {
      type: resourceType,
      profile: `http://hl7.org/fhir/StructureDefinition/${resourceType}`,
      supportedProfile: this.getSupportedProfiles(resourceType),
      documentation: `${resourceType} resource with full CRUD capabilities`,
      interaction: this.generateResourceInteractions(capabilities),
      versioning: 'versioned',
      readHistory: capabilities.historyInstance || false,
      updateCreate: capabilities.update || false,
      conditionalCreate: false,
      conditionalRead: 'not-supported',
      conditionalUpdate: false,
      conditionalDelete: 'not-supported',
      searchInclude: this.getSearchIncludes(resourceType),
      searchRevInclude: this.getSearchRevIncludes(resourceType),
      searchParam: this.generateSearchParameters(resourceType)
    };
  }

  /**
   * Generate resource interactions based on capabilities
   */
  private generateResourceInteractions(capabilities: ResourceCapabilities): ResourceInteraction[] {
    const interactions: ResourceInteraction[] = [];

    if (capabilities.read) {
      interactions.push({
        code: 'read',
        documentation: 'Read the current state of a resource'
      });
    }

    if (capabilities.vread) {
      interactions.push({
        code: 'vread',
        documentation: 'Read a specific version of a resource'
      });
    }

    if (capabilities.update) {
      interactions.push({
        code: 'update',
        documentation: 'Update an existing resource'
      });
    }

    if (capabilities.patch) {
      interactions.push({
        code: 'patch',
        documentation: 'Patch an existing resource'
      });
    }

    if (capabilities.delete) {
      interactions.push({
        code: 'delete',
        documentation: 'Delete a resource'
      });
    }

    if (capabilities.create) {
      interactions.push({
        code: 'create',
        documentation: 'Create a new resource'
      });
    }

    if (capabilities.searchType) {
      interactions.push({
        code: 'search-type',
        documentation: 'Search resources of this type'
      });
    }

    if (capabilities.historyInstance) {
      interactions.push({
        code: 'history-instance',
        documentation: 'Retrieve the change history for a resource instance'
      });
    }

    if (capabilities.historyType) {
      interactions.push({
        code: 'history-type',
        documentation: 'Retrieve the change history for all resources of this type'
      });
    }

    return interactions;
  }

  /**
   * Generate search parameters for a resource type
   */
  private generateSearchParameters(resourceType: string): SearchParam[] {
    const searchParams: SearchParam[] = [];

    // Common search parameters for all resources
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
      },
      {
        name: '_security',
        type: 'token',
        documentation: 'Security labels applied to the resource'
      },
      {
        name: '_tag',
        type: 'token',
        documentation: 'Tags applied to the resource'
      },
      {
        name: '_source',
        type: 'uri',
        documentation: 'Source system for the resource'
      }
    );

    // Add resource-specific search parameters
    // TODO: Extract from StructureDefinition SearchParameter resources
    const resourceSpecificParams = this.getResourceSpecificSearchParams(resourceType);
    searchParams.push(...resourceSpecificParams);

    return searchParams;
  }

  /**
   * Get resource-specific search parameters
   */
  private getResourceSpecificSearchParams(resourceType: string): SearchParam[] {
    // Common search parameters for specific resource types
    const searchParamsByType: Record<string, SearchParam[]> = {
      Patient: [
        { name: 'identifier', type: 'token', documentation: 'A patient identifier' },
        { name: 'name', type: 'string', documentation: 'A portion of the patient\'s name' },
        { name: 'family', type: 'string', documentation: 'A portion of the family name' },
        { name: 'given', type: 'string', documentation: 'A portion of the given name' },
        { name: 'birthdate', type: 'date', documentation: 'The patient\'s date of birth' },
        { name: 'gender', type: 'token', documentation: 'Gender of the patient' },
        { name: 'active', type: 'token', documentation: 'Whether the patient record is active' }
      ],
      Observation: [
        { name: 'patient', type: 'reference', documentation: 'The patient the observation is about' },
        { name: 'subject', type: 'reference', documentation: 'The subject of the observation' },
        { name: 'code', type: 'token', documentation: 'The code of the observation type' },
        { name: 'category', type: 'token', documentation: 'The classification of the observation' },
        { name: 'date', type: 'date', documentation: 'Obtained date/time' },
        { name: 'status', type: 'token', documentation: 'The status of the observation' }
      ],
      Practitioner: [
        { name: 'identifier', type: 'token', documentation: 'A practitioner identifier' },
        { name: 'name', type: 'string', documentation: 'A portion of the practitioner\'s name' },
        { name: 'family', type: 'string', documentation: 'A portion of the family name' },
        { name: 'given', type: 'string', documentation: 'A portion of the given name' },
        { name: 'active', type: 'token', documentation: 'Whether the practitioner record is active' }
      ],
      Organization: [
        { name: 'identifier', type: 'token', documentation: 'An organization identifier' },
        { name: 'name', type: 'string', documentation: 'A portion of the organization\'s name' },
        { name: 'active', type: 'token', documentation: 'Whether the organization record is active' },
        { name: 'type', type: 'token', documentation: 'The type of organization' }
      ],
      Encounter: [
        { name: 'patient', type: 'reference', documentation: 'The patient present at the encounter' },
        { name: 'subject', type: 'reference', documentation: 'The subject of the encounter' },
        { name: 'date', type: 'date', documentation: 'The date of the encounter' },
        { name: 'status', type: 'token', documentation: 'The status of the encounter' },
        { name: 'class', type: 'token', documentation: 'Classification of the encounter' }
      ]
    };

    return searchParamsByType[resourceType] || [];
  }

  /**
   * Generate system-level interactions
   */
  private generateSystemInteractions(): SystemInteraction[] {
    const interactions: SystemInteraction[] = [];

    if (this.config.enabledOperations.includes('search-system')) {
      interactions.push({
        code: 'search-system',
        documentation: 'Search across all resource types'
      });
    }

    if (this.config.enabledOperations.includes('history-system')) {
      interactions.push({
        code: 'history-system',
        documentation: 'Retrieve the change history for all resources'
      });
    }

    if (this.config.enabledOperations.includes('batch')) {
      interactions.push({
        code: 'batch',
        documentation: 'Process a batch of independent requests'
      });
    }

    if (this.config.enabledOperations.includes('transaction')) {
      interactions.push({
        code: 'transaction',
        documentation: 'Process a transaction bundle'
      });
    }

    return interactions;
  }

  /**
   * Generate system-level operations
   */
  private generateSystemOperations(): OperationDefinitionReference[] {
    const operations: OperationDefinitionReference[] = [];

    if (this.config.enabledOperations.includes('batch')) {
      operations.push({
        name: 'batch',
        definition: 'http://hl7.org/fhir/OperationDefinition/Bundle-batch',
        documentation: 'Process a batch of independent requests'
      });
    }

    if (this.config.enabledOperations.includes('transaction')) {
      operations.push({
        name: 'transaction',
        definition: 'http://hl7.org/fhir/OperationDefinition/Bundle-transaction',
        documentation: 'Process a transaction bundle with atomicity guarantees'
      });
    }

    return operations;
  }

  /**
   * Get supported profiles for a resource type
   */
  private getSupportedProfiles(resourceType: string): string[] {
    const profiles: string[] = [];

    // Always include base profile
    profiles.push(`http://hl7.org/fhir/StructureDefinition/${resourceType}`);

    // Find constraint profiles from packages
    for (const pkg of this.packages) {
      for (const [url, schema] of Object.entries(pkg.resources)) {
        const fhirSchema = schema as FHIRSchema;

        // Check if this is a profile that constrains the resource type
        if (fhirSchema.type === resourceType &&
            fhirSchema.derivation === 'constraint' &&
            url !== `http://hl7.org/fhir/StructureDefinition/${resourceType}`) {
          profiles.push(url);
        }
      }
    }

    return profiles;
  }

  /**
   * Get search include parameters for a resource type
   */
  private getSearchIncludes(resourceType: string): string[] {
    // TODO: Extract from SearchParameter resources
    // For now, return common includes
    const includesByType: Record<string, string[]> = {
      Patient: ['Patient:general-practitioner', 'Patient:organization', 'Patient:link'],
      Observation: ['Observation:patient', 'Observation:performer', 'Observation:encounter'],
      Encounter: ['Encounter:patient', 'Encounter:practitioner', 'Encounter:location']
    };

    return includesByType[resourceType] || [];
  }

  /**
   * Get search reverse include parameters for a resource type
   */
  private getSearchRevIncludes(resourceType: string): string[] {
    // TODO: Extract from SearchParameter resources
    // For now, return common reverse includes
    const revIncludesByType: Record<string, string[]> = {
      Patient: ['Observation:patient', 'Encounter:patient', 'Condition:patient'],
      Practitioner: ['Encounter:practitioner', 'Observation:performer'],
      Organization: ['Patient:organization', 'Practitioner:organization']
    };

    return revIncludesByType[resourceType] || [];
  }
}