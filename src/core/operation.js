export function defineOperation(definition) {
  return {
    name: definition.name,
    resource: definition.resource || null,
    type: definition.type || 'type', // 'type' | 'instance' | 'system'
    parameters: definition.parameters || {},
    handler: definition.handler
  };
}