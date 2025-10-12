/**
 * Extended context types for package integration
 */

import type { RequestContext, ResponseContext } from '@atomic-ehr/core';
import type { PackageLoader, LoadedPackage, ResourceDiscovery } from '../packages-loader/index.js';
import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import type { SearchParameter } from '@atomic-ehr/fhir-canonical-manager';

/**
 * Extended request context with package information
 */
export interface ExtendedRequestContext extends RequestContext {
  // Package information
  schemas: Map<string, FHIRSchema>;
  packageLoader: PackageLoader;

  // Schema for current resource (if available)
  schema?: FHIRSchema;

  // Package stats (available after bootstrap)
  packageStats?: {
    totalPackages: number;
    totalResourceTypes: number;
    totalSchemas: number;
    totalLoadTime: number;
  };

  // Loaded packages (available after bootstrap)
  loadedPackages?: LoadedPackage[];

  // Convenience methods
  getSchema(resourceType: string): FHIRSchema | undefined;
  isResourceTypeSupported(resourceType: string): boolean;
  getSupportedOperations(resourceType: string): string[];
  getSearchParameters(resourceType: string): SearchParameter[];
}

/**
 * Extended response context with package information
 */
export interface ExtendedResponseContext extends ResponseContext {
  // Resource discovery information (for metadata endpoints)
  resourceDiscovery?: ResourceDiscovery;

  // Package information for capability statements
  packageInfo?: {
    loadedPackages: LoadedPackage[];
    supportedResourceTypes: string[];
    totalSchemas: number;
  };
}

/**
 * Package-aware hook context
 */
export interface PackageHookContext {
  // Package loader for advanced operations
  packageLoader: PackageLoader;

  // Current schemas
  schemas: Map<string, FHIRSchema>;

  // Resource type being processed
  resourceType?: string;

  // Schema for current resource
  schema?: FHIRSchema;

  // Package discovery
  resourceDiscovery: ResourceDiscovery;

  // Validation helpers
  validateResource?(resource: any): Promise<boolean>;
  getValidationErrors?(resource: any): Promise<string[]>;
}

/**
 * Type guard to check if context has package integration
 */
export function hasPackageIntegration(context: any): context is ExtendedRequestContext {
  return context &&
         typeof context === 'object' &&
         'schemas' in context &&
         'packageLoader' in context &&
         typeof context.getSchema === 'function';
}

/**
 * Type guard to check if context has resource schema
 */
export function hasResourceSchema(context: any): context is ExtendedRequestContext & { schema: FHIRSchema } {
  return hasPackageIntegration(context) && 'schema' in context && context.schema != null;
}

/**
 * Utility functions for working with extended context
 */
export const ContextUtils = {
  /**
   * Get schema safely from context
   */
  getSchema(context: any, resourceType: string): FHIRSchema | undefined {
    if (!hasPackageIntegration(context)) {
      return undefined;
    }
    return context.getSchema(resourceType);
  },

  /**
   * Check if resource type is supported
   */
  isResourceTypeSupported(context: any, resourceType: string): boolean {
    if (!hasPackageIntegration(context)) {
      return false;
    }
    return context.isResourceTypeSupported(resourceType);
  },

  /**
   * Get supported resource types
   */
  getSupportedResourceTypes(context: any): string[] {
    if (!hasPackageIntegration(context)) {
      return [];
    }
    return context.packageLoader.getAllResourceTypes();
  },

  /**
   * Get supported operations for a resource type
   */
  getSupportedOperations(context: any, resourceType: string): string[] {
    if (!hasPackageIntegration(context)) {
      return [];
    }
    return context.getSupportedOperations(resourceType);
  },

  /**
   * Get search parameters for a resource type
   */
  getSearchParameters(context: any, resourceType: string): SearchParameter[] {
    if (!hasPackageIntegration(context)) {
      return [];
    }
    return context.getSearchParameters(resourceType);
  },

  /**
   * Get all loaded packages
   */
  getLoadedPackages(context: any): LoadedPackage[] {
    if (!hasPackageIntegration(context)) {
      return [];
    }
    return context.packageLoader.getLoadedPackages();
  },

  /**
   * Get resource discovery information
   */
  getResourceDiscovery(context: any): ResourceDiscovery | undefined {
    if (!hasPackageIntegration(context)) {
      return undefined;
    }
    return context.packageLoader.discoverResources();
  },

  /**
   * Create package info for capability statements
   */
  createPackageInfo(context: any): {
    loadedPackages: LoadedPackage[];
    supportedResourceTypes: string[];
    totalSchemas: number;
  } | undefined {
    if (!hasPackageIntegration(context)) {
      return undefined;
    }

    const loadedPackages = context.packageLoader.getLoadedPackages();
    const supportedResourceTypes = context.packageLoader.getAllResourceTypes();
    const totalSchemas = context.schemas.size;

    return {
      loadedPackages,
      supportedResourceTypes,
      totalSchemas
    };
  }
};

/**
 * Context factory for creating extended contexts
 */
export class ExtendedContextFactory {
  /**
   * Enhance base context with package integration
   */
  static enhance(
    baseContext: RequestContext,
    packageLoader: PackageLoader
  ): ExtendedRequestContext {
    const schemas = packageLoader.getSchemas();

    const enhancedContext = {
      ...baseContext,
      schemas,
      packageLoader,

      // Convenience methods
      getSchema: (resourceType: string) => packageLoader.getSchema(resourceType),
      isResourceTypeSupported: (resourceType: string) => packageLoader.isResourceTypeSupported(resourceType),
      getSupportedOperations: (resourceType: string) => packageLoader.getSupportedOperations(resourceType),
      getSearchParameters: (resourceType: string) => packageLoader.getSearchParameters(resourceType)
    } as ExtendedRequestContext;

    return enhancedContext;
  }

  /**
   * Create package hook context
   */
  static createPackageHookContext(
    packageLoader: PackageLoader,
    resourceType?: string
  ): PackageHookContext {
    const schemas = packageLoader.getSchemas();
    const schema = resourceType ? packageLoader.getSchema(resourceType) : undefined;
    const resourceDiscovery = packageLoader.discoverResources();

    return {
      packageLoader,
      schemas,
      resourceType,
      schema,
      resourceDiscovery,

      // Validation helpers (placeholder implementations)
      async validateResource(resource: any): Promise<boolean> {
        // In a full implementation, this would validate against the schema
        return true;
      },

      async getValidationErrors(resource: any): Promise<string[]> {
        // In a full implementation, this would return validation errors
        return [];
      }
    };
  }
}