import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { HandlerContext, ResourceDefinition, OperationDefinition, HookDefinition, MiddlewareDefinition } from "../types/index.js";
import type { SeedProvider, SeedBundle } from "./seeding-manager.js";

export interface EmbeddedPackageDefinition {
  name: string;
  version: string;
  description?: string;
  canonical?: string;
  dependencies?: string[];
  fhirVersions?: string[];
  
  // Package paths
  packagePath?: string;
  structureDefinitions?: string;
  searchParameters?: string;
  resources?: string;
  operations?: string;
  hooks?: string;
  middleware?: string;
  seeds?: string;
  
  // Optional seed provider instance
  seedProvider?: SeedProvider;
  
  // Lifecycle hooks
  configure?: (context: HandlerContext) => Promise<void> | void;
}

export interface EmbeddedPackage extends EmbeddedPackageDefinition {
  absolutePath: string;
  loadedResources: Map<string, ResourceDefinition>;
  loadedOperations: Map<string, OperationDefinition>;
  loadedHooks: HookDefinition[];
  loadedMiddleware: MiddlewareDefinition[];
  loadedSearchParameters: any[];
  seedProvider?: SeedProvider;
}

export class EmbeddedPackageManager {
  private packages: Map<string, EmbeddedPackage> = new Map();
  private loadedPackages: Set<string> = new Set();

  async registerPackage(definition: EmbeddedPackageDefinition, basePath?: string): Promise<void> {
    const packagePath = basePath || definition.packagePath;
    if (!packagePath) {
      throw new Error(`Package path required for ${definition.name}`);
    }

    const absolutePath = this.resolvePackagePath(packagePath);
    
    console.log(`[EmbeddedPackages] Registering package: ${definition.name}@${definition.version} at ${absolutePath}`);

    if (!existsSync(absolutePath)) {
      throw new Error(`Package path does not exist: ${absolutePath}`);
    }

    // Check for IG dependencies and load them through canonical manager
    await this.loadIGDependencies(absolutePath, definition);

    const embeddedPackage: EmbeddedPackage = {
      ...definition,
      absolutePath,
      loadedResources: new Map(),
      loadedOperations: new Map(),
      loadedHooks: [],
      loadedMiddleware: [],
      loadedSearchParameters: [],
    };

    // Load package components
    await this.loadPackageComponents(embeddedPackage);

    this.packages.set(definition.name, embeddedPackage);
  }

  async loadAllPackages(context: HandlerContext): Promise<void> {
    console.log(`[EmbeddedPackages] Loading ${this.packages.size} embedded packages...`);

    // Sort packages by dependencies
    const sortedPackages = this.topologicalSort();

    for (const packageName of sortedPackages) {
      const pkg = this.packages.get(packageName);
      if (!pkg) continue;

      if (this.loadedPackages.has(packageName)) {
        console.log(`[EmbeddedPackages] Package already loaded: ${packageName}`);
        continue;
      }

      try {
        await this.loadPackage(pkg, context);
        this.loadedPackages.add(packageName);
      } catch (error) {
        console.error(`[EmbeddedPackages] Failed to load package ${packageName}:`, error);
        throw error;
      }
    }
  }

  private async loadPackageComponents(pkg: EmbeddedPackage): Promise<void> {
    const basePath = pkg.absolutePath;

    // Load StructureDefinitions (FHIR profiles)
    if (pkg.structureDefinitions) {
      const structDefPath = join(basePath, pkg.structureDefinitions);
      if (existsSync(structDefPath)) {
        await this.loadStructureDefinitions(structDefPath, pkg);
      }
    }

    // Load SearchParameters
    if (pkg.searchParameters) {
      const searchParamPath = join(basePath, pkg.searchParameters);
      if (existsSync(searchParamPath)) {
        await this.loadSearchParameters(searchParamPath, pkg);
      }
    }

    // Load Resources (Atomic resource definitions)
    if (pkg.resources) {
      const resourcesPath = join(basePath, pkg.resources);
      if (existsSync(resourcesPath)) {
        await this.loadResources(resourcesPath, pkg);
      }
    }

    // Load Operations
    if (pkg.operations) {
      const operationsPath = join(basePath, pkg.operations);
      if (existsSync(operationsPath)) {
        await this.loadOperations(operationsPath, pkg);
      }
    }

    // Load Hooks
    if (pkg.hooks) {
      const hooksPath = join(basePath, pkg.hooks);
      if (existsSync(hooksPath)) {
        await this.loadHooks(hooksPath, pkg);
      }
    }

    // Load Middleware
    if (pkg.middleware) {
      const middlewarePath = join(basePath, pkg.middleware);
      if (existsSync(middlewarePath)) {
        await this.loadMiddleware(middlewarePath, pkg);
      }
    }

    // Setup seed provider
    if (pkg.seeds) {
      const seedsPath = join(basePath, pkg.seeds);
      if (existsSync(seedsPath)) {
        pkg.seedProvider = await this.createSeedProvider(seedsPath, pkg);
      }
    }
  }

