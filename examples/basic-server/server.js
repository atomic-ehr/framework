import { Atomic } from '@atomic/framework';

// Create and configure the application
const app = new Atomic({
  server: {
    name: 'Basic FHIR Server Example',
    version: '0.1.0',
    url: 'http://localhost:3000'
  },
  storage: {
    adapter: 'sqlite',
    config: {
      database: './fhir-data.db'
    }
  },
  validation: {
    strict: true
  },
  autoload: {
    enabled: true  // Enable automatic discovery
  }
});

// Start the server with autoloading
// All resources, operations, and middleware in their respective folders
// will be automatically discovered and registered
app.start(3000);

console.log(`
🚀 Basic FHIR Server Example is running!

Try these endpoints:
- GET  http://localhost:3000/metadata           - Server capabilities
- POST http://localhost:3000/Patient           - Create a patient
- GET  http://localhost:3000/Patient           - Search patients
- GET  http://localhost:3000/Patient/{id}      - Read a patient
- POST http://localhost:3000/Patient/$match    - Match patients
`);