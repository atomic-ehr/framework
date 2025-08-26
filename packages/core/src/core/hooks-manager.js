export class HooksManager {
  constructor() {
    this.hooks = new Map();
  }

  register(hook) {
    if (!hook.name) {
      throw new Error('Hook must have a name');
    }

    if (!hook.type) {
      throw new Error('Hook must have a type (beforeCreate, afterCreate, etc.)');
    }

    const key = this.getKey(hook.resources || '*', hook.type);
    
    if (!this.hooks.has(key)) {
      this.hooks.set(key, []);
    }
    
    this.hooks.get(key).push(hook);
    
    console.log(`🪝 Registered hook: ${hook.name} for ${hook.resources || 'all resources'} on ${hook.type}`);
  }

  getKey(resources, type) {
    if (resources === '*' || !resources) {
      return `*:${type}`;
    }
    if (Array.isArray(resources)) {
      return resources.map(r => `${r}:${type}`).join(',');
    }
    return `${resources}:${type}`;
  }

  async execute(type, resourceType, ...args) {
    const hooks = [];
    
    // Get global hooks
    const globalKey = `*:${type}`;
    if (this.hooks.has(globalKey)) {
      hooks.push(...this.hooks.get(globalKey));
    }
    
    // Get resource-specific hooks
    const resourceKey = `${resourceType}:${type}`;
    if (this.hooks.has(resourceKey)) {
      hooks.push(...this.hooks.get(resourceKey));
    }
    
    // Also check for multi-resource hooks
    for (const [key, hookList] of this.hooks) {
      if (key.includes(',')) {
        const resources = key.split(',').map(k => k.split(':')[0]);
        if (resources.includes(resourceType)) {
          const hookType = key.split(':').pop();
          if (hookType === type) {
            hooks.push(...hookList);
          }
        }
      }
    }
    
    // Sort by priority (higher priority executes first)
    hooks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Execute hooks in sequence
    let result = args[0]; // First argument is usually the resource
    
    for (const hook of hooks) {
      if (hook.handler) {
        try {
          const hookResult = await hook.handler(...args);
          // If hook returns a value, use it as the new resource
          if (hookResult !== undefined && type.startsWith('before')) {
            result = hookResult;
            args[0] = result; // Update for next hook
          }
        } catch (error) {
          console.error(`Hook ${hook.name} failed:`, error);
          if (!hook.ignoreErrors) {
            throw error;
          }
        }
      }
    }
    
    return result;
  }

  async executeBeforeCreate(resourceType, resource, context) {
    return await this.execute('beforeCreate', resourceType, resource, context);
  }

  async executeAfterCreate(resourceType, resource, context) {
    await this.execute('afterCreate', resourceType, resource, context);
  }

  async executeBeforeUpdate(resourceType, resource, previous, context) {
    return await this.execute('beforeUpdate', resourceType, resource, previous, context);
  }

  async executeAfterUpdate(resourceType, resource, previous, context) {
    await this.execute('afterUpdate', resourceType, resource, previous, context);
  }

  async executeBeforeDelete(resourceType, resource, context) {
    return await this.execute('beforeDelete', resourceType, resource, context);
  }

  async executeAfterDelete(resourceType, resource, context) {
    await this.execute('afterDelete', resourceType, resource, context);
  }

  async executeBeforeValidate(resourceType, resource, context) {
    return await this.execute('beforeValidate', resourceType, resource, context);
  }

  async executeAfterValidate(resourceType, resource, context) {
    await this.execute('afterValidate', resourceType, resource, context);
  }
}