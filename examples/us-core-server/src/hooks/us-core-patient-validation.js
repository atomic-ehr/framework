import { defineHook } from '@atomic-fhir/core';

// US Core Patient validation hook
export default defineHook({
  name: 'us-core-patient-validation',
  type: 'beforeCreate',
  resources: 'Patient',
  priority: 10,
  description: 'Ensure US Core Patient profile compliance',
  
  async handler(resource, context) {
    // Ensure US Core required fields
    if (!resource.identifier || resource.identifier.length === 0) {
      throw new Error('US Core Patient requires at least one identifier');
    }
    
    if (!resource.name || resource.name.length === 0) {
      throw new Error('US Core Patient requires at least one name');
    }
    
    if (!resource.gender) {
      throw new Error('US Core Patient requires gender');
    }
    
    // Validate identifier systems
    for (const identifier of resource.identifier) {
      if (!identifier.system) {
        throw new Error('US Core Patient identifiers must have a system');
      }
      if (!identifier.value) {
        throw new Error('US Core Patient identifiers must have a value');
      }
    }
    
    // Validate name requirements
    if (resource.name) {
      for (const name of resource.name) {
        if (name.use === 'official' && !name.family) {
          throw new Error('Official names must have a family name in US Core');
        }
      }
    }
    
    // Validate address requirements
    if (resource.address) {
      for (const address of resource.address) {
        if (address.use === 'home' && address.country === 'US') {
          if (!address.line || !address.city || !address.state || !address.postalCode) {
            console.warn('US addresses should have line, city, state, and postalCode');
          }
          
          // Validate state code
          if (address.state && !/^[A-Z]{2}$/.test(address.state)) {
            throw new Error('US state must be a 2-letter code');
          }
          
          // Validate ZIP code
          if (address.postalCode && !/^\d{5}(-\d{4})?$/.test(address.postalCode)) {
            throw new Error('US postal code must be in format 12345 or 12345-6789');
          }
        }
      }
    }
    
    // Validate telecom requirements
    if (resource.telecom) {
      for (const telecom of resource.telecom) {
        if (!telecom.system || !telecom.value) {
          throw new Error('Telecom entries must have system and value');
        }
        
        if (telecom.system === 'phone' && telecom.use === 'home') {
          // Validate US phone number format
          const phoneRegex = /^\+?1?\d{10,14}$/;
          const cleanPhone = telecom.value.replace(/[\s\-\(\)]/g, '');
          if (!phoneRegex.test(cleanPhone)) {
            console.warn('Phone number may not be in valid US format');
          }
        }
      }
    }
    
    return resource;
  }
});