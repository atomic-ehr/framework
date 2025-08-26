import { Atomic } from '@atomic-fhir/core';

const app = new Atomic({
  server: {
    name: 'Custom Handlers FHIR Server',
  }
});

await app.start();

console.log('🎯 Custom Handlers Example Server');
console.log('📋 Test endpoints:');
console.log('   POST /Patient - Custom create with MRN generation');
console.log('   GET /Patient/:id - Custom read with audit logging');
console.log('   GET /Observation - Custom search with aggregation');
console.log('   POST /Encounter - Custom validation rules');
console.log('   GET /metadata - Server capabilities');