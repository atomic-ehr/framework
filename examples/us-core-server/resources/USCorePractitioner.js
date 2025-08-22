import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Practitioner',
  
  structureDefinition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-practitioner',
  
  hooks: {
    beforeCreate: async (resource, context) => {
      // US Core Practitioner requires identifier and name
      if (!resource.identifier || resource.identifier.length === 0) {
        throw new Error('US Core Practitioner requires at least one identifier');
      }
      
      if (!resource.name || resource.name.length === 0) {
        throw new Error('US Core Practitioner requires at least one name');
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
      
      return resource;
    },
    
    afterCreate: async (resource, context) => {
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
  },
  
  searches: {
    'identifier': {
      type: 'token',
      path: 'identifier',
      documentation: 'A practitioner\'s identifier (US Core)'
    },
    'name': {
      type: 'string',
      path: 'name',
      documentation: 'A portion of the name (US Core)'
    },
    'npi': {
      type: 'token',
      path: 'identifier.where(system=\'http://hl7.org/fhir/sid/us-npi\')',
      documentation: 'National Provider Identifier (NPI)'
    }
  },
  
  validators: {
    async validateUSCoreCompliance(practitioner) {
      // Validate name structure
      if (practitioner.name) {
        for (const name of practitioner.name) {
          if (!name.family) {
            throw new Error('US Core Practitioner names must include family name');
          }
        }
      }
      
      // Validate telecom if present
      if (practitioner.telecom) {
        for (const telecom of practitioner.telecom) {
          if (!telecom.system || !telecom.value) {
            throw new Error('Telecom entries must have system and value');
          }
        }
      }
      
      // Validate address if present
      if (practitioner.address) {
        for (const address of practitioner.address) {
          if (address.country === 'US') {
            // US addresses should have certain fields
            if (!address.line || !address.city || !address.state || !address.postalCode) {
              console.warn('US addresses should have line, city, state, and postalCode');
            }
          }
        }
      }
    }
  }
});

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