/**
 * Dynamic route generator for FHIR resources
 */

import type { LoadedPackage } from '@atomic-ehr/packages';
import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import type { FhirRoute } from '../routing/types.js';
import { FhirUrlPattern, FhirOperation } from '../routing/types.js';
import type { StorageAdapter } from './storage.js';
import { MemoryStorageAdapter } from './memory-storage.js';
import { ResourceHandler, type ResourceCapabilities } from './handlers.js';
import type { HttpRequestContext, HttpResponseContext } from '../types.js';

/**
 * Configuration for route generator
 */
export interface RouteGeneratorConfig {
  /** Enabled FHIR operations */
  enabledOperations?: FhirOperation[];

  /** Default capabilities for all resources */
  defaultCapabilities?: ResourceCapabilities;

  /** Storage adapter to use */
  storage?: StorageAdapter;

  /** Priority for generated routes */
  priority?: number;
}

/**
 * Route generator that creates dynamic routes from FHIR packages
 */
export class RouteGenerator {
  private config: RouteGeneratorConfig;
  private storage: StorageAdapter;
  private handlers: Map<string, ResourceHandler> = new Map();
  private resourceCapabilities: Map<string, ResourceCapabilities> = new Map();

  constructor(config: RouteGeneratorConfig = {}) {
    this.storage = config.storage || new MemoryStorageAdapter();

    this.config = {
      enabledOperations: config.enabledOperations || Object.values(FhirOperation),
      defaultCapabilities: config.defaultCapabilities || {
        read: true,
        vread: true,
        update: true,
        create: true,
        delete: true,
        searchType: true,
        historyInstance: true,
        historyType: true
      },
      storage: this.storage,
      priority: config.priority !== undefined ? config.priority : 100
    };
  }

  /**
   * Generate routes from loaded packages
   */
  generateFromPackages(packages: LoadedPackage[]): FhirRoute[] {
    const routes: FhirRoute[] = [];

    // Extract all resource types from packages
    const resourceTypes = new Set<string>();
    const schemas = new Map<string, FHIRSchema>();

    for (const pkg of packages) {
      // Get all StructureDefinitions that are resources
      for (const [url, schema] of Object.entries(pkg.resources)) {
        const resourceType = this.extractResourceTypeFromUrl(url);
        if (resourceType && this.isResourceType(schema)) {
          resourceTypes.add(resourceType);
          schemas.set(resourceType, schema as FHIRSchema);
        }
      }
    }

    // Generate routes for each resource type
    for (const resourceType of resourceTypes) {
      const schema = schemas.get(resourceType);
      const resourceRoutes = this.generateFromResourceType(resourceType, schema);
      routes.push(...resourceRoutes);
    }

    return routes;
  }

  /**
   * Generate routes for a specific resource type
   */
  private generateFromResourceType(
    resourceType: string,
    schema?: FHIRSchema
  ): FhirRoute[] {
    const routes: FhirRoute[] = [];
    const capabilities = this.getResourceCapabilities(resourceType);

    // Create resource handler
    const handler = this.createResourceHandler(resourceType, schema, capabilities);

    // Generate instance-level routes
    if (capabilities.read) {
      routes.push(this.createRoute(
        'GET',
        FhirUrlPattern.READ,
        FhirOperation.READ,
        'instance',
        resourceType,
        (ctx) => handler.read(ctx)
      ));
    }

    if (capabilities.vread) {
      routes.push(this.createRoute(
        'GET',
        FhirUrlPattern.VREAD,
        FhirOperation.VREAD,
        'instance',
        resourceType,
        (ctx) => handler.vread(ctx)
      ));
    }

    if (capabilities.update) {
      routes.push(this.createRoute(
        'PUT',
        FhirUrlPattern.UPDATE,
        FhirOperation.UPDATE,
        'instance',
        resourceType,
        (ctx) => handler.update(ctx)
      ));
    }

    if (capabilities.patch) {
      routes.push(this.createRoute(
        'PATCH',
        FhirUrlPattern.PATCH,
        FhirOperation.PATCH,
        'instance',
        resourceType,
        (ctx) => handler.patch(ctx)
      ));
    }

    if (capabilities.delete) {
      routes.push(this.createRoute(
        'DELETE',
        FhirUrlPattern.DELETE,
        FhirOperation.DELETE,
        'instance',
        resourceType,
        (ctx) => handler.delete(ctx)
      ));
    }

    if (capabilities.historyInstance) {
      routes.push(this.createRoute(
        'GET',
        FhirUrlPattern.HISTORY_INSTANCE,
        FhirOperation.HISTORY_INSTANCE,
        'instance',
        resourceType,
        (ctx) => handler.historyInstance(ctx)
      ));
    }

    // Generate type-level routes
    if (capabilities.create) {
      routes.push(this.createRoute(
        'POST',
        FhirUrlPattern.CREATE,
        FhirOperation.CREATE,
        'type',
        resourceType,
        (ctx) => handler.create(ctx)
      ));
    }

    if (capabilities.searchType) {
      routes.push(this.createRoute(
        'GET',
        FhirUrlPattern.SEARCH_TYPE,
        FhirOperation.SEARCH_TYPE,
        'type',
        resourceType,
        (ctx) => handler.search(ctx)
      ));
    }

    if (capabilities.historyType) {
      routes.push(this.createRoute(
        'GET',
        FhirUrlPattern.HISTORY_TYPE,
        FhirOperation.HISTORY_TYPE,
        'type',
        resourceType,
        (ctx) => handler.historyType(ctx)
      ));
    }

    return routes;
  }

