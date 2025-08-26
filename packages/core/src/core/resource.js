export function defineResource(definition) {
  return {
    resourceType: definition.resourceType,
    structureDefinition: definition.structureDefinition,
    // All capabilities enabled by default
    capabilities: {
      create: true,
      read: true,
      update: true,
      delete: true,
      search: true,
      history: true,
      ...(definition.capabilities || {})  // Allow overriding
    },
    // Custom handlers for CRUD operations
    handlers: {
      create: definition.handlers?.create,
      read: definition.handlers?.read,
      update: definition.handlers?.update,
      delete: definition.handlers?.delete,
      search: definition.handlers?.search,
      history: definition.handlers?.history
    },
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