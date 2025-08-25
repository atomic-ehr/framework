import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Practitioner',
  
  structureDefinition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-practitioner',
  
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
  }
  // All capabilities (create, read, update, delete, search, history) enabled by default
});