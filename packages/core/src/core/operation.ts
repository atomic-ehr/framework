import type { OperationDefinition } from '../types/index.js';

export function defineOperation(definition: OperationDefinition): OperationDefinition {
  return {
    name: definition.name,
    resource: definition.resource || undefined,
    system: definition.system,
    type: definition.type,
    instance: definition.instance,
    kind: definition.kind || 'operation',
    status: definition.status || 'active',
    code: definition.code,
    title: definition.title,
    description: definition.description,
    affectsState: definition.affectsState,
    comment: definition.comment,
    parameters: definition.parameters || { input: [], output: [] },
    handler: definition.handler
  };
}