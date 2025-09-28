/**
 * Package integration hooks for FhirServer
 */

import { PackageLoader, createPackageLoader } from '@atomic-ehr/packages';
import { createFhirBridge } from '@atomic-ehr/fhir-bridge';
import type {
  PackageLoaderConfig,
  LoadedPackage,
  PackageLoadStats,
  ResourceDiscovery
} from '@atomic-ehr/packages';
import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import type { HookDefinition } from '@atomic-ehr/core';

/**
 * Configuration for package integration
 */
export interface PackageIntegrationConfig {
  /** Packages to load automatically */
  packages?: string[];

  /** Package loader configuration */
  packageConfig?: {
    cacheDir?: string;
    registryUrls?: string[];
    timeout?: number;
    workingDir?: string;
    registry?: string;
  };

  /** Auto-load base FHIR resources */
  autoLoadBaseResources?: boolean;

  /** Enable package loading progress logging */
  enableProgressLogging?: boolean;

  /** Fail server start if package loading fails */
  failOnPackageLoadError?: boolean;
}

/**
 * Package integration manager for FhirServer
 */
export class PackageIntegration {
  private packageLoader: PackageLoader;
  private config: PackageIntegrationConfig;
  private isInitialized = false;

  constructor(config: PackageIntegrationConfig = {}) {
    this.config = {
      packages: [],
      autoLoadBaseResources: true,
      enableProgressLogging: true,
      failOnPackageLoadError: false,
      ...config
    };

    // Create package loader
    const loaderConfig: PackageLoaderConfig = {
      packages: this.config.packages || [],
      autoLoadBaseResources: this.config.autoLoadBaseResources,
      bridgeConfig: this.config.packageConfig
    };

    this.packageLoader = createPackageLoader(loaderConfig);

    // Set up event listeners for progress logging
    if (this.config.enableProgressLogging) {
      this.setupProgressLogging();
    }
  }

  /**
   * Initialize package integration
   */
  async init(): Promise<void> {
    await this.packageLoader.init();
    this.isInitialized = true;
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    await this.packageLoader.dispose();
    this.isInitialized = false;
  }

  /**
   * Get package loader instance
   */
  getPackageLoader(): PackageLoader {
    return this.packageLoader;
  }

  /**
   * Get loaded packages
   */
  getLoadedPackages(): LoadedPackage[] {
    return this.packageLoader.getLoadedPackages();
  }

  /**
   * Get all schemas
   */
  getSchemas(): Map<string, FHIRSchema> {
    return this.packageLoader.getSchemas();
  }

  /**
   * Get supported resource types
   */
  getSupportedResourceTypes(): string[] {
    return this.packageLoader.getAllResourceTypes();
  }

  /**
   * Get loading statistics
   */
  getStats(): PackageLoadStats {
    return this.packageLoader.generateStats();
  }

  /**
   * Discover available resources
   */
  discoverResources(): ResourceDiscovery {
    return this.packageLoader.discoverResources();
  }

  /**
   * Create bootstrap hook for package loading
   */
  createBootstrapHook(): HookDefinition {
    return {
      name: 'package-loader-bootstrap',
      phase: 'onBootstrap',
      priority: 90, // High priority to load early
      handler: async (context: any) => {
        if (!this.isInitialized) {
          context.logger?.warn('Package integration not initialized');
          return;
        }

        const packagesToLoad = this.config.packages;
        if (!packagesToLoad || packagesToLoad.length === 0) {
          context.logger?.info('No packages configured for loading');
          return;
        }

        context.logger?.info('Loading FHIR packages...', {
          packages: packagesToLoad,
          count: packagesToLoad.length
        });

        try {
          const startTime = Date.now();
          const loadedPackages = await this.packageLoader.loadFromConfig({
            packages: packagesToLoad
          });

          const loadTime = Date.now() - startTime;
          const stats = this.packageLoader.generateStats();

          context.logger?.info('FHIR packages loaded successfully', {
            packageCount: loadedPackages.length,
            resourceTypes: stats.totalResourceTypes,
            schemas: stats.totalSchemas,
            loadTime: `${loadTime}ms`,
            packages: loadedPackages.map(p => `${p.name}@${p.version}`)
          });

          // Store package info in context for other hooks
          context.packageStats = stats;
          context.loadedPackages = loadedPackages;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          context.logger?.error('Failed to load FHIR packages', {
            error: errorMessage,
            packages: packagesToLoad
          });

          if (this.config.failOnPackageLoadError) {
            throw error;
          } else {
            context.logger?.warn('Continuing without packages due to load error');
          }
        }
      }
    };
  }

  /**
   * Create context enhancement hook
   */
  createContextHook(): HookDefinition {
    return {
      name: 'package-context-enhancement',
      phase: 'preRequest',
      priority: 80, // High priority to set context early
      handler: async (context: any) => {
        // Add package-related context
        context.schemas = this.packageLoader.getSchemas();
        context.packageLoader = this.packageLoader;

        // Add convenience methods to context
        context.getSchema = (resourceType: string) => {
          return this.packageLoader.getSchema(resourceType);
        };

        context.isResourceTypeSupported = (resourceType: string) => {
          return this.packageLoader.isResourceTypeSupported(resourceType);
        };

        context.getSupportedOperations = (resourceType: string) => {
          return this.packageLoader.getSupportedOperations(resourceType);
        };

        context.getSearchParameters = (resourceType: string) => {
          return this.packageLoader.getSearchParameters(resourceType);
        };
      }
    };
  }

  /**
   * Create validation hook that uses loaded schemas
   */
  createValidationHook(): HookDefinition {
    return {
      name: 'package-schema-validation',
      phase: 'preValidation',
      priority: 100,
      handler: async (context: any) => {
        const { resourceType, body } = context;

        if (!resourceType || !body) {
          return;
        }

        // Check if resource type is supported
        if (!this.packageLoader.isResourceTypeSupported(resourceType)) {
          context.logger?.warn(`Unsupported resource type: ${resourceType}`, {
            supportedTypes: this.packageLoader.getAllResourceTypes().slice(0, 10) // Limit for logging
          });
          return;
        }

        // Get schema for validation
        const schema = this.packageLoader.getSchema(resourceType);
        if (schema) {
          context.schema = schema;
          context.logger?.debug(`Schema loaded for validation: ${resourceType}`);
        }
      }
    };
  }

  /**
   * Get all integration hooks
   */
  getHooks(): HookDefinition[] {
    return [
      this.createBootstrapHook(),
      this.createContextHook(),
      this.createValidationHook()
    ];
  }

  /**
   * Setup progress logging for package loading
   */
  private setupProgressLogging(): void {
    this.packageLoader.addEventListener((event) => {
      switch (event.type) {
        case 'loadStart':
          console.log(`📦 Loading package: ${event.packageName}`);
          break;

        case 'loadComplete':
          console.log(`✅ Package loaded: ${event.packageName} (${event.loadTime}ms)`);
          break;

        case 'loadError':
          console.log(`❌ Package failed: ${event.packageName} - ${event.error}`);
          break;

        case 'allComplete':
          console.log(`🎉 All packages loaded successfully:`, {
            packages: event.stats.totalPackages,
            resourceTypes: event.stats.totalResourceTypes,
            schemas: event.stats.totalSchemas,
            totalTime: `${event.stats.totalLoadTime}ms`
          });
          break;

        case 'allError':
          console.log(`💥 Package loading completed with errors:`, event.errors);
          break;
      }
    });
  }
}

/**
 * Create package integration instance
 */
export function createPackageIntegration(config?: PackageIntegrationConfig): PackageIntegration {
  return new PackageIntegration(config);
}