  /**
   * Create a resource handler
   */
  private createResourceHandler(
    resourceType: string,
    schema: FHIRSchema | undefined,
    capabilities: ResourceCapabilities
  ): ResourceHandler {
    // Check if handler already exists
    if (this.handlers.has(resourceType)) {
      return this.handlers.get(resourceType)!;
    }

    const handler = new ResourceHandler(resourceType, schema, this.storage, capabilities);
    this.handlers.set(resourceType, handler);
    return handler;
  }

  /**
   * Create a route configuration
   */
  private createRoute(
    method: string,
    pattern: FhirUrlPattern,
    operation: FhirOperation,
    level: 'system' | 'type' | 'instance',
    resourceType: string,
    handler: (ctx: HttpRequestContext) => Promise<HttpResponseContext>
  ): FhirRoute {
    return {
      method,
      pattern,
      operation,
      level,
      handler: async (ctx: HttpRequestContext) => {
        // Ensure resourceType is set in context
        if (!ctx.resourceType) {
          ctx.resourceType = resourceType;
        }
        return handler(ctx);
      },
      priority: this.config.priority,
      description: `${operation} operation for ${resourceType}`
    };
  }

  /**
   * Get resource capabilities
   */
  getResourceCapabilities(resourceType: string): ResourceCapabilities {
    if (this.resourceCapabilities.has(resourceType)) {
      return this.resourceCapabilities.get(resourceType)!;
    }

    // Use default capabilities
    const capabilities = { ...(this.config.defaultCapabilities || {}) };
    this.resourceCapabilities.set(resourceType, capabilities);
    return capabilities;
  }

  /**
   * Set capabilities for a specific resource type
   */
  setResourceCapabilities(resourceType: string, capabilities: ResourceCapabilities): void {
    this.resourceCapabilities.set(resourceType, capabilities);
  }

  /**
   * Get supported operations for a resource type
   */
  getSupportedOperations(resourceType: string): FhirOperation[] {
    const capabilities = this.getResourceCapabilities(resourceType);
    const operations: FhirOperation[] = [];

    if (capabilities.read) operations.push(FhirOperation.READ);
    if (capabilities.vread) operations.push(FhirOperation.VREAD);
    if (capabilities.update) operations.push(FhirOperation.UPDATE);
    if (capabilities.patch) operations.push(FhirOperation.PATCH);
    if (capabilities.create) operations.push(FhirOperation.CREATE);
    if (capabilities.delete) operations.push(FhirOperation.DELETE);
    if (capabilities.searchType) operations.push(FhirOperation.SEARCH_TYPE);
    if (capabilities.historyInstance) operations.push(FhirOperation.HISTORY_INSTANCE);
    if (capabilities.historyType) operations.push(FhirOperation.HISTORY_TYPE);

    return operations;
  }

  /**
   * Get the storage adapter
   */
  getStorage(): StorageAdapter {
    return this.storage;
  }

  /**
   * Extract resource type from StructureDefinition URL
   */
  private extractResourceTypeFromUrl(url: string): string | undefined {
    // Example: http://hl7.org/fhir/StructureDefinition/Patient -> Patient
    const match = url.match(/\/StructureDefinition\/([A-Z][a-zA-Z]+)$/);
    return match ? match[1] : undefined;
  }

  /**
   * Check if a schema represents a FHIR resource type
   */
  private isResourceType(schema: any): boolean {
    // Check if this is a base resource definition
    // In FHIR, resources have kind = "resource"
    if (schema.kind === 'resource') {
      return true;
    }

    // Also check for derivation from Resource
    if (schema.baseDefinition?.includes('/Resource')) {
      return true;
    }

    // Check if it's a known resource type by name
    const resourceTypes = [
      'Patient', 'Observation', 'Practitioner', 'Organization', 'Encounter',
      'Condition', 'Procedure', 'MedicationRequest', 'DiagnosticReport',
      'AllergyIntolerance', 'CarePlan', 'CareTeam', 'Immunization', 'Location',
      'Medication', 'Device', 'Specimen', 'ServiceRequest', 'DocumentReference'
      // Add more as needed
    ];

    return resourceTypes.includes(schema.name || schema.type || '');
  }
}