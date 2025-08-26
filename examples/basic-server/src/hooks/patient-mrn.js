import { defineHook } from '@atomic-fhir/core';

// Hook to auto-generate MRN for patients
export default defineHook({
  name: 'patient-mrn-generator',
  type: 'beforeCreate',
  resources: 'Patient',
  priority: 10,
  description: 'Auto-generate Medical Record Number for new patients',
  
  async handler(resource, context) {
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
      console.log('Generated MRN for patient:', resource.name?.[0]?.family);
    }
    
    return resource;
  }
});