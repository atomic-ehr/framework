export function defineHook(config) {
  const validTypes = [
    'beforeCreate', 'afterCreate',
    'beforeUpdate', 'afterUpdate',
    'beforeDelete', 'afterDelete',
    'beforeValidate', 'afterValidate',
    'beforeRead', 'afterRead',
    'beforeSearch', 'afterSearch'
  ];

  if (!config.name) {
    throw new Error('Hook must have a name');
  }

  if (!config.type || !validTypes.includes(config.type)) {
    throw new Error(`Hook type must be one of: ${validTypes.join(', ')}`);
  }

  if (!config.handler || typeof config.handler !== 'function') {
    throw new Error('Hook must have a handler function');
  }

  return {
    name: config.name,
    type: config.type,
    resources: config.resources || '*', // '*' means all resources
    priority: config.priority || 0, // Higher priority executes first
    ignoreErrors: config.ignoreErrors || false,
    handler: config.handler,
    description: config.description
  };
}

// Convenience functions for common hook types
export function beforeCreate(name, handler, resources = '*') {
  return defineHook({
    name,
    type: 'beforeCreate',
    resources,
    handler
  });
}

export function afterCreate(name, handler, resources = '*') {
  return defineHook({
    name,
    type: 'afterCreate',
    resources,
    handler
  });
}

export function beforeUpdate(name, handler, resources = '*') {
  return defineHook({
    name,
    type: 'beforeUpdate',
    resources,
    handler
  });
}

export function afterUpdate(name, handler, resources = '*') {
  return defineHook({
    name,
    type: 'afterUpdate',
    resources,
    handler
  });
}

export function beforeDelete(name, handler, resources = '*') {
  return defineHook({
    name,
    type: 'beforeDelete',
    resources,
    handler
  });
}

export function afterDelete(name, handler, resources = '*') {
  return defineHook({
    name,
    type: 'afterDelete',
    resources,
    handler
  });
}