import { readdir } from 'fs/promises';
import { join, basename } from 'path';

export class FilesystemLoader {
  constructor(basePath) {
    this.basePath = basePath;
  }

  async loadResources(dirPath = 'resources') {
    const resources = new Map();
    const fullPath = join(this.basePath, dirPath);
    
    try {
      const files = await this.getJsFiles(fullPath);
      
      for (const file of files) {
        try {
          const module = await import(file);
          const resource = module.default;
          
          if (resource && resource.resourceType) {
            const resourceType = resource.resourceType || basename(file, '.js');
            resources.set(resourceType, resource);
            console.log(`📦 Loaded resource: ${resourceType}`);
          }
        } catch (error) {
          console.error(`Failed to load resource from ${file}:`, error.message);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading resources:`, error.message);
      }
    }
    
    return resources;
  }

  async loadOperations(dirPath = 'operations') {
    const operations = [];
    const fullPath = join(this.basePath, dirPath);
    
    try {
      const files = await this.getJsFiles(fullPath);
      
      for (const file of files) {
        try {
          const module = await import(file);
          const operation = module.default;
          
          if (operation && operation.name) {
            operations.push(operation);
            console.log(`⚙️  Loaded operation: $${operation.name}`);
          }
        } catch (error) {
          console.error(`Failed to load operation from ${file}:`, error.message);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading operations:`, error.message);
      }
    }
    
    return operations;
  }

  async loadMiddleware(dirPath = 'middleware') {
    const middleware = [];
    const fullPath = join(this.basePath, dirPath);
    
    try {
      const files = await this.getJsFiles(fullPath);
      
      for (const file of files) {
        try {
          const module = await import(file);
          const mw = module.default;
          
          if (mw && (mw.before || mw.after)) {
            middleware.push(mw);
            console.log(`🔗 Loaded middleware: ${mw.name || basename(file, '.js')}`);
          }
        } catch (error) {
          console.error(`Failed to load middleware from ${file}:`, error.message);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading middleware:`, error.message);
      }
    }
    
    return middleware;
  }

  async loadImplementationGuides(dirPath = 'implementation-guides') {
    const igs = [];
    const fullPath = join(this.basePath, dirPath);
    
    try {
      const dirs = await readdir(fullPath, { withFileTypes: true });
      
      for (const dir of dirs.filter(d => d.isDirectory())) {
        const igPath = join(fullPath, dir.name, 'index.js');
        
        try {
          const module = await import(igPath);
          const ig = module.default;
          
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
        } catch (error) {
          if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            console.error(`Failed to load IG from ${dir.name}:`, error.message);
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error loading implementation guides:`, error.message);
      }
    }
    
    return igs;
  }

  async getJsFiles(dirPath) {
    const files = [];
    
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively load from subdirectories
          const subFiles = await this.getJsFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    return files;
  }

  async loadAll() {
    console.log('🔍 Auto-discovering FHIR components...\n');
    
    const [resources, operations, middleware, implementationGuides] = await Promise.all([
      this.loadResources(),
      this.loadOperations(),
      this.loadMiddleware(),
      this.loadImplementationGuides()
    ]);
    
    console.log('\n✅ Discovery complete!');
    console.log(`   Resources: ${resources.size}`);
    console.log(`   Operations: ${operations.length}`);
    console.log(`   Middleware: ${middleware.length}`);
    console.log(`   Implementation Guides: ${implementationGuides.length}\n`);
    
    return {
      resources,
      operations,
      middleware,
      implementationGuides
    };
  }
}