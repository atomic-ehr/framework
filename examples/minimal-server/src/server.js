import { Atomic } from '@atomic-fhir/core';

// Minimal configuration - autoload is enabled by default!
const app = new Atomic({
  server: {
    name: 'Minimal FHIR Server',
    port: 3002
  }
  // Autoload is enabled by default and uses src/ folders
});

// The framework automatically discovers and loads:
// 1. Resources from ./src/resources/
// 2. Operations from ./src/operations/
// 3. Middleware from ./src/middleware/
// 4. Hooks from ./src/hooks/
// 5. FHIR IG packages from ./packages/ (enabled by default)
console.log("---------------------");

app.start();

console.log(`
🚀 Basic FHIR Server Example is running!

Try these endpoints:
- GET  http://localhost:3002/metadata           - Server capabilities
- POST http://localhost:3002/Patient           - Create a patient
- GET  http://localhost:3002/Patient           - Search patients
- GET  http://localhost:3002/Patient/{id}      - Read a patient
- POST http://localhost:3002/Patient/$match    - Match patients
`);