/**
 * FHIR Bridge implementation - integrates canonical-manager and fhirschema
 */

import { createCanonicalManager } from '@atomic-ehr/fhir-canonical-manager';
import { translate } from '@atomic-ehr/fhirschema';
import type {
  Resource,
  PackageId,
  SearchParameter,
  Reference
} from '@atomic-ehr/fhir-canonical-manager';
import type { FHIRSchema, StructureDefinition } from '@atomic-ehr/fhirschema';

import type {
  FhirBridgeConfig,
  FhirPackage,
  PackageLoadDiagnostic,
  SchemaConversionResult
} from './types.js';

import {
  PackageLoadError,
  SchemaConversionError
} from './types.js';

// Type alias to work around export conflicts in canonical-manager
// Using any temporarily to unblock build - TODO: Fix canonical-manager exports
type CanonicalManager = any;

/**
 * Bridge between canonical-manager and fhirschema for the atomic-ehr framework
 */
export class FhirBridge {
  private canonicalManager: CanonicalManager | null = null;
  private config: Required<FhirBridgeConfig>;
  private loadedPackages: Map<string, FhirPackage> = new Map();
  private diagnostics: PackageLoadDiagnostic[] = [];
  private packageNames: Set<string> = new Set();

  constructor(config: FhirBridgeConfig = {}) {
    this.config = {
      packageCacheDir: './packages',
      registryUrls: ['https://packages.fhir.org'],
      timeout: 30000,
      workingDir: './packages',
      registry: 'https://packages.fhir.org',
      ...config
    };
  }

  /**
   * Initialize the bridge
   */
  async init(): Promise<void> {
    // Create canonical manager with any packages that have been requested
    await this.ensureCanonicalManager();
  }

  /**
   * Dispose of bridge resources
   */
  async dispose(): Promise<void> {
    if (this.canonicalManager) {
      await this.canonicalManager.destroy();
      this.canonicalManager = null;
    }
  }

  /**
   * Ensure canonical manager is created with current packages
   */
  private async ensureCanonicalManager(): Promise<void> {
    // If we already have a manager with the right packages, don't recreate
    if (this.canonicalManager) {
      return;
    }

    // Create canonical manager with all requested packages
    const packages = Array.from(this.packageNames);
    this.canonicalManager = createCanonicalManager({
      packages,
      workingDir: this.config.workingDir,
      registry: this.config.registry
    });

    await this.canonicalManager.init();
  }

