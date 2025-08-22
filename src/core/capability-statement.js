export class CapabilityStatement {
  constructor(app) {
    this.app = app;
  }

  async generate() {
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
          resource: resources.map(([type, definition]) => ({
            type,
            interaction: [
              { code: 'read' },
              { code: 'create' },
              { code: 'update' },
              { code: 'delete' },
              { code: 'search-type' }
            ],
            versioning: 'versioned',
            readHistory: true,
            updateCreate: false,
            conditionalCreate: false,
            conditionalRead: 'not-supported',
            conditionalUpdate: false,
            conditionalDelete: 'not-supported',
            searchParam: Object.entries(definition.searches || {}).map(([name, search]) => ({
              name,
              type: search.type,
              documentation: search.documentation
            }))
          })),
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