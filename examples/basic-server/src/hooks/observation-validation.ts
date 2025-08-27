import { defineHook, type HookDefinition, type HandlerContext } from '@atomic-fhir/core';

// Set default values for observations
const setDefaults = defineHook({
  name: 'observation-defaults',
  type: 'beforeCreate',
  resources: 'Observation',
  priority: 10,
  
  async handler(resource: any, context: HandlerContext): Promise<any> {
    // Ensure observation has a status
    if (!resource.status) {
      resource.status = 'preliminary';
    }
    
    // Ensure observation has an issued date
    if (!resource.issued) {
      resource.issued = new Date().toISOString();
    }
    
    // Validate that subject (patient) exists
    if (resource.subject?.reference) {
      const [resourceType, id] = resource.subject.reference.split('/');
      if (resourceType === 'Patient') {
        const patient = await context.storage?.read('Patient', id);
        if (!patient) {
          throw new Error(`Patient ${id} not found`);
        }
      }
    }
    
    // Validate code presence
    if (!resource.code) {
      throw new Error('Observation must have a code');
    }
    
    if (!resource.code.coding || resource.code.coding.length === 0) {
      throw new Error('Observation code must have at least one coding');
    }
    
    // Validate value for final observations
    if (resource.status === 'final') {
      const hasValue = resource.valueQuantity || 
                      resource.valueCodeableConcept || 
                      resource.valueString ||
                      resource.valueBoolean ||
                      resource.valueInteger ||
                      resource.valueRange ||
                      resource.valueRatio ||
                      resource.valueSampledData ||
                      resource.valueTime ||
                      resource.valueDateTime ||
                      resource.valuePeriod;
      
      if (!hasValue) {
        throw new Error('Final observation must have a value');
      }
    }
    
    return resource;
  }
});

// Check for critical values
const checkCriticalValues = defineHook({
  name: 'observation-critical-values',
  type: 'afterCreate',
  resources: 'Observation',
  priority: 5,
  
  async handler(resource: any, context: HandlerContext): Promise<void> {
    console.log(`Observation created: ${resource.code?.coding?.[0]?.display || resource.id}`);
    
    // Check for critical values
    if (resource.valueQuantity?.value) {
      const value = resource.valueQuantity.value;
      const code = resource.code?.coding?.[0]?.code;
      
      // Example: Check for critical glucose levels
      if (code === '2339-0' && (value < 70 || value > 200)) {
        console.log('⚠️  CRITICAL VALUE DETECTED - Glucose:', value);
        // Here you would trigger alerts, notifications, etc.
      }
    }
  }
});

// Track observation updates
const trackUpdates = defineHook({
  name: 'observation-track-updates',
  type: 'beforeUpdate',
  resources: 'Observation',
  priority: 5,
  
  async handler(resource: any, context: HandlerContext): Promise<any> {
    const previous = (context as any).previous;
    // Prevent changing the subject of an observation
    resource.subject = previous.subject;
    
    // Track status changes
    if (resource.status !== previous.status) {
      console.log(`Observation status changed from ${previous.status} to ${resource.status}`);
    }
    
    return resource;
  }
});

export default [
  setDefaults,
  checkCriticalValues,
  trackUpdates
];