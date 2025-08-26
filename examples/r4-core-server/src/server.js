import { Atomic } from '@atomic-fhir/core';

const app = new Atomic({
  server: {
    name: 'FHIR R4 Core Server',
  },
  
  // Package configuration - automatic download from registry
  packages: {
    list: [
      'hl7.fhir.r4.core@4.0.1' 
    ],
    // defaultRegistry: 'https://get-ig.org'
  },
  
});

await app.start();

console.log('🏥 FHIR R4 Core Server Started');
console.log('📦 Packages will be automatically downloaded on first run');
console.log('✅ Server includes all FHIR R4 Core definitions');
console.log('');
console.log('Available all FHIR R4 Core resources:');
console.log('  GET /metadata - Server capability statement');
console.log('  GET /Patient - Search patients');
console.log('  POST /Patient - Create patient');
console.log('  GET /Observation - Search observations');
console.log('  POST /Observation - Create observation');