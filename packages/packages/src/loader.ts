/**
 * Package Loader implementation for managing FHIR packages
 */

import { FhirBridge, createFhirBridge } from '@atomic-ehr/fhir-bridge';
import type { FhirPackage } from '@atomic-ehr/fhir-bridge';
import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import type { SearchParameter } from '@atomic-ehr/fhir-canonical-manager';

import type {
  PackageLoaderConfig,
  LoadedPackage,
  PackageLoadProgress,
  PackageLoadStats,
  ResourceDiscovery,
  PackageLoaderError,
  MultiplePackageLoadError,
  PackageEvent,
  PackageEventListener
} from './types.js';

/**
 * Manages loading and organization of multiple FHIR packages
 */
export class PackageLoader {
  private bridge: FhirBridge;
  private config: PackageLoaderConfig;
  private loadedPackages: Map<string, LoadedPackage> = new Map();
  private schemas: Map<string, FHIRSchema> = new Map();
  private eventListeners: PackageEventListener[] = [];

  constructor(config: PackageLoaderConfig) {
    this.config = config;

    // Use provided bridge or create new one
    this.bridge = config.bridge || createFhirBridge(config.bridgeConfig);
  }

  /**
   * Initialize the package loader
   */
  async init(): Promise<void> {
    await this.bridge.init();
  }

  /**
   * Dispose of loader resources
   */
  async dispose(): Promise<void> {
    await this.bridge.dispose();
  }

