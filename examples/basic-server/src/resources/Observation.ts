import { defineResource, type ResourceDefinition } from '@atomic-fhir/core';

export default defineResource({
  resourceType: 'Observation',
  
  searches: {
    'patient': {
      name: 'patient',
      type: 'reference',
      path: 'subject',
      documentation: 'Search by patient reference'
    },
    'code': {
      name: 'code',
      type: 'token',
      path: 'code',
      documentation: 'Search by observation code'
    },
    'date': {
      name: 'date',
      type: 'date',
      path: 'effectiveDateTime',
      documentation: 'Search by observation date'
    },
    'value-quantity': {
      name: 'value-quantity',
      type: 'quantity',
      path: 'valueQuantity',
      documentation: 'Search by observation value'
    }
  }
  // All capabilities (create, read, update, delete, search, history) enabled by default
} as ResourceDefinition);