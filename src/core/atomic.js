import { Router } from './router.js';
import { ResourceRegistry } from './resource-registry.js';
import { OperationRegistry } from './operation-registry.js';
import { MiddlewareManager } from './middleware-manager.js';
import { HooksManager } from './hooks-manager.js';
import { StorageManager } from '../storage/storage-manager.js';
import { Validator } from './validator.js';
import { CapabilityStatement } from './capability-statement.js';
import { FilesystemLoader } from './filesystem-loader.js';
import { PackageManager } from './package-manager.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export class Atomic {
  constructor(config = {}) {
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
            autoloadConfig.enabled = config.autoload.enabled;
          }
        }
        return autoloadConfig;
      })(),
      packages: {
        enabled: true,  // Enabled by default
        path: 'packages',
        ...(config.packages === false ? { enabled: false } : config.packages)
      },
      ...config
    };

    this.router = new Router();
    this.resources = new ResourceRegistry();
    this.operations = new OperationRegistry();
    this.middleware = new MiddlewareManager();
    this.hooks = new HooksManager();
    this.storage = new StorageManager(this.config.storage);
    this.validator = new Validator(this.config.validation);
    this.capabilityStatement = new CapabilityStatement(this);
    this.packageManager = new PackageManager(this.config.packages.path);
    
    this.setupCoreRoutes();
  }

  setupCoreRoutes() {
    // Metadata endpoint
    this.router.get('/metadata', async (req) => {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(await this.capabilityStatement.generate())
      };
    });

    // Resource type routes
    this.router.get('/:resourceType', async (req) => {
      const { resourceType } = req.params;
      return await this.handleSearch(resourceType, req);
    });

    this.router.post('/:resourceType', async (req) => {
      const { resourceType } = req.params;
      return await this.handleCreate(resourceType, req);
    });

    this.router.get('/:resourceType/:id', async (req) => {
      const { resourceType, id } = req.params;
      return await this.handleRead(resourceType, id, req);
    });

    this.router.put('/:resourceType/:id', async (req) => {
      const { resourceType, id } = req.params;
      return await this.handleUpdate(resourceType, id, req);
    });

    this.router.delete('/:resourceType/:id', async (req) => {
      const { resourceType, id } = req.params;
      return await this.handleDelete(resourceType, id, req);
    });

    // Operation routes
    this.router.post('/:resourceType/$:operation', async (req) => {
      const { resourceType, operation } = req.params;
      return await this.handleTypeOperation(resourceType, operation, req);
    });

    this.router.post('/:resourceType/:id/$:operation', async (req) => {
      const { resourceType, id, operation } = req.params;
      return await this.handleInstanceOperation(resourceType, id, operation, req);
    });

    this.router.post('/$:operation', async (req) => {
      const { operation } = req.params;
      return await this.handleSystemOperation(operation, req);
    });
  }

  async handleCreate(resourceType, req) {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    try {
      const body = await req.json();
      
      // Validate resource
      if (this.config.validation.strict) {
        await this.validator.validate(body, resourceType);
      }

      // Apply hooks
      let resource = await this.hooks.executeBeforeCreate(resourceType, body, { req, storage: this.storage });

      // Store resource
      const created = await this.storage.create(resourceType, resource);

      // Apply after hooks
      await this.hooks.executeAfterCreate(resourceType, created, { req, storage: this.storage });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${this.config.server.url}/${resourceType}/${created.id}`
        },
        body: JSON.stringify(created)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  async handleRead(resourceType, id, req) {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

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
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  async handleUpdate(resourceType, id, req) {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    try {
      const body = await req.json();
      
      // Validate resource
      if (this.config.validation.strict) {
        await this.validator.validate(body, resourceType);
      }

      // Get previous version
      const previous = await this.storage.read(resourceType, id);
      if (!previous) {
        return { status: 404, body: JSON.stringify({ error: 'Resource not found' }) };
      }

      // Apply hooks
      let resource = await this.hooks.executeBeforeUpdate(resourceType, body, previous, { req, storage: this.storage });

      // Update resource
      const updated = await this.storage.update(resourceType, id, resource);

      // Apply after hooks
      await this.hooks.executeAfterUpdate(resourceType, updated, previous, { req, storage: this.storage });

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(updated)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  async handleDelete(resourceType, id, req) {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    try {
      // Get resource before deletion
      const resource = await this.storage.read(resourceType, id);
      if (!resource) {
        return { status: 404, body: JSON.stringify({ error: 'Resource not found' }) };
      }

      // Apply hooks
      await this.hooks.executeBeforeDelete(resourceType, resource, { req, storage: this.storage });

      // Delete resource
      await this.storage.delete(resourceType, id);

      // Apply after hooks
      await this.hooks.executeAfterDelete(resourceType, resource, { req, storage: this.storage });

      return { status: 204 };
    } catch (error) {
      return {
        status: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  async handleSearch(resourceType, req) {
    const resourceDef = this.resources.get(resourceType);
    if (!resourceDef) {
      return { status: 404, body: JSON.stringify({ error: `Resource type ${resourceType} not found` }) };
    }

    try {
      const searchParams = Object.fromEntries(new URL(req.url).searchParams);
      const results = await this.storage.search(resourceType, searchParams);

      const bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: results.length,
        entry: results.map(resource => ({
          fullUrl: `${this.config.server.url}/${resourceType}/${resource.id}`,
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
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  async handleTypeOperation(resourceType, operationName, req) {
    const operation = this.operations.get(resourceType, operationName, 'type');
    if (!operation) {
      return { status: 404, body: JSON.stringify({ error: `Operation ${operationName} not found for ${resourceType}` }) };
    }

    try {
      const params = await req.json();
      const result = await operation.handler.call(this, params, { req, storage: this.storage });

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(result)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  async handleInstanceOperation(resourceType, id, operationName, req) {
    const operation = this.operations.get(resourceType, operationName, 'instance');
    if (!operation) {
      return { status: 404, body: JSON.stringify({ error: `Operation ${operationName} not found for ${resourceType}` }) };
    }

    try {
      const params = await req.json();
      const resource = await this.storage.read(resourceType, id);
      if (!resource) {
        return { status: 404, body: JSON.stringify({ error: 'Resource not found' }) };
      }

      const result = await operation.handler.call(this, { ...params, resource }, { req, storage: this.storage });

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(result)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  async handleSystemOperation(operationName, req) {
    const operation = this.operations.get(null, operationName, 'system');
    if (!operation) {
      return { status: 404, body: JSON.stringify({ error: `System operation ${operationName} not found` }) };
    }

    try {
      const params = await req.json();
      const result = await operation.handler.call(this, params, { req, storage: this.storage });

      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(result)
      };
    } catch (error) {
      return {
        status: 400,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  registerResource(resourceType, definition) {
    this.resources.register(resourceType, definition);
  }

  registerOperation(operation) {
    this.operations.register(operation);
  }

  use(middleware) {
    this.middleware.use(middleware);
  }

  registerHook(hook) {
    this.hooks.register(hook);
  }

  async autoload(basePath) {
    if (!this.config.autoload.enabled) {
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

  async registerImplementationGuide(ig) {
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

  async start(options = {}) {
    // Load FHIR packages if enabled
    if (options.packages !== false && this.config.packages.enabled) {
      await this.packageManager.loadPackages();
      
      // Make package resources available to validator
      if (this.packageManager.loaded) {
        for (const [url, profile] of this.packageManager.profiles) {
          this.validator.registerProfile(url, profile);
        }
      }
    }
    
    // Autoload components if enabled
    if (options.autoload !== false && this.config.autoload.enabled) {
      await this.autoload(options.basePath);
    }

    const port = options.port || this.config.server.port;
    const server = Bun.serve({
      port,
      fetch: async (req) => {
        try {
          // Apply global middleware
          const context = { req };
          await this.middleware.executeBefore(context);

          // Route request
          const response = await this.router.handle(req);

          // Apply after middleware
          await this.middleware.executeAfter(response, context);

          return new Response(response.body, {
            status: response.status,
            headers: response.headers
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    });

    this.config.server.port = port; // Update config with actual port
    this.config.server.url = `http://localhost:${port}`; // Update URL with actual port
    
    console.log(`🚀 Atomic FHIR Server running at http://localhost:${port}`);
    console.log(`📋 Metadata available at http://localhost:${port}/metadata`);
    
    return server;
  }
}