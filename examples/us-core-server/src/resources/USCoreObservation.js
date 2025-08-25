import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Observation',
  
  structureDefinition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab',
  
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
  }
  // All capabilities (create, read, update, delete, search, history) enabled by default
});