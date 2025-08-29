import { Atomic } from '@atomic-fhir/core';
import type { AtomicConfig } from '@atomic-fhir/core';
import {Module as ipsModule} from '@atomic-fhir/module-ips';

// Create server with basic configuration
const app = new Atomic({
  server: {
    name: 'IPS-Enabled FHIR Server',
    version: '1.0.0',
    fhirVersion: '4.0.1',
    port: 3010
  },
  modules: {
    "ips": new ipsModule({foo: "bar"})
  },
  // Start with base R4 Core package
  packages: [
    {
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    }
  ]
} satisfies AtomicConfig);

const server = await app.start();

console.log(`
🚀 IPS-Enabled FHIR Server running at http://localhost:3000

Available endpoints:
  - GET  /metadata                    - Server capabilities
  - GET  /Patient                     - Search patients
  - POST /Patient                     - Create patient
  - GET  /Patient/:id                 - Read patient
  - POST /Patient/:id/$summary        - Generate IPS document

The IPS module has been loaded with:
  - Base IPS profiles (hl7.fhir.uv.ips)
  - Injected US Core profiles (via dependency injection)
  - Custom $summary operation for generating IPS documents

Try:
  1. Create a Patient resource
  2. Generate an IPS summary: POST /Patient/{id}/$summary
`);