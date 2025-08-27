import type { ResourceDefinition, ResourceCapabilities } from '../types/index.js';

interface CapabilityApp {
  resources: {
    getAll(): [string, ResourceDefinition][];
  };
  operations: {
    getAll(): any[];
  };
  config: {
    server: {
      fhirVersion?: string;
      name?: string;
      url?: string;
    };
  };
  packageManager?: {
    loaded: boolean;
    getProfilesForResource(resourceType: string): string[];
  };
}

interface ResourceEntry {
  type: string;
  interaction: Array<{ code: string }>;
  versioning: string;
  readHistory: boolean;
  updateCreate: boolean;
  conditionalCreate: string;
  conditionalRead: string;
  conditionalUpdate: string;
  conditionalDelete: string;
  searchParam: Array<{
    name: string;
    type: string;
    documentation?: string;
  }>;
  supportedProfile?: string[];
}

interface CapabilityStatementResponse {
  resourceType: 'CapabilityStatement';
  status: 'active';
  date: string;
  kind: 'instance';
  fhirVersion?: string;
  format: string[];
  implementation: {
    description?: string;
    url?: string;
  };
  rest: Array<{
    mode: 'server';
    resource: ResourceEntry[];
    operation: Array<{
      name: string;
      definition: string;
      documentation: string;
    }>;
  }>;
}

export class CapabilityStatement {
  private app: CapabilityApp;

  constructor(app: CapabilityApp) {
    this.app = app;
  }

  async generate(): Promise<CapabilityStatementResponse> {
    const resources = this.app.resources.getAll();
    const operations = this.app.operations.getAll();

    return {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString(),
      kind: 'instance',
      fhirVersion: this.app.config.server.fhirVersion,
      format: ['json', 'xml'],
      implementation: {
        description: this.app.config.server.name,
        url: this.app.config.server.url
      },
      rest: [
        {
          mode: 'server',
          resource: resources.map(([type, definition]) => {
            // Build interaction list based on capabilities
            const interactions: Array<{ code: string }> = [];
            const caps: ResourceCapabilities = definition.capabilities || {};
            
            // Map capabilities to FHIR interaction codes
            if (caps.read !== false) interactions.push({ code: 'read' });
            if (caps.vread !== false) interactions.push({ code: 'vread' });
            if (caps.update !== false) interactions.push({ code: 'update' });
            if (caps['update-conditional']) interactions.push({ code: 'update-conditional' });
            if (caps.patch) interactions.push({ code: 'patch' });
            if (caps['patch-conditional']) interactions.push({ code: 'patch-conditional' });
            if (caps.delete !== false) interactions.push({ code: 'delete' });
            if (caps['delete-conditional-single']) interactions.push({ code: 'delete-conditional-single' });
            if (caps['delete-conditional-multiple']) interactions.push({ code: 'delete-conditional-multiple' });
            if (caps['delete-history']) interactions.push({ code: 'delete-history' });
            if (caps['delete-history-version']) interactions.push({ code: 'delete-history-version' });
            if (caps['history-instance'] !== false) interactions.push({ code: 'history-instance' });
            if (caps['history-type'] !== false) interactions.push({ code: 'history-type' });
            if (caps.create !== false) interactions.push({ code: 'create' });
            if (caps['create-conditional']) interactions.push({ code: 'create-conditional' });
            if (caps['search-type'] !== false) interactions.push({ code: 'search-type' });
            
            const resourceDef: ResourceEntry = {
              type,
              interaction: interactions,
              versioning: 'versioned',
              readHistory: caps['history-instance'] !== false,
              updateCreate: false,  // Could be made configurable
              conditionalCreate: caps['create-conditional'] ? 'true' : 'false',
              conditionalRead: 'not-supported',  // Could add capability for this
              conditionalUpdate: caps['update-conditional'] ? 'true' : 'false',
              conditionalDelete: caps['delete-conditional-single'] || caps['delete-conditional-multiple'] 
                ? (caps['delete-conditional-multiple'] ? 'multiple' : 'single')
                : 'not-supported',
              searchParam: Object.entries(definition.searches || {}).map(([name, search]) => ({
                name,
                type: search.type,
                documentation: search.documentation
              }))
            };

            // Add supportedProfile from loaded packages
            if (this.app.packageManager && this.app.packageManager.loaded) {
              const profiles = this.app.packageManager.getProfilesForResource(type);
              if (profiles.length > 0) {
                resourceDef.supportedProfile = profiles;
              }
            }

            return resourceDef;
          }),
          operation: operations.map(op => ({
            name: op.name,
            definition: `OperationDefinition/${op.name}`,
            documentation: `Operation $${op.name}`
          }))
        }
      ]
    };
  }
}