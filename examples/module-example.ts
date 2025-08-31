import { BaseAtomicModule, defineOperation, defineResource, defineHook } from '@atomic-fhir/core';

/**
 * Example of creating a custom FHIR module with auto-discovery
 * 
 * This demonstrates the DRY approach where:
 * 1. Auto-discovery is enabled by default
 * 2. Module directory is automatically detected via import.meta.url
 * 3. Components are automatically loaded from standard paths
 */

// Simple module with minimal configuration
export class MyCustomModule extends BaseAtomicModule {
  constructor() {
    super({
      name: 'my-custom-module',
      version: '1.0.0',
      description: 'My custom FHIR module',
      moduleUrl: import.meta.url, // Auto-detect module directory
      // autoload is true by default, no need to specify
    });
  }
}

// Module with custom autoload paths
export class AdvancedModule extends BaseAtomicModule {
  constructor() {
    super({
      name: 'advanced-module',
      version: '2.0.0',
      description: 'Advanced FHIR module with custom paths',
      moduleUrl: import.meta.url,
      autoload: {
        enabled: true,
        paths: {
          resources: 'fhir/resources',
          operations: 'fhir/operations',
          hooks: 'fhir/hooks',
          middleware: 'fhir/middleware'
        }
      },
      packages: [{
        package: 'hl7.fhir.us.core',
        version: '7.0.0',
        remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/7.0.0'
      }]
    });
  }
}

// Module with autoload disabled (manual registration)
export class ManualModule extends BaseAtomicModule {
  constructor() {
    super({
      name: 'manual-module',
      version: '1.0.0',
      description: 'Module with manual component registration',
      moduleUrl: import.meta.url,
      autoload: false, // Disable auto-discovery
      init: async (module) => {
        // Manually register components
        module.registerResource('CustomResource', defineResource({
          resourceType: 'CustomResource',
          capabilities: {
            read: true,
            create: true,
            update: true,
            delete: true,
            'search-type': true
          }
        }));
        
        module.registerOperation(defineOperation({
          name: 'custom-operation',
          resource: 'CustomResource',
          instance: true,
          handler: async (req, context) => ({
            status: 200,
            headers: { 'Content-Type': 'application/fhir+json' },
            body: { message: 'Custom operation executed' }
          })
        }));
        
        module.registerHook(defineHook({
          name: 'custom-hook',
          type: 'beforeCreate',
          resources: 'CustomResource',
          handler: async (resource) => {
            console.log('Custom hook triggered');
            return resource;
          }
        }));
      }
    });
  }
}

/**
 * Usage in Atomic server:
 * 
 * const app = new Atomic({
 *   modules: {
 *     myCustom: new MyCustomModule(),
 *     advanced: new AdvancedModule(),
 *     manual: new ManualModule()
 *   }
 * });
 * 
 * await app.start();
 */