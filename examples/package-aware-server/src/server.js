import { Atomic } from '@atomic-fhir/core';

// Server that uses FHIR packages
const app = new Atomic({
  server: {
    name: 'Package-Aware FHIR Server',
    version: '0.1.0',
    port: 3004,
    url: 'http://localhost:3004'
  }
  // Autoload is enabled by default and uses src/ folders
  // Packages are enabled by default at ./packages/
});

// Start server - packages will be loaded automatically
app.start().then(() => {
  console.log(`
📦 Package-Aware FHIR Server is running!

This server loads FHIR IG packages and makes their resources available:
- StructureDefinitions for validation
- OperationDefinitions for reference
- ValueSets for terminology validation
- CodeSystems for coding validation

Loaded packages:
${Array.from(app.packageManager.packages.keys()).map(p => `  - ${p}`).join('\n') || '  (none)'}

Try these endpoints:
- GET  http://localhost:3004/metadata
- POST http://localhost:3004/Patient
`);
});