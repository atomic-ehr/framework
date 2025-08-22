import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Observation',
  
  hooks: {
    beforeCreate: async (resource, context) => {
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
      
      return resource;
    },
    
    afterCreate: async (resource, context) => {
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
    },
    
    beforeUpdate: async (resource, previous, context) => {
      // Prevent changing the subject of an observation
      resource.subject = previous.subject;
      
      // Track status changes
      if (resource.status !== previous.status) {
        console.log(`Observation status changed from ${previous.status} to ${resource.status}`);
      }
      
      return resource;
    }
  },
  
  searches: {
    'patient': {
      type: 'reference',
      path: 'subject',
      target: ['Patient'],
      documentation: 'Search by patient reference'
    },
    'code': {
      type: 'token',
      path: 'code',
      documentation: 'Search by observation code'
    },
    'date': {
      type: 'date',
      path: 'effectiveDateTime',
      documentation: 'Search by observation date'
    },
    'value-quantity': {
      type: 'quantity',
      path: 'valueQuantity',
      documentation: 'Search by observation value'
    }
  },
  
  validators: {
    async validateCode(observation) {
      if (!observation.code) {
        throw new Error('Observation must have a code');
      }
      
      if (!observation.code.coding || observation.code.coding.length === 0) {
        throw new Error('Observation code must have at least one coding');
      }
    },
    
    async validateValue(observation) {
      // At least one value type should be present
      const hasValue = observation.valueQuantity || 
                      observation.valueCodeableConcept || 
                      observation.valueString ||
                      observation.valueBoolean ||
                      observation.valueInteger ||
                      observation.valueRange ||
                      observation.valueRatio ||
                      observation.valueSampledData ||
                      observation.valueTime ||
                      observation.valueDateTime ||
                      observation.valuePeriod;
      
      if (!hasValue && observation.status === 'final') {
        throw new Error('Final observation must have a value');
      }
    }
  }
});