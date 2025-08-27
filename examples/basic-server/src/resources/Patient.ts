import { defineResource, type ResourceDefinition } from '@atomic-fhir/core';

export default defineResource({
  resourceType: 'Patient',
  
  // Custom search parameters
  searches: {
    'mrn': {
      name: 'mrn',
      type: 'token',
      path: 'identifier',
      documentation: 'Search by Medical Record Number'
    },
    'age': {
      name: 'age',
      type: 'number',
      path: 'birthDate',
      documentation: 'Search by calculated age'
    }
  }
  // All capabilities (create, read, update, delete, search, history) enabled by default
} as ResourceDefinition);