import { Atomic, type AtomicConfig } from '@atomic-fhir/core';

const config: AtomicConfig = {
  server: {
    name: 'FHIR R4 Core Server',
  },
  
  // Package configuration - using new format with explicit registry
  packages: [
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org' 
    },
    { 
      package: 'hl7.fhir.us.core',
      version: '7.0.0',
      remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/7.0.0' 
    },
  ]
};

const app = new Atomic(config);


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