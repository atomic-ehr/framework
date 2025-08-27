import { Atomic, type AtomicConfig } from '@atomic-fhir/core';

const config: AtomicConfig = {
  server: {
    name: 'Custom Handlers FHIR Server',
  }
};

const app = new Atomic(config);

await app.start();

console.log('🎯 Custom Handlers Example Server');
console.log('📋 Test endpoints:');
console.log('   POST /Patient - Custom create with MRN generation');
console.log('   GET /Patient/:id - Custom read with audit logging');
console.log('   GET /Observation - Custom search with aggregation');
console.log('   POST /Encounter - Custom validation rules');
console.log('   GET /metadata - Server capabilities');