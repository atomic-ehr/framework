import { Router } from './router.js';
import { ResourceRegistry } from './resource-registry.js';
import { OperationRegistry } from './operation-registry.js';
import { MiddlewareManager } from './middleware-manager.js';
import { HooksManager } from './hooks-manager.js';
import StorageManager from '../storage/storage-manager.js';
import { Validator } from './validator.js';
import { CapabilityStatement } from './capability-statement.js';
import { FilesystemLoader } from './filesystem-loader.js';
import { PackageManager } from './package-manager.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { 
  AtomicConfig, 
  ResourceDefinition, 
  OperationDefinition, 
  HookDefinition, 
  MiddlewareDefinition,
  HandlerResponse,
  HandlerContext
} from '../types/index.js';

interface StartOptions {
  port?: number;
  basePath?: string;
  autoload?: boolean;
  packages?: boolean;
}

interface ImplementationGuide {
  id: string;
  resources?: Map<string, ResourceDefinition>;
  operations?: OperationDefinition[];
  middleware?: MiddlewareDefinition[];
  configure?: (app: Atomic) => Promise<void> | void;
}

class Atomic {
  public config: AtomicConfig;
  public router: Router;
  public resources: ResourceRegistry;
  public operations: OperationRegistry;
  public middleware: MiddlewareManager;
  public hooks: HooksManager;
  public storage: StorageManager;
  public validator: Validator;
  public capabilityStatement: CapabilityStatement;
  public packageManager: PackageManager;

  constructor(config: AtomicConfig = {}) {
    this.config = {
      server: {
        name: 'Atomic FHIR Server',
        version: '0.1.0',
        fhirVersion: '4.0.1',
        port: 3000,
        url: 'http://localhost:3000',
        ...config.server
      },
      storage: {
        adapter: 'sqlite',
        config: {
          database: ':memory:',
          ...config.storage?.config
        },
        ...config.storage
      },
      validation: {
        strict: true,
        ...config.validation
      },
      features: {
        bulkData: false,
        subscription: false,
        ...config.features
      },
      modules: config.modules,
      autoload: (() => {
        if (config.autoload === false) {
          return { enabled: false };
        }
        const autoloadConfig = {
          enabled: true,  // Default to enabled
          paths: {
            resources: 'src/resources',
            operations: 'src/operations',
            middleware: 'src/middleware',
            hooks: 'src/hooks',
            implementationGuides: 'src/implementation-guides'
          }
        };
        if (typeof config.autoload === 'object') {
          // Merge paths if provided
          if (config.autoload.paths) {
            autoloadConfig.paths = { ...autoloadConfig.paths, ...config.autoload.paths };
          }
          // Only override enabled if explicitly set
          if ('enabled' in config.autoload) {
            autoloadConfig.enabled = config.autoload.enabled!;
          }
        }
        return autoloadConfig;
      })(),
      packages: (() => {
        // Handle different package configurations
        if (config.packages === false) {
          return { enabled: false };
        }
        
        // If packages is an array, treat it as the list
        if (Array.isArray(config.packages)) {
          return {
            enabled: true,
            path: 'packages',
            list: config.packages
          };
        }
        
        // Otherwise merge with defaults
        return {
          enabled: true,
          path: 'packages',
          list: [],
          ...config.packages
        };
      })()
    };

    this.router = new Router();
    this.resources = new ResourceRegistry();
    this.operations = new OperationRegistry();
    this.middleware = new MiddlewareManager();
    this.hooks = new HooksManager();
    this.storage = new StorageManager(this.config.storage!);
    this.validator = new Validator(this.config.validation!);
    this.capabilityStatement = new CapabilityStatement(this as any);
    this.packageManager = new PackageManager(
      (this.config.packages as any)?.path || 'packages', 
      this.config.packages as any
    );
    
    this.setupCoreRoutes();
  }

  private normalizeHandlerResponse(response: HandlerResponse): HandlerResponse {
    // If body is not a string, stringify it
    if (response.body && typeof response.body !== 'string') {
      response.body = JSON.stringify(response.body);
    }
    return response;
  }

  private setupCoreRoutes(): void {
    // Metadata endpoint
    this.router.get('/metadata', async () => {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(await this.capabilityStatement.generate())
      };
    });

    // Resource type routes
    this.router.get('/:resourceType', async (req) => {
      const { resourceType } = (req as any).params;
      return await this.handleSearch(resourceType, req);
    });

    this.router.post('/:resourceType', async (req) => {
      const { resourceType } = (req as any).params;
      return await this.handleCreate(resourceType, req);
    });

    this.router.get('/:resourceType/:id', async (req) => {
      const { resourceType, id } = (req as any).params;
      return await this.handleRead(resourceType, id, req);
    });

