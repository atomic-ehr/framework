import { defineHook } from '@atomic-fhir/core';

// US Core Vital Signs profile codes
const VITAL_SIGNS_CODES = {
  '85354-9': 'Blood pressure',
  '8867-4': 'Heart rate',
  '9279-1': 'Respiratory rate',
  '8310-5': 'Body temperature',
  '8302-2': 'Height',
  '29463-7': 'Weight',
  '39156-5': 'BMI',
  '59408-5': 'Oxygen saturation'
};

// Validate US Core Observation requirements
const validateObservation = defineHook({
  name: 'us-core-observation-validation',
  type: 'beforeCreate',
  resources: 'Observation',
  priority: 10,
  description: 'Validate US Core Observation requirements',
  
  async handler(resource, context) {
    // US Core Observation requires status, category, code, and subject
    if (!resource.status) {
      throw new Error('US Core Observation requires status');
    }
    
    if (!resource.category || resource.category.length === 0) {
      throw new Error('US Core Observation requires at least one category');
    }
    
    if (!resource.code) {
      throw new Error('US Core Observation requires code');
    }
    
    if (!resource.subject) {
      throw new Error('US Core Observation requires subject reference');
    }
    
    // Validate subject is a Patient
    if (!resource.subject.reference?.startsWith('Patient/')) {
      throw new Error('US Core Observation subject must reference a Patient');
    }
    
    // Check if this is a vital sign
    const loincCode = resource.code.coding?.find(c => c.system === 'http://loinc.org')?.code;
    if (loincCode && VITAL_SIGNS_CODES[loincCode]) {
      // Add vital signs category if not present
      const hasVitalCategory = resource.category.some(cat => 
        cat.coding?.some(c => 
          c.system === 'http://terminology.hl7.org/CodeSystem/observation-category' &&
          c.code === 'vital-signs'
        )
      );
      
      if (!hasVitalCategory) {
        resource.category.push({
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs'
          }]
        });
      }
      
      console.log(`Recording vital sign: ${VITAL_SIGNS_CODES[loincCode]}`);
    }
    
    // Set effective date if not provided
    if (!resource.effectiveDateTime && !resource.effectivePeriod) {
      resource.effectiveDateTime = new Date().toISOString();
    }
    
    // Validate value presence for final observations
    if (resource.status === 'final' && !resource.dataAbsentReason) {
      const hasValue = resource.valueQuantity || 
                      resource.valueCodeableConcept || 
                      resource.valueString ||
                      resource.valueBoolean ||
                      resource.valueInteger ||
                      resource.valueRange ||
                      resource.valueRatio;
      
      if (!hasValue) {
        throw new Error('Final observations must have a value or dataAbsentReason');
      }
    }
    
    return resource;
  }
});

// Check for critical vital signs
const checkCriticalValues = defineHook({
  name: 'us-core-critical-values',
  type: 'afterCreate',
  resources: 'Observation',
  priority: 5,
  description: 'Check for critical vital sign values',
  
  async handler(resource, context) {
    // Check for critical values
    const loincCode = resource.code.coding?.find(c => c.system === 'http://loinc.org')?.code;
    
    if (resource.valueQuantity?.value) {
      const value = resource.valueQuantity.value;
      let critical = false;
      
      // Check vital sign ranges
      switch (loincCode) {
        case '8867-4': // Heart rate
          if (value < 40 || value > 120) critical = true;
          break;
        case '9279-1': // Respiratory rate
          if (value < 8 || value > 30) critical = true;
          break;
        case '8310-5': // Body temperature (Celsius)
          if (value < 35 || value > 40) critical = true;
          break;
        case '59408-5': // Oxygen saturation
          if (value < 90) critical = true;
          break;
      }
      
      if (critical) {
        console.log(`⚠️  CRITICAL VITAL SIGN: ${VITAL_SIGNS_CODES[loincCode] || 'Unknown'} = ${value}`);
        // In production, trigger alerts/notifications
        // await context.storage.create('Task', createAlertTask(resource));
      }
    }
  }
});

// Track observation updates
const trackStatusChanges = defineHook({
  name: 'us-core-observation-updates',
  type: 'beforeUpdate',
  resources: 'Observation',
  priority: 5,
  description: 'Track observation status changes',
  
  async handler(resource, previous, context) {
    // Preserve original subject and code
    resource.subject = previous.subject;
    resource.code = previous.code;
    
    // Track status changes
    if (resource.status !== previous.status) {
      console.log(`Observation status changed from ${previous.status} to ${resource.status}`);
      
      // Add note about status change
      resource.note = resource.note || [];
      resource.note.push({
        text: `Status changed from ${previous.status} to ${resource.status}`,
        time: new Date().toISOString()
      });
    }
    
    return resource;
  }
});

export default [
  validateObservation,
  checkCriticalValues,
  trackStatusChanges
];