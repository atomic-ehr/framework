/**
 * Example 1: Simple FHIR Server
 *
 * The absolute minimum to get a FHIR server running with:
 * - Automatic FHIR R4 Core resource support
 * - Built-in validation
 * - /metadata endpoint
 * - Full CRUD operations
 */

import { FhirServer } from '@atomic-ehr/server';

// Create and start the server in 3 lines!
const server = new FhirServer({
  port: 3000,
  serverName: 'Simple FHIR Server',
  description: 'Minimal FHIR R4 server with built-in capabilities',

  // Optional: Load FHIR R4 Core package for base resources
  packages: ['hl7.fhir.r4.core#4.0.1'],

  // Optional: Enable validation (enabled by default)
  validation: {
    enabled: true,
    validateOnCreate: true,
    validateOnUpdate: true,
  },

  // Optional: Configure logging
  logging: {
    level: 'info',
    format: 'text'
  }
});

// Start the server
await server.start();

console.log('✅ FHIR Server running on http://localhost:3000');
console.log('');
console.log('Try these endpoints:');
console.log('  📋 GET  http://localhost:3000/metadata - Server capabilities');
console.log('  👤 POST http://localhost:3000/Patient - Create a patient');
console.log('  🔍 GET  http://localhost:3000/Patient - Search patients');
console.log('');
console.log('Press Ctrl+C to stop');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await server.stop();
  process.exit(0);
});

/**
 * Example requests:
 *
 * 1. Get server metadata:
 *    curl http://localhost:3000/metadata
 *
 * 2. Create a patient:
 *    curl -X POST http://localhost:3000/Patient \
 *      -H "Content-Type: application/fhir+json" \
 *      -d '{
 *        "resourceType": "Patient",
 *        "name": [{"family": "Doe", "given": ["John"]}],
 *        "gender": "male",
 *        "birthDate": "1990-01-01"
 *      }'
 *
 * 3. Search patients:
 *    curl http://localhost:3000/Patient
 *
 * 4. Get specific patient:
 *    curl http://localhost:3000/Patient/{id}
 */
