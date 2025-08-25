import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient',
  
  // US Core Patient profile
  structureDefinition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
  
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
  }
  // All capabilities (create, read, update, delete, search, history) enabled by default
});