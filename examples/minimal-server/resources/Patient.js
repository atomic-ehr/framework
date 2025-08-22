import { defineResource } from '@atomic/framework';

// This file will be auto-discovered because it's in the resources/ folder
// and exports a resource definition as default

export default defineResource({
  resourceType: 'Patient',
  
  hooks: {
    beforeCreate: async (resource) => {
      console.log('Creating patient via auto-discovered resource');
      
      // Add timestamp
      if (!resource.meta) {
        resource.meta = {};
      }
      resource.meta.lastUpdated = new Date().toISOString();
      
      return resource;
    }
  }
});