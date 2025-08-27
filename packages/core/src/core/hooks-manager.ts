import type { HookDefinition, HookType, HandlerContext } from '../types/index.js';

export class HooksManager {
  private hooks: Map<string, HookDefinition[]>;

  constructor() {
    this.hooks = new Map();
  }

  register(hook: HookDefinition): void {
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
    
    this.hooks.get(key)!.push(hook);
    
    console.log(`🪝 Registered hook: ${hook.name} for ${hook.resources || 'all resources'} on ${hook.type}`);
  }

  private getKey(resources: '*' | string | string[], type: HookType): string {
    if (resources === '*' || !resources) {
      return `*:${type}`;
    }
    if (Array.isArray(resources)) {
      return resources.map(r => `${r}:${type}`).join(',');
    }
    return `${resources}:${type}`;
  }

  async execute(type: HookType, resourceType: string, resource: any, ...args: any[]): Promise<any> {
    const hooks: HookDefinition[] = [];
    
    // Get global hooks
    const globalKey = `*:${type}`;
    if (this.hooks.has(globalKey)) {
      hooks.push(...this.hooks.get(globalKey)!);
    }
    
    // Get resource-specific hooks
    const resourceKey = `${resourceType}:${type}`;
    if (this.hooks.has(resourceKey)) {
      hooks.push(...this.hooks.get(resourceKey)!);
    }
    
    // Also check for multi-resource hooks
    for (const [key, hookList] of this.hooks) {
      if (key.includes(',')) {
        const resources = key.split(',').map(k => k.split(':')[0]);
        if (resources.includes(resourceType)) {
          const hookType = key.split(':').pop() as HookType;
          if (hookType === type) {
            hooks.push(...hookList);
          }
        }
      }
    }
    
    // Sort by priority (higher priority executes first)
    hooks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Execute hooks in sequence
    let result = resource; // First argument is the resource
    
    for (const hook of hooks) {
      if (hook.handler) {
        try {
          const hookResult = await hook.handler(result, ...args);
          // If hook returns a value, use it as the new resource
          if (hookResult !== undefined && type.startsWith('before')) {
            result = hookResult;
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

  async executeBeforeCreate(resourceType: string, resource: any, context: HandlerContext): Promise<any> {
    return await this.execute('beforeCreate', resourceType, resource, context);
  }

  async executeAfterCreate(resourceType: string, resource: any, context: HandlerContext): Promise<void> {
    await this.execute('afterCreate', resourceType, resource, context);
  }

  async executeBeforeUpdate(resourceType: string, resource: any, previous: any, context: HandlerContext): Promise<any> {
    return await this.execute('beforeUpdate', resourceType, resource, previous, context);
  }

  async executeAfterUpdate(resourceType: string, resource: any, previous: any, context: HandlerContext): Promise<void> {
    await this.execute('afterUpdate', resourceType, resource, previous, context);
  }

  async executeBeforeDelete(resourceType: string, resource: any, context: HandlerContext): Promise<any> {
    return await this.execute('beforeDelete', resourceType, resource, context);
  }

  async executeAfterDelete(resourceType: string, resource: any, context: HandlerContext): Promise<void> {
    await this.execute('afterDelete', resourceType, resource, context);
  }

  async executeBeforeValidate(resourceType: string, resource: any, context: HandlerContext): Promise<any> {
    return await this.execute('beforeValidate', resourceType, resource, context);
  }

  async executeAfterValidate(resourceType: string, resource: any, context: HandlerContext): Promise<void> {
    await this.execute('afterValidate', resourceType, resource, context);
  }
}