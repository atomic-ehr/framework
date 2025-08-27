export function defineResource(definition) {
  return {
    resourceType: definition.resourceType,
    structureDefinition: definition.structureDefinition,
    // All FHIR capabilities enabled by default
    capabilities: {
      // Instance level operations
      read: true,                           // GET [base]/[type]/[id]
      vread: true,                          // GET [base]/[type]/[id]/_history/[vid]
      update: true,                          // PUT [base]/[type]/[id]
      'update-conditional': false,          // PUT [base]/[type]?[search parameters]
      patch: false,                          // PATCH [base]/[type]/[id]
      'patch-conditional': false,            // PATCH [base]/[type]?[search parameters]
      delete: true,                          // DELETE [base]/[type]/[id]
      'delete-conditional-single': false,   // DELETE [base]/[type]?[search parameters] (single match)
      'delete-conditional-multiple': false, // DELETE [base]/[type]?[search parameters] (multiple matches)
      'delete-history': false,               // DELETE [base]/[type]/[id]/_history
      'delete-history-version': false,       // DELETE [base]/[type]/[id]/_history/[vid]
      'history-instance': true,              // GET [base]/[type]/[id]/_history
      
      // Type level operations
      'history-type': true,                  // GET [base]/[type]/_history
      create: true,                          // POST [base]/[type]
      'create-conditional': false,           // POST [base]/[type] with If-None-Exist
      'search-type': true,                   // GET [base]/[type]
      
      ...(definition.capabilities || {})      // Allow overriding
    },
    // Custom handlers for CRUD operations (expanded to match capabilities)
    handlers: {
      create: definition.handlers?.create,
      read: definition.handlers?.read,
      vread: definition.handlers?.vread,
      update: definition.handlers?.update,
      'update-conditional': definition.handlers?.['update-conditional'],
      patch: definition.handlers?.patch,
      'patch-conditional': definition.handlers?.['patch-conditional'],
      delete: definition.handlers?.delete,
      'delete-conditional': definition.handlers?.['delete-conditional'],
      search: definition.handlers?.search,
      history: definition.handlers?.history,
      'history-type': definition.handlers?.['history-type']
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