/**
 * Example demonstrating dynamic route generation from FHIR packages
 *
 * This example shows how the server automatically generates CRUD routes
 * for all resource types found in loaded FHIR packages.
 */

import { FhirServer, MemoryStorageAdapter } from '../src/index.js';

async function main() {
  console.log('Starting FHIR Server with dynamic route generation...\n');

  // Create server with R4 Core package
  const server = new FhirServer({
    port: 3000,
    host: 'localhost',

    // Load FHIR R4 Core package
    packages: ['hl7.fhir.r4.core#4.0.1'],

    // Package configuration
    packageConfig: {
      workingDir: process.cwd(),
      enableProgressLogging: true,
      autoLoadBaseResources: true,
      failOnPackageLoadError: false
    },

    // Enable dynamic route generation (enabled by default)
    enableDynamicRoutes: true,

    // Configure default capabilities for all resources
    defaultCapabilities: {
      read: true,
      vread: true,
      create: true,
      update: true,
      patch: true,
      delete: true,
      searchType: true,
      historyInstance: true,
      historyType: true
    },

    // Use in-memory storage
    storage: new MemoryStorageAdapter(),

    // Logging configuration
    logging: {
      level: 'info',
      format: 'text'
    },

    // Enable CORS for testing
    cors: {
      enabled: true,
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization']
    }
  });

  // Start the server
  await server.start();

  // Display server information
  console.log('\n' + '='.repeat(60));
  console.log('FHIR Server Started Successfully');
  console.log('='.repeat(60));
  console.log(`\nServer URL: http://localhost:3000`);
  console.log(`Metadata: http://localhost:3000/metadata`);

  // Display loaded packages
  const packages = server.getLoadedPackages();
  console.log(`\nLoaded Packages: ${packages.length}`);
  packages.forEach(pkg => {
    console.log(`  - ${pkg.name}#${pkg.version}`);
  });

  // Display supported resource types
  const resourceTypes = server.getSupportedResourceTypes();
  console.log(`\nSupported Resource Types: ${resourceTypes.length}`);
  console.log(`  ${resourceTypes.slice(0, 10).join(', ')}${resourceTypes.length > 10 ? ', ...' : ''}`);

  // Display dynamic routes
  const dynamicRoutes = server.getDynamicRoutes();
  console.log(`\nDynamic Routes Generated: ${dynamicRoutes.length}`);

  // Show example Patient routes
  const patientRoutes = dynamicRoutes.filter((r: any) =>
    r.pattern.includes('Patient') || r.description?.includes('Patient')
  );
  if (patientRoutes.length > 0) {
    console.log('\nExample Patient Routes:');
    patientRoutes.forEach((route: any) => {
      console.log(`  ${route.method.padEnd(6)} ${route.pattern.padEnd(40)} - ${route.operation}`);
    });
  }

  // Display example operations
  console.log('\n' + '='.repeat(60));
  console.log('Example Operations');
  console.log('='.repeat(60));
  console.log('\n1. Create a Patient:');
  console.log('   POST http://localhost:3000/Patient');
  console.log('   Body: { "resourceType": "Patient", "name": [{ "family": "Doe", "given": ["John"] }] }');

  console.log('\n2. Read a Patient:');
  console.log('   GET http://localhost:3000/Patient/{id}');

  console.log('\n3. Search Patients:');
  console.log('   GET http://localhost:3000/Patient?name=Doe');

  console.log('\n4. Update a Patient:');
  console.log('   PUT http://localhost:3000/Patient/{id}');

  console.log('\n5. Delete a Patient:');
  console.log('   DELETE http://localhost:3000/Patient/{id}');

  console.log('\n6. Get Patient history:');
  console.log('   GET http://localhost:3000/Patient/{id}/_history');

  console.log('\n' + '='.repeat(60));
  console.log('Storage: In-Memory (data will be lost on restart)');
  console.log('Press Ctrl+C to stop the server');
  console.log('='.repeat(60) + '\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await server.stop();
    console.log('Server stopped');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down server...');
    await server.stop();
    console.log('Server stopped');
    process.exit(0);
  });
}

// Run the example
main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});