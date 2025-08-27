import type { HookDefinition, HookType, HandlerContext } from '../types/index.js';

export function defineHook(config: Partial<HookDefinition> & { 
  name: string; 
  type: HookType; 
  handler: (resource: any, context: HandlerContext) => Promise<any>;
}): HookDefinition {
  const validTypes: HookType[] = [
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
    handler: config.handler
  };
}

// Convenience functions for common hook types
export function beforeCreate(
  name: string, 
  handler: (resource: any, context: HandlerContext) => Promise<any>, 
  resources: '*' | string | string[] = '*'
): HookDefinition {
  return defineHook({
    name,
    type: 'beforeCreate',
    resources,
    handler
  });
}

export function afterCreate(
  name: string, 
  handler: (resource: any, context: HandlerContext) => Promise<void>, 
  resources: '*' | string | string[] = '*'
): HookDefinition {
  return defineHook({
    name,
    type: 'afterCreate',
    resources,
    handler
  });
}

export function beforeUpdate(
  name: string, 
  handler: (resource: any, context: HandlerContext) => Promise<any>, 
  resources: '*' | string | string[] = '*'
): HookDefinition {
  return defineHook({
    name,
    type: 'beforeUpdate',
    resources,
    handler
  });
}

export function afterUpdate(
  name: string, 
  handler: (resource: any, previous: any, context: HandlerContext) => Promise<void>, 
  resources: '*' | string | string[] = '*'
): HookDefinition {
  return defineHook({
    name,
    type: 'afterUpdate',
    resources,
    handler: async (resource: any, context: HandlerContext) => {
      // afterUpdate hooks receive both resource and previous as a combined object
      const { current, previous } = resource as { current: any; previous: any };
      await handler(current, previous, context);
      return current;
    }
  });
}

export function beforeDelete(
  name: string, 
  handler: (resource: any, context: HandlerContext) => Promise<void>, 
  resources: '*' | string | string[] = '*'
): HookDefinition {
  return defineHook({
    name,
    type: 'beforeDelete',
    resources,
    handler
  });
}

export function afterDelete(
  name: string, 
  handler: (resource: any, context: HandlerContext) => Promise<void>, 
  resources: '*' | string | string[] = '*'
): HookDefinition {
  return defineHook({
    name,
    type: 'afterDelete',
    resources,
    handler
  });
}