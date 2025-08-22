import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient',
  
  // Lifecycle hooks
  hooks: {
    beforeCreate: async (resource, context) => {
      console.log('Creating new patient:', resource.name?.[0]?.family);
      
      // Auto-generate an MRN if not provided
      if (!resource.identifier) {
        resource.identifier = [];
      }
      
      const hasMRN = resource.identifier.some(id => 
        id.system === 'http://hospital.example.org/mrn'
      );
      
      if (!hasMRN) {
        resource.identifier.push({
          system: 'http://hospital.example.org/mrn',
          value: `MRN-${Date.now()}`
        });
      }
      
      return resource;
    },
    
    afterCreate: async (resource, context) => {
      console.log(`Patient created with ID: ${resource.id}`);
      // Here you could send notifications, update indices, etc.
    },
    
    beforeUpdate: async (resource, previous, context) => {
      console.log(`Updating patient ${resource.id}`);
      
      // Preserve certain fields that shouldn't change
      resource.identifier = previous.identifier;
      
      return resource;
    },
    
    afterUpdate: async (resource, previous, context) => {
      console.log(`Patient ${resource.id} updated`);
      
      // Check for significant changes
      if (previous.name?.[0]?.family !== resource.name?.[0]?.family) {
        console.log('Patient name changed, may need to notify systems');
      }
    },
    
    beforeDelete: async (resource, context) => {
      console.log(`Deleting patient ${resource.id}`);
      // Could check for related resources, active encounters, etc.
    }
  },
  
  // Custom search parameters
  searches: {
    'mrn': {
      type: 'token',
      path: 'identifier',
      documentation: 'Search by Medical Record Number'
    },
    'age': {
      type: 'number',
      path: 'birthDate',
      documentation: 'Search by calculated age'
    }
  },
  
  // Custom validators
  validators: {
    async validateAge(patient) {
      if (patient.birthDate) {
        const birthDate = new Date(patient.birthDate);
        const now = new Date();
        
        if (birthDate > now) {
          throw new Error('Birth date cannot be in the future');
        }
        
        const age = Math.floor((now - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
        if (age > 150) {
          throw new Error('Age seems unrealistic (>150 years)');
        }
      }
    },
    
    async validateIdentifiers(patient) {
      if (patient.identifier) {
        const systems = patient.identifier.map(id => id.system);
        const uniqueSystems = new Set(systems);
        
        if (systems.length !== uniqueSystems.size) {
          console.warn('Patient has duplicate identifier systems');
        }
      }
    }
  }
});