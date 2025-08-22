import { Atomic } from '@atomic/framework';

// Create US Core compliant server
const app = new Atomic({
  server: {
    name: 'US Core FHIR Server',
    version: '0.1.0',
    url: 'http://localhost:3001',
    fhirVersion: '4.0.1'
  },
  storage: {
    adapter: 'sqlite',
    config: {
      database: './us-core-data.db'
    }
  },
  validation: {
    strict: true,
    profiles: ['us-core']
  },
  features: {
    bulkData: true,
    subscription: false,
    smartOnFhir: true
  },
  autoload: {
    enabled: true  // Auto-discover all components
  }
});

// Start server with autoloading
// The autoloader will discover and register:
// - All resources in ./resources/ (USCorePatient, USCoreObservation, USCorePractitioner)
// - All operations in ./operations/ (export, everything)  
// - All middleware in ./middleware/ (smart-auth, consent)
app.start(3001).then(() => {
  // Add US Core specific validation profiles after server starts
  app.validator.registerProfile('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient', {
    required: ['identifier', 'name', 'gender'],
    cardinalities: {
      identifier: { min: 1 },
      name: { min: 1 },
      telecom: { min: 0 },
      address: { min: 0 },
      communication: { min: 0 }
    },
    mustSupport: [
      'identifier',
      'identifier.system',
      'identifier.value',
      'name',
      'name.family',
      'name.given',
      'telecom',
      'telecom.system',
      'telecom.value',
      'telecom.use',
      'gender',
      'birthDate',
      'address',
      'address.line',
      'address.city',
      'address.state',
      'address.postalCode',
      'communication',
      'communication.language'
    ]
  });
});

console.log(`
🏥 US Core FHIR Server is running!

This server implements US Core IG requirements including:
- US Core Patient, Observation, and Practitioner profiles
- SMART on FHIR authentication
- Consent-based access control
- Bulk data export
- Patient $everything operation

Endpoints:
- GET  http://localhost:3001/metadata
- POST http://localhost:3001/Patient (US Core compliant)
- GET  http://localhost:3001/Patient/{id}/$everything
- POST http://localhost:3001/$export
`);