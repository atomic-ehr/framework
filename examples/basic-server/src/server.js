import { Atomic } from '@atomic/framework';

// Create and configure the application
const app = new Atomic({
  server: {
    name: 'Basic FHIR Server Example',
    version: '0.1.0',
    port: 3000,
    url: 'http://localhost:3000'
  }
  // Autoload is enabled by default and uses src/ folders
});

// Start the server
// Resources, operations, middleware, and packages are auto-discovered
app.start();

console.log(`
🚀 Basic FHIR Server Example is running!

Try these endpoints:
- GET  http://localhost:3000/metadata           - Server capabilities
- POST http://localhost:3000/Patient           - Create a patient
- GET  http://localhost:3000/Patient           - Search patients
- GET  http://localhost:3000/Patient/{id}      - Read a patient
- POST http://localhost:3000/Patient/$match    - Match patients
`);