    this.router.put('/:resourceType/:id', async (req) => {
      const { resourceType, id } = (req as any).params;
      return await this.handleUpdate(resourceType, id, req);
    });

    this.router.delete('/:resourceType/:id', async (req) => {
      const { resourceType, id } = (req as any).params;
      return await this.handleDelete(resourceType, id, req);
    });

    // Operation routes
    this.router.post('/:resourceType/$:operation', async (req) => {
      const { resourceType, operation } = (req as any).params;
      return await this.handleTypeOperation(resourceType, operation, req);
    });

    this.router.post('/:resourceType/:id/$:operation', async (req) => {
      const { resourceType, id, operation } = (req as any).params;
      return await this.handleInstanceOperation(resourceType, id, operation, req);
    });

    this.router.post('/$:operation', async (req) => {
      const { operation } = (req as any).params;
      return await this.handleSystemOperation(operation, req);
    });
  }

  private async handleCreate(resourceType: string, req: Request): Promise<HandlerResponse> {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    // Use custom handler if provided
    if (resourceDef.handlers?.create) {
      try {
        const context: HandlerContext = { 
          storage: this.storage,
          hooks: this.hooks,
          validator: this.validator,
          config: this.config
        };
        const response = await resourceDef.handlers.create(req, context);
        return this.normalizeHandlerResponse(response);
      } catch (error) {
        return {
          status: 400,
          body: JSON.stringify({ error: (error as Error).message })
        };
      }
    }

    // Default implementation
    try {
      const body = await req.json();
      
      // Validate resource
      if (this.config.validation?.strict) {
        await this.validator.validate(body, resourceType);
      }

      // Apply hooks
      let resource = await this.hooks.executeBeforeCreate(resourceType, body, {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      });

      // Store resource
      const created = await this.storage.create(resourceType, resource);

      // Apply after hooks
      await this.hooks.executeAfterCreate(resourceType, created, {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${this.config.server?.url}/${resourceType}/${created.id}`
        },
        body: JSON.stringify(created)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  private async handleRead(resourceType: string, id: string, req: Request): Promise<HandlerResponse> {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    // Use custom handler if provided
    if (resourceDef.handlers?.read) {
      try {
        const context: HandlerContext = { 
          storage: this.storage,
          hooks: this.hooks,
          validator: this.validator,
          config: this.config
        };
        const response = await resourceDef.handlers.read(id, req, context);
        return this.normalizeHandlerResponse(response);
      } catch (error) {
        return {
          status: 500,
          body: JSON.stringify({ error: (error as Error).message })
        };
      }
    }

    // Default implementation
    try {
      const resource = await this.storage.read(resourceType, id);
      if (!resource) {
        return { status: 404, body: JSON.stringify({ error: 'Resource not found' }) };
      }

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(resource)
      };
    } catch (error) {
      return {
        status: 500,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  private async handleUpdate(resourceType: string, id: string, req: Request): Promise<HandlerResponse> {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    // Use custom handler if provided
    if (resourceDef.handlers?.update) {
      try {
        const context: HandlerContext = { 
          storage: this.storage,
          hooks: this.hooks,
          validator: this.validator,
          config: this.config
        };
        const response = await resourceDef.handlers.update(id, req, context);
        return this.normalizeHandlerResponse(response);
      } catch (error) {
        return {
          status: 400,
          body: JSON.stringify({ error: (error as Error).message })
        };
      }
    }

    // Default implementation
    try {
      const body = await req.json();
      
      // Validate resource
      if (this.config.validation?.strict) {
        await this.validator.validate(body, resourceType);
      }

      // Get previous version
      const previous = await this.storage.read(resourceType, id);
      if (!previous) {
        return { status: 404, body: JSON.stringify({ error: 'Resource not found' }) };
      }

      // Apply hooks
      let resource = await this.hooks.executeBeforeUpdate(resourceType, body, previous, {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      });

      // Update resource
      const updated = await this.storage.update(resourceType, id, resource);

      // Apply after hooks
      await this.hooks.executeAfterUpdate(resourceType, updated, previous, {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      });

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(updated)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  private async handleDelete(resourceType: string, id: string, req: Request): Promise<HandlerResponse> {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    // Use custom handler if provided
    if (resourceDef.handlers?.delete) {
      try {
        const context: HandlerContext = { 
          storage: this.storage,
          hooks: this.hooks,
          validator: this.validator,
          config: this.config
        };
        const response = await resourceDef.handlers.delete(id, req, context);
        return this.normalizeHandlerResponse(response);
      } catch (error) {
        return {
          status: 500,
          body: JSON.stringify({ error: (error as Error).message })
        };
      }
    }

    // Default implementation
    try {
      // Get resource before deletion
      const resource = await this.storage.read(resourceType, id);
      if (!resource) {
        return { status: 404, body: JSON.stringify({ error: 'Resource not found' }) };
      }

      // Apply hooks
      await this.hooks.executeBeforeDelete(resourceType, resource, {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      });

      // Delete resource
      await this.storage.delete(resourceType, id);

      // Apply after hooks
      await this.hooks.executeAfterDelete(resourceType, resource, {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      });

      return { status: 204 };
    } catch (error) {
      return {
        status: 500,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  private async handleSearch(resourceType: string, req: Request): Promise<HandlerResponse> {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    // Use custom handler if provided
    if (resourceDef.handlers?.search) {
      try {
        const context: HandlerContext = { 
          storage: this.storage,
          hooks: this.hooks,
          validator: this.validator,
          config: this.config
        };
        const response = await resourceDef.handlers.search(req, context);
        return this.normalizeHandlerResponse(response);
      } catch (error) {
        return {
          status: 500,
          body: JSON.stringify({ error: (error as Error).message })
        };
      }
    }

    // Default implementation
    try {
      const searchParams = Object.fromEntries(new URL(req.url).searchParams);
      const results = await this.storage.search(resourceType, searchParams);

      const bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: results.length,
        entry: results.map((resource: any) => ({
          fullUrl: `${this.config.server?.url}/${resourceType}/${resource.id}`,
          resource
        }))
      };

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(bundle)
      };
    } catch (error) {
      return {
        status: 500,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  private async handleTypeOperation(resourceType: string, operationName: string, req: Request): Promise<HandlerResponse> {
    const operation = this.operations.get(resourceType, operationName, true);
    if (!operation) {
      return { status: 404, body: JSON.stringify({ error: `Operation ${operationName} not found for ${resourceType}` }) };
    }

    try {
      // Only try to parse JSON if there's a body
      let params: any = {};
      const contentLength = req.headers.get('content-length');
      if (contentLength && contentLength !== '0') {
        params = await req.json();
      }
      const context: HandlerContext = {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      };
      const result = await operation.handler(params, context);

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(result)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  private async handleInstanceOperation(resourceType: string, id: string, operationName: string, req: Request): Promise<HandlerResponse> {
    const operation = this.operations.get(resourceType, operationName, true);
    if (!operation) {
      return { status: 404, body: JSON.stringify({ error: `Operation ${operationName} not found for ${resourceType}` }) };
    }

    try {
      // Only try to parse JSON if there's a body
      let params: any = {};
      const contentLength = req.headers.get('content-length');
      if (contentLength && contentLength !== '0') {
        params = await req.json();
      }
      const resource = await this.storage.read(resourceType, id);
      if (!resource) {
        return { status: 404, body: JSON.stringify({ error: 'Resource not found' }) };
      }

      const context: HandlerContext = {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      };
      const result = await operation.handler({ ...params, resource }, context);

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(result)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  private async handleSystemOperation(operationName: string, req: Request): Promise<HandlerResponse> {
    const operation = this.operations.get(null, operationName, undefined);
    if (!operation) {
      return { status: 404, body: JSON.stringify({ error: `System operation ${operationName} not found` }) };
    }

    try {
      // Only try to parse JSON if there's a body (for POST requests)
      let params: any = {};
      const contentLength = req.headers.get('content-length');
      if (contentLength && contentLength !== '0') {
        params = await req.json();
      }
      const context: HandlerContext = {
        storage: this.storage,
        hooks: this.hooks,
        validator: this.validator,
        config: this.config
      };
      const result = await operation.handler(params, context);

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(result)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }

  registerResource(resourceType: string, definition: ResourceDefinition): void {
    this.resources.register(resourceType, definition);
  }

  registerOperation(operation: OperationDefinition): void {
    this.operations.register(operation);
  }

  use(middleware: MiddlewareDefinition): void {
    this.middleware.use(middleware as any);
  }

  registerHook(hook: HookDefinition): void {
    this.hooks.register(hook);
  }

  async autoload(basePath?: string): Promise<void> {
    if (!this.config.autoload || !this.config.autoload.enabled) {
      return;
    }

    // If no basePath provided, try to determine from caller
    if (!basePath) {
      // Try to get the directory of the main file
      try {
        const mainFile = process.argv[1] || import.meta.url;
        if (mainFile.startsWith('file://')) {
          basePath = dirname(fileURLToPath(mainFile));
        } else {
          basePath = dirname(mainFile);
        }
        
        // If the main file is in a src directory, go up one level
        if (basePath.endsWith('/src') || basePath.endsWith('\\src')) {
          basePath = dirname(basePath);
        }
      } catch (error) {
        console.warn('Could not determine base path for autoloading');
        return;
      }
    }

    const loader = new FilesystemLoader(basePath, this.config.autoload.paths);
    const components = await loader.loadAll();

    // Register discovered resources
    for (const [resourceType, definition] of components.resources) {
      this.registerResource(resourceType, definition);
    }

    // Register discovered operations
    for (const operation of components.operations) {
      this.registerOperation(operation);
    }

    // Apply discovered middleware
    for (const middleware of components.middleware) {
      this.use(middleware);
    }

    // Register discovered hooks
    for (const hook of components.hooks) {
      this.registerHook(hook);
    }

    // Register implementation guides
    for (const ig of components.implementationGuides) {
      await this.registerImplementationGuide(ig);
    }
  }

  async registerImplementationGuide(ig: ImplementationGuide): Promise<void> {
    console.log(`📚 Registering Implementation Guide: ${ig.id}`);
    
    // Register IG resources
    if (ig.resources) {
      for (const [resourceType, definition] of ig.resources) {
        this.registerResource(resourceType, definition);
      }
    }
    
    // Register IG operations
    if (ig.operations) {
      for (const operation of ig.operations) {
        this.registerOperation(operation);
      }
    }
    
    // Apply IG middleware
    if (ig.middleware) {
      for (const middleware of ig.middleware) {
        this.use(middleware);
      }
    }
    
    // Run IG configuration
    if (ig.configure) {
      await ig.configure(this);
    }
  }

  async start(options: StartOptions = {}): Promise<any> {
    // Collect packages from modules and main config
    const allPackages: any[] = [];
    
    // Add packages from main config
    if ((this.config.packages as any)?.list?.length > 0) {
      allPackages.push(...(this.config.packages as any).list);
    }
    
    // Collect packages from modules
    if (this.config.modules) {
      console.log(`\n📦 Collecting packages from ${Object.keys(this.config.modules).length} modules...`);
      for (const [moduleName, module] of Object.entries(this.config.modules)) {
        if (module.packages && module.packages.length > 0) {
          console.log(`   • Module '${moduleName}': ${module.packages.length} packages`);
          allPackages.push(...module.packages);
        }
      }
    }
    
    // Download and load FHIR packages if enabled
    if (options.packages !== false && (this.config.packages as any)?.enabled) {
      // Download all collected packages
      if (allPackages.length > 0) {
        // Deduplicate packages by package name and version
        const uniquePackages = Array.from(
          new Map(
            allPackages.map(pkg => [`${pkg.package}@${pkg.version || 'latest'}`, pkg])
          ).values()
        );
        
        console.log(`\n📥 Downloading ${uniquePackages.length} unique packages...`);
        await this.packageManager.downloadPackages(uniquePackages);
      }
      
      // Load packages from disk
      await this.packageManager.loadPackages();
      
      // Make package resources available to validator
      if (this.packageManager.loaded) {
        for (const [url, profile] of (this.packageManager as any).profiles) {
          this.validator.registerProfile(url, profile);
        }
        
        // Auto-register base resource definitions from packages
        const baseResources = this.packageManager.getBaseResourceDefinitions();
        if (baseResources.size > 0) {
          console.log(`\n🚀 Auto-registering ${baseResources.size} base resources from packages...`);
          
          for (const [resourceType, structureDef] of baseResources) {
            // Check if resource is not already registered (user-defined takes precedence)
            if (!this.resources.has(resourceType)) {
              const resourceDef = this.packageManager.generateResourceDefinition(structureDef);
              this.resources.register(resourceType, resourceDef);
            }
          }
          
          console.log(`   ✅ Registered ${baseResources.size} base resources`);
        }
      }
    }
    
    // Autoload components if enabled
    if (options.autoload !== false && this.config.autoload && this.config.autoload.enabled) {
      await this.autoload(options.basePath);
    }

    const port = options.port || this.config.server?.port || 3000;
    const server = (Bun as any).serve({
      port,
      fetch: async (req: Request) => {
        try {
          // Apply global middleware
          const context = { req } as any;
          await this.middleware.executeBefore(context);

          // Route request
          const response = await this.router.handle(req);

          // Apply after middleware
          await this.middleware.executeAfter(new Response() as Response, context);

          return new Response(response.body, {
            status: response.status,
            headers: response.headers
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    });

    if (this.config.server) {
      this.config.server.port = port; // Update config with actual port
      this.config.server.url = `http://localhost:${port}`; // Update URL with actual port
    }
    
    console.log(`🚀 Atomic FHIR Server running at http://localhost:${port}`);
    console.log(`📋 Metadata available at http://localhost:${port}/metadata`);
    
    return server;
  }
}

export default Atomic;