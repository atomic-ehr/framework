import { defineHook } from '@atomic/framework';

// Global hook that adds timestamps to all resources
export default defineHook({
  name: 'add-timestamps',
  type: 'beforeCreate',
  resources: '*', // Applies to all resources
  priority: 10, // Higher priority executes first
  description: 'Automatically add creation timestamp to all resources',
  
  async handler(resource, context) {
    // Add metadata if not present
    if (!resource.meta) {
      resource.meta = {};
    }
    
    // Set creation timestamp
    resource.meta.lastUpdated = new Date().toISOString();
    
    // Add custom extension for created timestamp
    if (!resource.meta.extension) {
      resource.meta.extension = [];
    }
    
    resource.meta.extension.push({
      url: 'http://example.org/fhir/StructureDefinition/created',
      valueDateTime: new Date().toISOString()
    });
    
    console.log(`📅 Added timestamp to ${resource.resourceType}`);
    
    return resource;
  }
});