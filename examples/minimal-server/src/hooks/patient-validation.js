import { defineHook } from '@atomic/framework';

// Patient-specific validation hook
export default defineHook({
  name: 'patient-validation',
  type: 'beforeCreate',
  resources: 'Patient', // Only applies to Patient resources
  priority: 5,
  description: 'Validate Patient resources have required fields',
  
  async handler(resource, context) {
    // Ensure patient has at least one name
    if (!resource.name || resource.name.length === 0) {
      throw new Error('Patient must have at least one name');
    }
    
    // Ensure patient has a gender
    if (!resource.gender) {
      resource.gender = 'unknown'; // Set default if not provided
    }
    
    // Validate birth date format if present
    if (resource.birthDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(resource.birthDate)) {
        throw new Error('Invalid birthDate format. Must be YYYY-MM-DD');
      }
    }
    
    // Add a business identifier if not present
    if (!resource.identifier) {
      resource.identifier = [];
    }
    
    // Check if MRN already exists
    const hasMRN = resource.identifier.some(id => 
      id.system === 'http://example.org/mrn'
    );
    
    if (!hasMRN) {
      resource.identifier.push({
        system: 'http://example.org/mrn',
        value: `MRN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    }
    
    return resource;
  }
});