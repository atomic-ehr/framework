export function defineResource(definition) {
  return {
    resourceType: definition.resourceType,
    structureDefinition: definition.structureDefinition,
    hooks: {
      beforeCreate: definition.hooks?.beforeCreate,
      afterCreate: definition.hooks?.afterCreate,
      beforeUpdate: definition.hooks?.beforeUpdate,
      afterUpdate: definition.hooks?.afterUpdate,
      beforeDelete: definition.hooks?.beforeDelete,
      afterDelete: definition.hooks?.afterDelete
    },
    searches: definition.searches || {},
    validators: definition.validators || {},
    middleware: definition.middleware || []
  };
}