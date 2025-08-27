import { defineHook, type HookDefinition, type HandlerContext } from '@atomic-fhir/core';

// Set default values for observations
export default defineHook({
  name: 'observation-defaults',
  type: 'beforeCreate',
  resources: 'Observation',
  priority: 5,
  
  async handler(resource: any, context: HandlerContext): Promise<any> {
    console.log('Creating observation via auto-discovered hook');
    
    // Add timestamp
    if (!resource.meta) {
      resource.meta = {};
    }
    resource.meta.lastUpdated = new Date().toISOString();
    
    // Set default status if not provided
    if (!resource.status) {
      resource.status = 'preliminary';
    }
    
    return resource;
  }
});