import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import type { ResourceDefinition, OperationDefinition, HookDefinition, MiddlewareDefinition } from '../types/index.js';

interface LoaderPaths {
  resources?: string;
  operations?: string;
  middleware?: string;
  hooks?: string;
  implementationGuides?: string;
}

interface ImplementationGuide {
  id: string;
  resources?: Map<string, ResourceDefinition>;
  operations?: OperationDefinition[];
  middleware?: MiddlewareDefinition[];
}

interface LoadAllResult {
  resources: Map<string, ResourceDefinition>;
  operations: OperationDefinition[];
  middleware: MiddlewareDefinition[];
  hooks: HookDefinition[];
  implementationGuides: ImplementationGuide[];
}

export class FilesystemLoader {
  private basePath: string;
  private paths: Required<LoaderPaths>;

  constructor(basePath: string, paths: LoaderPaths = {}) {
    this.basePath = basePath;
    this.paths = {
      resources: 'resources',
      operations: 'operations',
      middleware: 'middleware',
      hooks: 'hooks',
      implementationGuides: 'implementation-guides',
      ...paths
    };
  }

  async loadResources(dirPath?: string): Promise<Map<string, ResourceDefinition>> {
    const resources = new Map<string, ResourceDefinition>();
    const fullPath = join(this.basePath, dirPath || this.paths.resources);
    
    try {
      const files = await this.getJsFiles(fullPath);
      
      for (const file of files) {
        try {
          const module = await import(file);
          const resource: ResourceDefinition = module.default;
          
          if (resource && resource.resourceType) {
            const resourceType = resource.resourceType || basename(file, '.js');
            resources.set(resourceType, resource);
            console.log(`📦 Loaded resource: ${resourceType}`);
          }
        } catch (error) {
          console.error(`Failed to load resource from ${file}:`, (error as Error).message);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading resources:`, error.message);
      }
    }
    
    return resources;
  }

  async loadOperations(dirPath?: string): Promise<OperationDefinition[]> {
    const operations: OperationDefinition[] = [];
    const fullPath = join(this.basePath, dirPath || this.paths.operations);
    
    try {
      const files = await this.getJsFiles(fullPath);
      
      for (const file of files) {
        try {
          const module = await import(file);
          const operation: OperationDefinition = module.default;
          
          if (operation && operation.name) {
            operations.push(operation);
            console.log(`⚙️  Loaded operation: $${operation.name}`);
          }
        } catch (error) {
          console.error(`Failed to load operation from ${file}:`, (error as Error).message);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading operations:`, error.message);
      }
    }
    
    return operations;
  }

  async loadMiddleware(dirPath?: string): Promise<MiddlewareDefinition[]> {
    const middleware: MiddlewareDefinition[] = [];
    const fullPath = join(this.basePath, dirPath || this.paths.middleware);
    
    try {
      const files = await this.getJsFiles(fullPath);
      
      for (const file of files) {
        try {
          const module = await import(file);
          const mw: MiddlewareDefinition = module.default;
          
          if (mw && (mw.before || mw.after)) {
            middleware.push(mw);
            console.log(`🔗 Loaded middleware: ${mw.name || basename(file, '.js')}`);
          }
        } catch (error) {
          console.error(`Failed to load middleware from ${file}:`, (error as Error).message);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading middleware:`, error.message);
      }
    }
    
    return middleware;
  }

  async loadHooks(dirPath?: string): Promise<HookDefinition[]> {
    const hooks: HookDefinition[] = [];
    const fullPath = join(this.basePath, dirPath || this.paths.hooks);
    
    try {
      const files = await this.getJsFiles(fullPath);
      
      for (const file of files) {
        try {
          const module = await import(file);
          const hook: HookDefinition | HookDefinition[] = module.default;
          
          if (hook) {
            // Support both single hook and array of hooks
            if (Array.isArray(hook)) {
              hooks.push(...hook);
            } else {
              hooks.push(hook);
            }
            const hookName = Array.isArray(hook) ? `${hook.length} hooks` : hook.name || 'unnamed';
            console.log(`🪝 Loaded hook: ${hookName}`);
          }
        } catch (error) {
          console.error(`Failed to load hook from ${file}:`, (error as Error).message);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading hooks:`, error.message);
      }
    }
    
    return hooks;
  }

  async loadImplementationGuides(dirPath?: string): Promise<ImplementationGuide[]> {
    const igs: ImplementationGuide[] = [];
    const fullPath = join(this.basePath, dirPath || this.paths.implementationGuides);
    
    try {
      const dirs = await readdir(fullPath, { withFileTypes: true });
      
      for (const dir of dirs.filter(d => d.isDirectory())) {
        const igPath = join(fullPath, dir.name, 'index.js');
        
        try {
          const module = await import(igPath);
          const ig: ImplementationGuide = module.default;
          
          if (ig && ig.id) {
            igs.push(ig);
            console.log(`📚 Loaded Implementation Guide: ${ig.id}`);
            
            // Load IG-specific resources, operations, etc.
            const igBasePath = join(fullPath, dir.name);
            
            const igResources = await this.loadResources(join(igBasePath, 'resources'));
            const igOperations = await this.loadOperations(join(igBasePath, 'operations'));
            const igMiddleware = await this.loadMiddleware(join(igBasePath, 'middleware'));
            
            ig.resources = igResources;
            ig.operations = igOperations;
            ig.middleware = igMiddleware;
          }
        } catch (error: any) {
          if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            console.error(`Failed to load IG from ${dir.name}:`, error.message);
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading implementation guides:`, error.message);
      }
    }
    
    return igs;
  }

  async getJsFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively load from subdirectories
          const subFiles = await this.getJsFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
          files.push(fullPath);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    return files;
  }

  async loadAll(): Promise<LoadAllResult> {
    console.log('🔍 Auto-discovering FHIR components...\n');
    
    const [resources, operations, middleware, hooks, implementationGuides] = await Promise.all([
      this.loadResources(),
      this.loadOperations(),
      this.loadMiddleware(),
      this.loadHooks(),
      this.loadImplementationGuides()
    ]);
    
    console.log('\n✅ Discovery complete!');
    console.log(`   Resources: ${resources.size}`);
    console.log(`   Operations: ${operations.length}`);
    console.log(`   Middleware: ${middleware.length}`);
    console.log(`   Hooks: ${hooks.length}`);
    console.log(`   Implementation Guides: ${implementationGuides.length}\n`);
    
    return {
      resources,
      operations,
      middleware,
      hooks,
      implementationGuides
    };
  }
}