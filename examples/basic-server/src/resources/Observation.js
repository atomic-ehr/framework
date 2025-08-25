import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Observation',
  
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
  }
  // All capabilities (create, read, update, delete, search, history) enabled by default
});