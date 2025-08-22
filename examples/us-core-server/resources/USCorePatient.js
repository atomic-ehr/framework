import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient',
  
  // US Core Patient profile
  structureDefinition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
  
  hooks: {
    beforeCreate: async (resource, context) => {
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
      
      // Add US Core race and ethnicity extensions if provided
      if (context.req.headers.get('X-Include-Race-Ethnicity')) {
        resource.extension = resource.extension || [];
        
        // Add race extension placeholder
        if (!resource.extension.find(e => e.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race')) {
          resource.extension.push({
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
            extension: [{
              url: 'text',
              valueString: 'Unknown'
            }]
          });
        }
        
        // Add ethnicity extension placeholder
        if (!resource.extension.find(e => e.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity')) {
          resource.extension.push({
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
            extension: [{
              url: 'text',
              valueString: 'Unknown'
            }]
          });
        }
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
      
      return resource;
    },
    
    afterCreate: async (resource, context) => {
      console.log(`US Core Patient created: ${resource.id}`);
      
      // Check for high-priority conditions
      if (resource.extension) {
        const birthSex = resource.extension.find(e => 
          e.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex'
        );
        
        if (birthSex) {
          console.log(`Patient birth sex recorded: ${birthSex.valueCode}`);
        }
      }
    },
    
    beforeUpdate: async (resource, previous, context) => {
      // Ensure US Core required fields remain present
      if (!resource.identifier || resource.identifier.length === 0) {
        resource.identifier = previous.identifier;
      }
      
      if (!resource.name || resource.name.length === 0) {
        resource.name = previous.name;
      }
      
      if (!resource.gender) {
        resource.gender = previous.gender;
      }
      
      return resource;
    }
  },
  
  searches: {
    'identifier': {
      type: 'token',
      path: 'identifier',
      documentation: 'A patient identifier (US Core)'
    },
    'name': {
      type: 'string',
      path: 'name',
      documentation: 'A portion of the family or given name (US Core)'
    },
    'birthdate': {
      type: 'date',
      path: 'birthDate',
      documentation: 'The patient\'s date of birth (US Core)'
    },
    'gender': {
      type: 'token',
      path: 'gender',
      documentation: 'Gender of the patient (US Core)'
    },
    'race': {
      type: 'token',
      path: 'extension.where(url=\'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race\')',
      documentation: 'Race of the patient (US Core extension)'
    },
    'ethnicity': {
      type: 'token',
      path: 'extension.where(url=\'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity\')',
      documentation: 'Ethnicity of the patient (US Core extension)'
    }
  },
  
  validators: {
    async validateUSCoreCompliance(patient) {
      // Validate name requirements
      if (patient.name) {
        for (const name of patient.name) {
          if (name.use === 'official' && !name.family) {
            throw new Error('Official names must have a family name in US Core');
          }
        }
      }
      
      // Validate address requirements
      if (patient.address) {
        for (const address of patient.address) {
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
      if (patient.telecom) {
        for (const telecom of patient.telecom) {
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
    }
  }
});