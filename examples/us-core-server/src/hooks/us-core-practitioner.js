import { defineHook } from '@atomic-fhir/core';

// NPI validation using Luhn algorithm
function validateNPI(npi) {
  if (!/^\d{10}$/.test(npi)) return false;
  
  // NPI uses Luhn algorithm with prefix 80840
  const fullNumber = '80840' + npi;
  let sum = 0;
  let isEven = false;
  
  for (let i = fullNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(fullNumber[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

// Validate US Core Practitioner requirements
const validatePractitioner = defineHook({
  name: 'us-core-practitioner-validation',
  type: 'beforeCreate',
  resources: 'Practitioner',
  priority: 10,
  description: 'Validate US Core Practitioner requirements',
  
  async handler(resource, context) {
    // US Core Practitioner requires identifier and name
    if (!resource.identifier || resource.identifier.length === 0) {
      throw new Error('US Core Practitioner requires at least one identifier');
    }
    
    if (!resource.name || resource.name.length === 0) {
      throw new Error('US Core Practitioner requires at least one name');
    }
    
    // Validate name structure
    for (const name of resource.name) {
      if (!name.family) {
        throw new Error('US Core Practitioner names must include family name');
      }
    }
    
    // Validate NPI if present
    const npi = resource.identifier.find(id => 
      id.system === 'http://hl7.org/fhir/sid/us-npi'
    );
    
    if (npi) {
      if (!/^\d{10}$/.test(npi.value)) {
        throw new Error('NPI must be exactly 10 digits');
      }
      
      // Validate NPI checksum (Luhn algorithm)
      if (!validateNPI(npi.value)) {
        throw new Error('Invalid NPI checksum');
      }
    }
    
    // Validate telecom if present
    if (resource.telecom) {
      for (const telecom of resource.telecom) {
        if (!telecom.system || !telecom.value) {
          throw new Error('Telecom entries must have system and value');
        }
      }
    }
    
    // Validate address if present
    if (resource.address) {
      for (const address of resource.address) {
        if (address.country === 'US') {
          // US addresses should have certain fields
          if (!address.line || !address.city || !address.state || !address.postalCode) {
            console.warn('US addresses should have line, city, state, and postalCode');
          }
        }
      }
    }
    
    return resource;
  }
});

// Log practitioner creation and specialties
const logPractitioner = defineHook({
  name: 'us-core-practitioner-logging',
  type: 'afterCreate',
  resources: 'Practitioner',
  priority: 0,
  description: 'Log US Core Practitioner creation',
  
  async handler(resource, context) {
    console.log(`US Core Practitioner created: ${resource.id}`);
    
    // Log practitioner specialty if present
    if (resource.qualification) {
      const specialties = resource.qualification
        .filter(q => q.code?.coding)
        .map(q => q.code.coding[0]?.display)
        .filter(Boolean);
      
      if (specialties.length > 0) {
        console.log(`Practitioner specialties: ${specialties.join(', ')}`);
      }
    }
  }
});

export default [
  validatePractitioner,
  logPractitioner
];