  /**
   * Add event listener
   */
  addEventListener(listener: PackageEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: PackageEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index >= 0) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: PackageEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        // Silently handle listener errors to prevent disruption
        console.warn('Package event listener error:', error);
      }
    }
  }

  /**
   * Load a single package
   */
  async load(packageName: string, version?: string): Promise<LoadedPackage> {
    const packageKey = `${packageName}${version ? `@${version}` : ''}`;

    // Check if already loaded
    const existing = this.loadedPackages.get(packageKey);
    if (existing) {
      return existing;
    }

    const startTime = Date.now();
    this.emitEvent({ type: 'loadStart', packageName: packageKey });

    try {
      // Load package via bridge
      const fhirPackage = await this.bridge.loadPackage(packageName, version);

      // Convert structure definitions to schemas
      const conversionResult = this.bridge.convertToSchemas(fhirPackage.structureDefinitions);

      // Create loaded package info
      const loadedPackage: LoadedPackage = {
        name: packageName,
        version: version || 'latest',
        package: fhirPackage,
        schemas: conversionResult.schemas,
        resourceTypes: conversionResult.resourceTypes,
        structureDefinitions: fhirPackage.structureDefinitions,
        searchParameters: fhirPackage.searchParameters,
        loadTime: Date.now() - startTime,
        loadedAt: new Date()
      };

      // Store loaded package
      this.loadedPackages.set(packageKey, loadedPackage);

      // Merge schemas into global schema map
      for (const [resourceType, schema] of conversionResult.schemas) {
        this.schemas.set(resourceType, schema);
      }

      // Report any conversion errors
      if (conversionResult.errors.length > 0) {
        console.warn(`Schema conversion errors for ${packageKey}:`, conversionResult.errors);
      }

      this.emitEvent({
        type: 'loadComplete',
        packageName: packageKey,
        loadTime: loadedPackage.loadTime
      });

      return loadedPackage;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitEvent({
        type: 'loadError',
        packageName: packageKey,
        error: errorMessage
      });

      throw new PackageLoaderError(
        `Failed to load package ${packageKey}: ${errorMessage}`,
        'PACKAGE_LOAD_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Load multiple packages
   */
  async loadMultiple(packages: string[]): Promise<LoadedPackage[]> {
    const results: LoadedPackage[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const packageSpec of packages) {
      try {
        // Parse package specification (name@version)
        const [name, version] = packageSpec.includes('@')
          ? packageSpec.split('@')
          : [packageSpec, undefined];

        const loadedPackage = await this.load(name, version);
        results.push(loadedPackage);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ name: packageSpec, error: errorMessage });
      }
    }

    // Generate statistics
    const stats = this.generateStats();

    if (errors.length > 0) {
      this.emitEvent({ type: 'allError', errors });

      if (results.length === 0) {
        // All packages failed
        throw new MultiplePackageLoadError(errors, []);
      } else {
        // Some packages failed, emit warning and continue
        console.warn(`Some packages failed to load:`, errors);
      }
    }

    this.emitEvent({ type: 'allComplete', stats });
    return results;
  }

  /**
   * Load packages from configuration
   */
  async loadFromConfig(config: { packages: string[] }): Promise<LoadedPackage[]> {
    return this.loadMultiple(config.packages);
  }

  /**
   * Get all schemas
   */
  getSchemas(): Map<string, FHIRSchema> {
    return new Map(this.schemas);
  }

  /**
   * Get schema for a specific resource type
   */
  getSchema(resourceType: string): FHIRSchema | undefined {
    return this.schemas.get(resourceType);
  }

  /**
   * Get all resource types
   */
  getAllResourceTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get loaded packages
   */
  getLoadedPackages(): LoadedPackage[] {
    return Array.from(this.loadedPackages.values());
  }

  /**
   * Get package by name
   */
  getPackage(name: string): LoadedPackage | undefined {
    return this.loadedPackages.get(name);
  }

  /**
   * Check if package is loaded
   */
  isPackageLoaded(name: string): boolean {
    return this.loadedPackages.has(name);
  }

  /**
   * Get resource types from a specific package
   */
  getResourceTypesFromPackage(packageName: string): string[] {
    const pkg = this.getPackage(packageName);
    return pkg ? pkg.resourceTypes : [];
  }

  /**
   * Get supported operations for a resource type
   */
  getSupportedOperations(resourceType: string): string[] {
    // For now, return common FHIR operations
    // In a full implementation, this would analyze CapabilityStatement
    return ['read', 'create', 'update', 'delete', 'search'];
  }

  /**
   * Get search parameters for a resource type
   */
  getSearchParameters(resourceType: string): SearchParameter[] {
    const allSearchParams: SearchParameter[] = [];

    for (const pkg of this.loadedPackages.values()) {
      const resourceSearchParams = pkg.searchParameters.filter(
        sp => sp.base && sp.base.includes(resourceType)
      );
      allSearchParams.push(...resourceSearchParams);
    }

    return allSearchParams;
  }

  /**
   * Discover available resources and capabilities
   */
  discoverResources(): ResourceDiscovery {
    const resourceTypes = this.getAllResourceTypes();
    const resourceTypesByPackage = new Map<string, string[]>();
    const operationsByResourceType = new Map<string, string[]>();
    const searchParametersByResourceType = new Map<string, SearchParameter[]>();
    const baseProfiles: string[] = [];
    const constraintProfiles: string[] = [];

    // Build resource types by package
    for (const [packageKey, pkg] of this.loadedPackages) {
      resourceTypesByPackage.set(packageKey, pkg.resourceTypes);
    }

    // Build operations by resource type
    for (const resourceType of resourceTypes) {
      operationsByResourceType.set(resourceType, this.getSupportedOperations(resourceType));
      searchParametersByResourceType.set(resourceType, this.getSearchParameters(resourceType));
    }

    // Classify profiles (simplified logic)
    for (const pkg of this.loadedPackages.values()) {
      for (const sd of pkg.structureDefinitions) {
        if (sd.type && sd.kind === 'resource') {
          if (pkg.name.includes('core') || pkg.name.includes('r4')) {
            baseProfiles.push(sd.type);
          } else {
            constraintProfiles.push(sd.type);
          }
        }
      }
    }

    return {
      resourceTypes,
      resourceTypesByPackage,
      operationsByResourceType,
      searchParametersByResourceType,
      baseProfiles: [...new Set(baseProfiles)],
      constraintProfiles: [...new Set(constraintProfiles)]
    };
  }

  /**
   * Generate loading statistics
   */
  generateStats(): PackageLoadStats {
    const packages = Array.from(this.loadedPackages.values());
    const totalPackages = packages.length;
    const totalResourceTypes = this.getAllResourceTypes().length;
    const totalSchemas = this.schemas.size;
    const totalLoadTime = packages.reduce((sum, pkg) => sum + pkg.loadTime, 0);

    let totalStructureDefinitions = 0;
    let totalSearchParameters = 0;

    const packageBreakdown = packages.map(pkg => {
      totalStructureDefinitions += pkg.structureDefinitions.length;
      totalSearchParameters += pkg.searchParameters.length;

      return {
        name: pkg.name,
        version: pkg.version,
        resourceTypes: pkg.resourceTypes.length,
        schemas: pkg.schemas.size,
        loadTime: pkg.loadTime
      };
    });

    return {
      totalPackages,
      totalResourceTypes,
      totalSchemas,
      totalStructureDefinitions,
      totalSearchParameters,
      totalLoadTime,
      packageBreakdown
    };
  }

  /**
   * Unload a package
   */
  async unload(packageName: string): Promise<void> {
    const pkg = this.loadedPackages.get(packageName);
    if (!pkg) {
      return;
    }

    // Remove schemas from global map
    for (const resourceType of pkg.resourceTypes) {
      this.schemas.delete(resourceType);
    }

    // Remove package
    this.loadedPackages.delete(packageName);
  }

  /**
   * Unload all packages
   */
  async unloadAll(): Promise<void> {
    this.loadedPackages.clear();
    this.schemas.clear();
    await this.bridge.clearCache();
  }

  /**
   * Check if a resource type is supported
   */
  isResourceTypeSupported(resourceType: string): boolean {
    return this.schemas.has(resourceType);
  }

  /**
   * Get package loader configuration
   */
  getConfig(): PackageLoaderConfig {
    return { ...this.config };
  }

  /**
   * Get bridge instance
   */
  getBridge(): FhirBridge {
    return this.bridge;
  }
}