import { Atomic, defineResource, defineOperation, defineMiddleware, type AtomicConfig, type ResourceDefinition, type OperationDefinition, type MiddlewareDefinition, type HandlerContext } from '@atomic-fhir/core';

// Example of manual registration (disabling autoload)
const config: AtomicConfig = {
  server: {
    name: 'Manual Registration Server',
    version: '0.1.0',
    port: 3005
  },
  // Explicitly disable autoload
  autoload: false,
  packages: false
};

const app = new Atomic(config);

// Manually define and register a resource
const PatientResource = defineResource({
  resourceType: 'Patient',
  hooks: {
    beforeCreate: async (resource: any) => {
      console.log('Creating patient (manual registration)');
      return resource;
    }
  }
});

// Manually define and register an operation
const pingOperation = defineOperation({
  name: 'ping',
  system: true,
  async handler(): Promise<any> {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'information',
        code: 'informational',
        details: { text: 'Pong from manual server!' }
      }]
    };
  }
});

// Manually define and register middleware
const loggingMiddleware = defineMiddleware({
  name: 'manual-logger',
  async before(req: Request, context: HandlerContext): Promise<Request | void> {
    console.log(`[Manual] ${req.method} ${req.url}`);
  }
});

// Register components manually
app.registerResource('Patient', PatientResource);
app.registerOperation(pingOperation);
// app.registerMiddleware(loggingMiddleware); // Middleware registration may not be implemented

// Start server
app.start();

console.log(`
📝 Manual Registration Server is running!

This server demonstrates explicit component registration.
Autoload is disabled, so only manually registered components are available.

Try:
- POST http://localhost:3005/Patient
- POST http://localhost:3005/$ping
`);