  /**
   * Load a FHIR package by name and version
   */
  async loadPackage(packageName: string, version?: string): Promise<FhirPackage> {
    const startTime = Date.now();
    const packageKey = `${packageName}${version ? `@${version}` : ''}`;

    // Check if already loaded
    const existing = this.loadedPackages.get(packageKey);
    if (existing) {
      return existing;
    }

    // Create diagnostic entry
    const diagnostic: PackageLoadDiagnostic = {
      packageName,
      version,
      status: 'loading'
    };
    this.diagnostics.push(diagnostic);

    try {
      // Add package to our tracking
      this.packageNames.add(packageKey);

      // Recreate canonical manager with all packages (if we have packages to load)
      if (this.canonicalManager) {
        await this.canonicalManager.destroy();
        this.canonicalManager = null;
      }

      await this.ensureCanonicalManager();

      // Get package info
      if (!this.canonicalManager) {
        throw new Error('Canonical manager not initialized');
      }

      const packages = await this.canonicalManager.packages();
      const packageInfo = packages.find((p: PackageId) => p.name === packageName);

      if (!packageInfo) {
        throw new Error(`Package ${packageName} not found after loading`);
      }

      // Load all resources from the package
      const allResources = await this.canonicalManager.search({
        package: packageInfo
      });

      // Filter structure definitions
      const structureDefinitions = allResources.filter(
        (resource: Resource) => resource.resourceType === 'StructureDefinition'
      ) as StructureDefinition[];

      // Filter search parameters
      const searchParameters = allResources.filter(
        (resource: Resource) => resource.resourceType === 'SearchParameter'
      ) as SearchParameter[];

      // Create package object
      const fhirPackage: FhirPackage = {
        id: packageInfo,
        path: '', // Not available from canonical manager
        canonical: packageInfo.name,
        fhirVersions: undefined, // Could be extracted from package metadata
        resources: allResources,
        structureDefinitions,
        searchParameters
      };

      // Store loaded package
      this.loadedPackages.set(packageKey, fhirPackage);

      // Update diagnostic
      const loadTime = Date.now() - startTime;
      diagnostic.status = 'loaded';
      diagnostic.resourceCount = allResources.length;
      diagnostic.loadTime = loadTime;
      diagnostic.metadata = {
        structureDefinitions: structureDefinitions.length,
        searchParameters: searchParameters.length
      };

      return fhirPackage;

    } catch (error) {
      // Update diagnostic with error
      diagnostic.status = 'failed';
      diagnostic.error = error instanceof Error ? error.message : String(error);
      diagnostic.loadTime = Date.now() - startTime;

      throw new PackageLoadError(
        packageName,
        version,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Load a package from a direct URL
   */
  async loadPackageFromUrl(url: string): Promise<FhirPackage> {
    // For now, delegate to loadPackage with URL as name
    // In a full implementation, this would handle direct URL downloads
    const packageName = url.split('/').pop() || url;
    return this.loadPackage(packageName);
  }

  /**
   * Load a package from a local file
   */
  async loadPackageFromFile(filePath: string): Promise<FhirPackage> {
    // For now, delegate to loadPackage with file path as name
    // In a full implementation, this would handle local file loading
    const packageName = filePath.split('/').pop() || filePath;
    return this.loadPackage(packageName);
  }

  /**
   * Convert structure definitions to FHIRSchemas
   */
  convertToSchemas(structDefs: StructureDefinition[]): SchemaConversionResult {
    const schemas = new Map<string, FHIRSchema>();
    const errors: SchemaConversionError[] = [];
    const resourceTypes: string[] = [];

    for (const structDef of structDefs) {
      try {
        // Extract resource type from structure definition
        const resourceType = structDef.type || structDef.id || 'Unknown';
        resourceTypes.push(resourceType);

        // Convert to FHIRSchema using fhirschema translate function
        const schema = translate(structDef);
        schemas.set(resourceType, schema);

      } catch (error) {
        const conversionError = new SchemaConversionError(
          structDef.type || structDef.id || 'Unknown',
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error : undefined
        );
        errors.push(conversionError);
      }
    }

    return {
      schemas,
      errors,
      resourceTypes
    };
  }

  /**
   * Convert a single structure definition to FHIRSchema
   */
  convertStructureDefinition(structDef: StructureDefinition): FHIRSchema {
    try {
      return translate(structDef);
    } catch (error) {
      throw new SchemaConversionError(
        structDef.type || structDef.id || 'Unknown',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get resource types from a package
   */
  getResourceTypes(pkg: FhirPackage): string[] {
    return pkg.structureDefinitions
      .filter(sd => sd.type && sd.kind === 'resource')
      .map(sd => sd.type)
      .filter((type): type is string => Boolean(type));
  }

  /**
   * Get structure definitions from a package
   */
  getStructureDefinitions(pkg: FhirPackage): StructureDefinition[] {
    return pkg.structureDefinitions;
  }

  /**
   * Get operation definitions from a package
   */
  getOperationDefinitions(pkg: FhirPackage): any[] {
    return pkg.resources.filter(
      (resource: Resource) => resource.resourceType === 'OperationDefinition'
    );
  }

  /**
   * Get search parameters from a package
   */
  getSearchParameters(pkg: FhirPackage): SearchParameter[] {
    return pkg.searchParameters;
  }

  /**
   * Get loaded packages
   */
  getLoadedPackages(): FhirPackage[] {
    return Array.from(this.loadedPackages.values());
  }

  /**
   * Get package by name
   */
  getPackage(packageName: string): FhirPackage | undefined {
    return this.loadedPackages.get(packageName);
  }

  /**
   * Check if package is loaded
   */
  isPackageLoaded(packageName: string): boolean {
    return this.loadedPackages.has(packageName);
  }

  /**
   * Get loading diagnostics
   */
  getDiagnostics(): PackageLoadDiagnostic[] {
    return [...this.diagnostics];
  }

  /**
   * Clear diagnostic history
   */
  clearDiagnostics(): void {
    this.diagnostics = [];
  }

  /**
   * Clear package cache
   */
  async clearCache(): Promise<void> {
    this.loadedPackages.clear();
    this.clearDiagnostics();
    this.packageNames.clear();

    // Dispose of canonical manager
    if (this.canonicalManager) {
      await this.canonicalManager.destroy();
      this.canonicalManager = null;
    }
  }

  /**
   * Resolve a canonical URL using the canonical manager
   */
  async resolveCanonical(canonicalUrl: string, options?: {
    package?: string;
    version?: string;
  }): Promise<Resource> {
    await this.ensureCanonicalManager();
    if (!this.canonicalManager) {
      throw new Error('Failed to initialize canonical manager.');
    }
    return this.canonicalManager.resolve(canonicalUrl, options);
  }

  /**
   * Search for resources in loaded packages
   */
  async searchResources(params: {
    resourceType?: string;
    url?: string;
    version?: string;
    package?: string;
  }): Promise<Resource[]> {
    await this.ensureCanonicalManager();
    if (!this.canonicalManager) {
      throw new Error('Failed to initialize canonical manager.');
    }

    const packageFilter = params.package ?
      this.loadedPackages.get(params.package)?.id :
      undefined;

    return this.canonicalManager.search({
      type: params.resourceType,
      url: params.url,
      version: params.version,
      package: packageFilter
    });
  }
}