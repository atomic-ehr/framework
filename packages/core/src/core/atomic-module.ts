import type { PackageDefinition, ResourceDefinition, OperationDefinition, HookDefinition, MiddlewareDefinition } from '../types/index.js';
import { FilesystemLoader } from './filesystem-loader.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Auto-load configuration for modules
 */
export interface ModuleAutoloadConfig {
  enabled?: boolean;
  paths?: {
    resources?: string;
    operations?: string;
    hooks?: string;
    middleware?: string;
  };
}

/**
 * Configuration for an Atomic Module
 */
export interface AtomicModuleConfig {
  name: string;
  version: string;
  description?: string;
  packages?: PackageDefinition[];
  autoload?: boolean | ModuleAutoloadConfig;
  basePath?: string;
  moduleUrl?: string; // URL of the module for auto-detecting base path
  init?: (module: AtomicModule) => void | Promise<void>;
}

/**
 * AtomicModule interface for encapsulating FHIR functionality
 */
export interface AtomicModule {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly packages?: PackageDefinition[];
  readonly resources?: Map<string, ResourceDefinition>;
  readonly operations?: OperationDefinition[];
  readonly hooks?: HookDefinition[];
  readonly middleware?: MiddlewareDefinition[];
}

/**
 * Base implementation of AtomicModule with auto-discovery support
 */
export class BaseAtomicModule implements AtomicModule {
  public readonly name: string;
  public readonly version: string;
  public readonly description?: string;
  public readonly packages?: PackageDefinition[];
  public readonly resources: Map<string, ResourceDefinition> = new Map();
  public readonly operations: OperationDefinition[] = [];
  public readonly hooks: HookDefinition[] = [];
  public readonly middleware: MiddlewareDefinition[] = [];
  
  protected config: AtomicModuleConfig;
  protected loader?: FilesystemLoader;

  constructor(config: AtomicModuleConfig) {
    // Auto-detect module directory if moduleUrl is provided (e.g., import.meta.url)
    if (config.moduleUrl && !config.basePath) {
      config.basePath = dirname(fileURLToPath(config.moduleUrl));
    }
    
    this.config = config;
    this.name = config.name;
    this.version = config.version;
    this.description = config.description;
    this.packages = config.packages;
  }

  /**
   * Initialize the module and perform auto-discovery if enabled
   */
  async initialize(): Promise<void> {
    // Determine if autoload is enabled
    const autoloadConfig = this.normalizeAutoloadConfig(this.config.autoload);
    
    if (autoloadConfig.enabled) {
      await this.autoloadComponents(autoloadConfig);
    }

    // Call custom init if provided
    if (this.config.init) {
      await this.config.init(this);
    }
  }

  /**
   * Normalize autoload configuration
   * Default: enabled with standard paths
   */
  private normalizeAutoloadConfig(autoload?: boolean | ModuleAutoloadConfig): Required<ModuleAutoloadConfig> {
    // Default paths for module component discovery
    const defaultPaths = {
      resources: 'resources',
      operations: 'operations',
      hooks: 'hooks',
      middleware: 'middleware'
    };
    
    // If explicitly disabled
    if (autoload === false) {
      return { enabled: false, paths: defaultPaths };
    }
    
    // If object configuration provided
    if (typeof autoload === 'object') {
      return {
        enabled: autoload.enabled !== false,
        paths: { ...defaultPaths, ...autoload.paths }
      };
    }
    
    // Default: enabled with default paths
    return { enabled: true, paths: defaultPaths };
  }

  /**
   * Auto-discover and load components from filesystem
   */
  private async autoloadComponents(config: Required<ModuleAutoloadConfig>): Promise<void> {
    if (!config.enabled) return;

    // Use provided basePath or fail gracefully
    const basePath = this.config.basePath;
    
    if (!basePath) {
      // Only warn if autoload was explicitly requested
      if (this.config.autoload === true || (typeof this.config.autoload === 'object' && this.config.autoload.enabled)) {
        console.warn(`⚠️  Cannot determine base path for module ${this.name}. Pass moduleUrl: import.meta.url to enable auto-discovery.`);
      }
      return;
    }

    console.log(`🔍 Auto-discovering components for module ${this.name}...`);
    
    this.loader = new FilesystemLoader(basePath, config.paths);
    
    try {
      // Load all components in parallel
      const [resources, operations, hooks, middleware] = await Promise.all([
        this.loader.loadResources(),
        this.loader.loadOperations(),
        this.loader.loadHooks(),
        this.loader.loadMiddleware()
      ]);

      // Store discovered components
      for (const [resourceType, definition] of resources) {
        this.resources.set(resourceType, definition);
      }
      
      this.operations.push(...operations);
      this.hooks.push(...hooks);
      this.middleware.push(...middleware);

      // Only log if components were found
      const totalComponents = resources.size + operations.length + hooks.length + middleware.length;
      if (totalComponents > 0) {
        console.log(`✅ Module ${this.name} discovery complete:`);
        if (resources.size > 0) console.log(`   Resources: ${resources.size}`);
        if (operations.length > 0) console.log(`   Operations: ${operations.length}`);
        if (hooks.length > 0) console.log(`   Hooks: ${hooks.length}`);
        if (middleware.length > 0) console.log(`   Middleware: ${middleware.length}`);
      }
    } catch (error) {
      console.error(`❌ Error during auto-discovery for module ${this.name}:`, error);
    }
  }


  /**
   * Register a resource definition
   */
  registerResource(resourceType: string, definition: ResourceDefinition): void {
    this.resources.set(resourceType, definition);
  }

  /**
   * Register an operation definition
   */
  registerOperation(operation: OperationDefinition): void {
    this.operations.push(operation);
  }

  /**
   * Register a hook definition
   */
  registerHook(hook: HookDefinition): void {
    this.hooks.push(hook);
  }

  /**
   * Register middleware
   */
  registerMiddleware(mw: MiddlewareDefinition): void {
    this.middleware.push(mw);
  }
}

