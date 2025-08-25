import { defineHook } from '@atomic/framework';

// Add US Core race and ethnicity extensions
const addRaceEthnicityExtensions = defineHook({
  name: 'us-core-race-ethnicity',
  type: 'beforeCreate',
  resources: 'Patient',
  priority: 5,
  description: 'Add US Core race and ethnicity extensions if requested',
  
  async handler(resource, context) {
    // Add US Core race and ethnicity extensions if provided
    if (context.req?.headers?.get?.('X-Include-Race-Ethnicity')) {
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
    
    return resource;
  }
});

// Log birth sex extension
const logBirthSex = defineHook({
  name: 'us-core-birth-sex-logging',
  type: 'afterCreate',
  resources: 'Patient',
  priority: 0,
  description: 'Log US Core birth sex if present',
  
  async handler(resource, context) {
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
  }
});

// Preserve required fields on update
const preserveRequiredFields = defineHook({
  name: 'us-core-preserve-required',
  type: 'beforeUpdate',
  resources: 'Patient',
  priority: 10,
  description: 'Preserve US Core required fields on update',
  
  async handler(resource, previous, context) {
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
});

export default [
  addRaceEthnicityExtensions,
  logBirthSex,
  preserveRequiredFields
];