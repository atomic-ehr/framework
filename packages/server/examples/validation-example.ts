/**
 * Example demonstrating automatic FHIR validation
 *
 * This example shows how the validation bridge automatically validates
 * resources during create/update operations with proper FHIR OperationOutcome responses.
 */

import { FhirServer, MemoryStorageAdapter } from '../src/index.js';

async function main() {
  console.log('Starting FHIR Server with automatic validation...\n');

  // Create server with validation enabled
  const server = new FhirServer({
    port: 3000,
    host: 'localhost',

    // Load FHIR R4 Core package
    packages: ['hl7.fhir.r4.core#4.0.1'],

    packageConfig: {
      workingDir: process.cwd(),
      enableProgressLogging: true,
      autoLoadBaseResources: true
    },

    // Enable dynamic routes
    enableDynamicRoutes: true,

    // Configure validation (enabled by default)
    validation: {
      enabled: true,
      validateOnCreate: true,
      validateOnUpdate: true,
      validateOnPatch: true,
      strictMode: true,
      profileValidation: true
    },

    // Use in-memory storage
    storage: new MemoryStorageAdapter(),

    logging: {
      level: 'info',
      format: 'text'
    },

    cors: {
      enabled: true,
      origins: ['*']
    }
  });

  // Start the server
  await server.start();

  console.log('\n' + '='.repeat(60));
  console.log('FHIR Server with Validation Started');
  console.log('='.repeat(60));
  console.log(`\nServer URL: http://localhost:3000`);
  console.log(`Metadata: http://localhost:3000/metadata`);

  // Display validation configuration
  const validationBridge = server.getValidationBridge();
  if (validationBridge) {
    const config = validationBridge.getConfig();
    console.log('\nValidation Configuration:');
    console.log(`  Enabled: ${config.enabled}`);
    console.log(`  Validate on Create: ${config.validateOnCreate}`);
    console.log(`  Validate on Update: ${config.validateOnUpdate}`);
    console.log(`  Validate on Patch: ${config.validateOnPatch}`);
    console.log(`  Strict Mode: ${config.strictMode}`);
    console.log(`  Profile Validation: ${config.profileValidation}`);
  }

  // Display examples
  console.log('\n' + '='.repeat(60));
  console.log('Example Operations');
  console.log('='.repeat(60));

  console.log('\n1. Valid Patient (will succeed):');
  console.log(`   curl -X POST http://localhost:3000/Patient \\`);
  console.log(`     -H "Content-Type: application/fhir+json" \\`);
  console.log(`     -d '{`);
  console.log(`       "resourceType": "Patient",`);
  console.log(`       "name": [{"family": "Doe", "given": ["John"]}],`);
  console.log(`       "gender": "male"`);
  console.log(`     }'`);

  console.log('\n2. Invalid Patient - bad gender (will fail validation):');
  console.log(`   curl -X POST http://localhost:3000/Patient \\`);
  console.log(`     -H "Content-Type": application/fhir+json" \\`);
  console.log(`     -d '{`);
  console.log(`       "resourceType": "Patient",`);
  console.log(`       "gender": "invalid-value"`);
  console.log(`     }'`);

  console.log('\n3. Invalid Patient - wrong resourceType (will fail):');
  console.log(`   curl -X POST http://localhost:3000/Patient \\`);
  console.log(`     -H "Content-Type: application/fhir+json" \\`);
  console.log(`     -d '{`);
  console.log(`       "resourceType": "Observation",`);
  console.log(`       "name": [{"family": "Doe"}]`);
  console.log(`     }'`);

  console.log('\n4. Get validation metrics:');
  console.log(`   Check server.getValidationMetrics() for statistics`);

  // Set up interval to display metrics
  setInterval(() => {
    const metrics = server.getValidationMetrics();
    if (metrics && metrics.total > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('Validation Metrics:');
      console.log(`  Total Validations: ${metrics.total}`);
      console.log(`  Successful: ${metrics.successful} (${metrics.successRate.toFixed(1)}%)`);
      console.log(`  Failed: ${metrics.failed} (${metrics.failureRate.toFixed(1)}%)`);
      console.log(`  Average Time: ${metrics.averageTime.toFixed(2)}ms`);

      if (Object.keys(metrics.byResourceType).length > 0) {
        console.log('  By Resource Type:');
        for (const [type, count] of Object.entries(metrics.byResourceType)) {
          console.log(`    ${type}: ${count}`);
        }
      }

      if (Object.keys(metrics.errorCodes).length > 0) {
        console.log('  Error Codes:');
        for (const [code, count] of Object.entries(metrics.errorCodes)) {
          console.log(`    ${code}: ${count}`);
        }
      }
      console.log('-'.repeat(60));
    }
  }, 30000); // Every 30 seconds

  console.log('\n' + '='.repeat(60));
  console.log('Validation Features:');
  console.log('  ✓ Automatic schema validation on create/update/patch');
  console.log('  ✓ Profile validation when meta.profile is present');
  console.log('  ✓ Detailed FHIR OperationOutcome error responses');
  console.log('  ✓ Validation metrics and monitoring');
  console.log('  ✓ Configurable validation rules');
  console.log('\nPress Ctrl+C to stop the server');
  console.log('='.repeat(60) + '\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down server...');

    // Display final metrics
    const finalMetrics = server.getValidationMetrics();
    if (finalMetrics && finalMetrics.total > 0) {
      console.log('\nFinal Validation Statistics:');
      console.log(`  Total: ${finalMetrics.total}`);
      console.log(`  Success Rate: ${finalMetrics.successRate.toFixed(1)}%`);
      console.log(`  Failure Rate: ${finalMetrics.failureRate.toFixed(1)}%`);
      console.log(`  Average Time: ${finalMetrics.averageTime.toFixed(2)}ms`);
    }

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