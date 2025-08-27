import { Atomic } from '@atomic-fhir/core';

const app = new Atomic({
  server: {
    name: 'US Core v8.0.0 FHIR Server',
    port: 3008
  },
  
  // Package configuration demonstrating both methods
  packages: [
    // Using npmRegistry (get-ig.org)
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org' 
    },
    // Using direct URL download  
    {
      package: 'hl7.fhir.us.core',
      version: '8.0.0',
      remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/8.0.0'
    }
  ]
});

await app.start();

console.log('🏥 US Core v8.0.0 FHIR Server Started');
console.log('📦 Demonstrates both npmRegistry and remoteUrl package downloads');
console.log('✅ Server includes FHIR R4 Core + US Core v8.0.0 profiles');
console.log('');
console.log('Available endpoints:');
console.log('  GET /metadata - Server capability statement');
console.log('  GET /Patient - Search US Core patients');