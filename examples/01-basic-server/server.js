/**
 * Example 1: Basic FHIR Server
 *
 * This is the simplest possible FHIR server.
 * Just 10 lines of code to get a fully functional FHIR R4 server!
 */

import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

await server.start();

console.log('🚀 Basic FHIR Server running on http://localhost:3000');
console.log('📊 Try: http://localhost:3000/metadata');
console.log('\nTest commands:');
console.log('  curl http://localhost:3000/metadata');
console.log('  curl http://localhost:3000/Patient');