import { defineResource } from '@atomic/framework';

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

export default defineResource({
  resourceType: 'Observation',
  
  structureDefinition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab',
  
  hooks: {
    beforeCreate: async (resource, context) => {
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
      
      return resource;
    },
    
    afterCreate: async (resource, context) => {
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
          console.log(`⚠️  CRITICAL VITAL SIGN: ${VITAL_SIGNS_CODES[loincCode]} = ${value}`);
          // In production, trigger alerts/notifications
        }
      }
    },
    
    beforeUpdate: async (resource, previous, context) => {
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
  },
  
  searches: {
    'patient': {
      type: 'reference',
      path: 'subject',
      target: ['Patient'],
      documentation: 'The subject that the observation is about (US Core)'
    },
    'category': {
      type: 'token',
      path: 'category',
      documentation: 'The classification of the type of observation (US Core)'
    },
    'code': {
      type: 'token',
      path: 'code',
      documentation: 'The code of the observation type (US Core)'
    },
    'date': {
      type: 'date',
      path: 'effective',
      documentation: 'Obtained date/time (US Core)'
    },
    'status': {
      type: 'token',
      path: 'status',
      documentation: 'The status of the observation (US Core)'
    }
  },
  
  validators: {
    async validateUSCoreLab(observation) {
      // Check for required lab category
      const hasLabCategory = observation.category?.some(cat => 
        cat.coding?.some(c => 
          c.system === 'http://terminology.hl7.org/CodeSystem/observation-category' &&
          c.code === 'laboratory'
        )
      );
      
      const hasVitalCategory = observation.category?.some(cat => 
        cat.coding?.some(c => 
          c.system === 'http://terminology.hl7.org/CodeSystem/observation-category' &&
          c.code === 'vital-signs'
        )
      );
      
      if (!hasLabCategory && !hasVitalCategory) {
        console.warn('US Core Observation should have laboratory or vital-signs category');
      }
      
      // Validate LOINC code if present
      const loincCoding = observation.code?.coding?.find(c => 
        c.system === 'http://loinc.org'
      );
      
      if (loincCoding && !loincCoding.display) {
        console.warn('LOINC codes should include display text');
      }
      
      // Validate value presence for final observations
      if (observation.status === 'final' && !observation.dataAbsentReason) {
        const hasValue = observation.valueQuantity || 
                        observation.valueCodeableConcept || 
                        observation.valueString ||
                        observation.valueBoolean ||
                        observation.valueInteger ||
                        observation.valueRange ||
                        observation.valueRatio;
        
        if (!hasValue) {
          throw new Error('Final observations must have a value or dataAbsentReason');
        }
      }
    }
  }
});