  private async loadStructureDefinitions(path: string, pkg: EmbeddedPackage): Promise<void> {
    try {
      const files = readdirSync(path).filter(file => file.endsWith('.json'));
      
      for (const file of files) {
        try {
          const filePath = join(path, file);
          const content = readFileSync(filePath, 'utf8');
          const structDef = JSON.parse(content);
          
          if (structDef.resourceType === 'StructureDefinition') {
            console.log(`[EmbeddedPackages] Loaded StructureDefinition: ${structDef.id} from ${pkg.name}`);
          }
        } catch (error) {
          console.warn(`[EmbeddedPackages] Failed to load StructureDefinition from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load StructureDefinitions from ${path}:`, error);
    }
  }

  private async loadSearchParameters(path: string, pkg: EmbeddedPackage): Promise<void> {
    try {
      if (statSync(path).isFile()) {
        // Single file with search parameters
        const content = readFileSync(path, 'utf8');
        const searchParams = JSON.parse(content);
        
        if (Array.isArray(searchParams)) {
          pkg.searchParameters = searchParams;
        }
      } else {
        // Directory with individual search parameter files
        const files = readdirSync(path).filter(file => file.endsWith('.json'));
        
        for (const file of files) {
          try {
            const filePath = join(path, file);
            const content = readFileSync(filePath, 'utf8');
            const searchParam = JSON.parse(content);
            
            if (searchParam.resourceType === 'SearchParameter') {
              pkg.loadedSearchParameters.push(searchParam);
            }
          } catch (error) {
            console.warn(`[EmbeddedPackages] Failed to load SearchParameter from ${file}:`, error);
          }
        }
      }

      console.log(`[EmbeddedPackages] Loaded ${pkg.loadedSearchParameters.length} search parameters from ${pkg.name}`);
    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load search parameters from ${path}:`, error);
    }
  }

  private async loadResources(path: string, pkg: EmbeddedPackage): Promise<void> {
    try {
      const files = readdirSync(path).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
      
      for (const file of files) {
        try {
          const filePath = join(path, file);
          const module = await import(`file://${filePath}`);
          const resourceDef = module.default || module;
          
          if (resourceDef && typeof resourceDef === 'object' && resourceDef.resourceType) {
            pkg.loadedResources.set(resourceDef.resourceType, resourceDef);
            console.log(`[EmbeddedPackages] Loaded resource: ${resourceDef.resourceType} from ${pkg.name}`);
          }
        } catch (error) {
          console.warn(`[EmbeddedPackages] Failed to load resource from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load resources from ${path}:`, error);
    }
  }

  private async loadOperations(path: string, pkg: EmbeddedPackage): Promise<void> {
    try {
      const files = readdirSync(path).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
      
      for (const file of files) {
        try {
          const filePath = join(path, file);
          const module = await import(`file://${filePath}`);
          const operationDef = module.default || module;
          
          if (operationDef && typeof operationDef === 'object' && operationDef.name) {
            pkg.loadedOperations.set(operationDef.name, operationDef);
            console.log(`[EmbeddedPackages] Loaded operation: ${operationDef.name} from ${pkg.name}`);
          }
        } catch (error) {
          console.warn(`[EmbeddedPackages] Failed to load operation from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load operations from ${path}:`, error);
    }
  }

  private async loadHooks(path: string, pkg: EmbeddedPackage): Promise<void> {
    try {
      const files = readdirSync(path).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
      
      for (const file of files) {
        try {
          const filePath = join(path, file);
          const module = await import(`file://${filePath}`);
          const hookDef = module.default || module;
          
          if (hookDef && typeof hookDef === 'object' && hookDef.name && hookDef.type) {
            pkg.loadedHooks.push(hookDef);
            console.log(`[EmbeddedPackages] Loaded hook: ${hookDef.name} from ${pkg.name}`);
          }
        } catch (error) {
          console.warn(`[EmbeddedPackages] Failed to load hook from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load hooks from ${path}:`, error);
    }
  }

  private async loadMiddleware(path: string, pkg: EmbeddedPackage): Promise<void> {
    try {
      const files = readdirSync(path).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
      
      for (const file of files) {
        try {
          const filePath = join(path, file);
          const module = await import(`file://${filePath}`);
          const middlewareDef = module.default || module;
          
          if (middlewareDef && typeof middlewareDef === 'object') {
            pkg.loadedMiddleware.push(middlewareDef);
            console.log(`[EmbeddedPackages] Loaded middleware: ${middlewareDef.name || file} from ${pkg.name}`);
          }
        } catch (error) {
          console.warn(`[EmbeddedPackages] Failed to load middleware from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load middleware from ${path}:`, error);
    }
  }

  private async createSeedProvider(path: string, pkg: EmbeddedPackage): Promise<SeedProvider> {
    return {
      name: pkg.name,
      version: pkg.version,
      
      async getSeedBundles(): Promise<SeedBundle[]> {
        const bundles: SeedBundle[] = [];
        
        try {
          if (statSync(path).isFile() && path.endsWith('.json')) {
            // Single bundle file
            const content = readFileSync(path, 'utf8');
            const bundle = JSON.parse(content);
            
            if (bundle.resourceType === 'Bundle') {
              bundles.push(bundle);
            }
          } else {
            // Directory with bundle files
            const files = readdirSync(path).filter(file => file.endsWith('.json'));
            
            for (const file of files) {
              try {
                const filePath = join(path, file);
                const content = readFileSync(filePath, 'utf8');
                const bundle = JSON.parse(content);
                
                if (bundle.resourceType === 'Bundle') {
                  bundles.push(bundle);
                }
              } catch (error) {
                console.warn(`[EmbeddedPackages] Failed to load seed bundle from ${file}:`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`[EmbeddedPackages] Failed to load seed bundles from ${path}:`, error);
        }
        
        return bundles;
      },
      
      // Can be overridden by packages for custom preprocessing
      async preprocessResource(resource: any): Promise<any> {
        return resource;
      },
      
      // Can be overridden by packages for custom validation
      async validateResource(resource: any): Promise<void> {
        if (!resource.resourceType) {
          throw new Error('Resource missing resourceType');
        }
        if (!resource.id) {
          throw new Error('Resource missing id');
        }
      }
    };
  }

  private async loadPackage(pkg: EmbeddedPackage, context: HandlerContext): Promise<void> {
    console.log(`[EmbeddedPackages] Loading package: ${pkg.name}@${pkg.version}`);

    // Register resources
    for (const [name, resource] of pkg.resources) {
      try {
        context.resources?.register(resource);
      } catch (error) {
        console.warn(`[EmbeddedPackages] Failed to register resource ${name}:`, error);
      }
    }

    // Register operations
    for (const [name, operation] of pkg.loadedOperations) {
      try {
        context.operations?.register(operation);
      } catch (error) {
        console.warn(`[EmbeddedPackages] Failed to register operation ${name}:`, error);
      }
    }

    // Register hooks
    for (const hook of pkg.loadedHooks) {
      try {
        context.hooks?.register(hook);
      } catch (error) {
        console.warn(`[EmbeddedPackages] Failed to register hook ${hook.name}:`, error);
      }
    }

    // Register middleware
    for (const middleware of pkg.loadedMiddleware) {
      try {
        context.middleware?.register(middleware);
      } catch (error) {
        console.warn(`[EmbeddedPackages] Failed to register middleware ${middleware.name}:`, error);
      }
    }

    // Register search parameters
    for (const searchParam of pkg.loadedSearchParameters) {
      try {
        context.storage?.registerSearchParameter?.(searchParam);
      } catch (error) {
        console.warn(`[EmbeddedPackages] Failed to register search parameter ${searchParam.code}:`, error);
      }
    }

    // Run package configuration BEFORE registering seed provider
    // This ensures database entities (like search parameters) are created first
    if (pkg.configure) {
      await pkg.configure(context);
    }

    // Register seed provider AFTER configuration is complete
    // This ensures database entities (like search parameters) are created first
    if (pkg.seedProvider) {
      console.log(`[EmbeddedPackages] Registering seed provider for ${pkg.name} after configuration`);
      context.seedingManager?.registerProvider(pkg.seedProvider);
    }

    console.log(`[EmbeddedPackages] Loaded package: ${pkg.name} (${pkg.loadedResources.size} resources, ${pkg.loadedOperations.size} operations, ${pkg.loadedHooks.length} hooks, ${pkg.loadedMiddleware.length} middleware)`);
  }

  private topologicalSort(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (packageName: string): void => {
      if (visiting.has(packageName)) {
        throw new Error(`Circular dependency detected: ${packageName}`);
      }
      
      if (visited.has(packageName)) {
        return;
      }

      const pkg = this.packages.get(packageName);
      if (!pkg) return;

      visiting.add(packageName);

      // Visit dependencies first
      if (pkg.dependencies) {
        for (const dep of pkg.dependencies) {
          if (this.packages.has(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(packageName);
      visited.add(packageName);
      sorted.push(packageName);
    };

    // Visit all packages
    for (const packageName of this.packages.keys()) {
      if (!visited.has(packageName)) {
        visit(packageName);
      }
    }

    return sorted;
  }

  private resolvePackagePath(packagePath: string): string {
    if (packagePath.startsWith('.')) {
      // Relative path - resolve relative to the calling module
      const stack = new Error().stack;
      const callerPath = stack?.split('\n')[2]?.match(/file:\/\/([^:)]+)/)?.[1];
      
      if (callerPath) {
        return join(dirname(callerPath), packagePath);
      }
    }
    
    return packagePath;
  }

  getPackage(name: string): EmbeddedPackage | undefined {
    return this.packages.get(name);
  }

  getLoadedPackages(): string[] {
    return Array.from(this.loadedPackages);
  }

  getAllPackages(): EmbeddedPackage[] {
    return Array.from(this.packages.values());
  }

  private async loadSearchParameters(searchParamPath: string, pkg: EmbeddedPackage): Promise<void> {
    try {
      // Load search parameters from file (JSON format)
      const content = await readFile(searchParamPath, 'utf8');
      const searchParams = JSON.parse(content);
      
      // Store loaded search parameters
      if (Array.isArray(searchParams)) {
        pkg.loadedSearchParameters.push(...searchParams);
      } else {
        pkg.loadedSearchParameters.push(searchParams);
      }
      
      console.log(`[EmbeddedPackages] Loaded ${pkg.loadedSearchParameters.length} search parameters for ${pkg.name}`);
    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load search parameters from ${searchParamPath}:`, error);
    }
  }

  private async loadIGDependencies(packagePath: string, definition: EmbeddedPackageDefinition): Promise<void> {
    try {
      // Look for IG package.json file - try both src/ig and ig directories
      let packageJsonPath = join(packagePath, 'src', 'ig', 'package.json');
      
      if (!existsSync(packageJsonPath)) {
        // Try alternative path without src directory
        packageJsonPath = join(packagePath, 'ig', 'package.json');
        
        if (!existsSync(packageJsonPath)) {
          return; // No IG package.json found, skip dependency loading
        }
      }

      const packageContent = await readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageContent);
      
      // Check if there are FHIR IG dependencies
      if (!packageJson.dependencies) {
        return;
      }

      const dependencies = Object.keys(packageJson.dependencies);
      if (dependencies.length === 0) {
        return;
      }

      console.log(`[EmbeddedPackages] Found ${dependencies.length} IG dependencies for ${definition.name}:`, dependencies);

      // Note: The actual loading of dependencies should be handled by the Atomic class
      // since it has access to the PackageManager. We'll store the dependencies for now.
      if (!definition.dependencies) {
        definition.dependencies = [];
      }
      
      // Merge IG dependencies with existing dependencies
      for (const depName of dependencies) {
        if (!definition.dependencies.includes(depName)) {
          definition.dependencies.push(depName);
        }
      }

      console.log(`[EmbeddedPackages] Updated dependencies for ${definition.name}:`, definition.dependencies);

    } catch (error) {
      console.warn(`[EmbeddedPackages] Failed to load IG dependencies for ${definition.name}:`, error);
    }
  }
}