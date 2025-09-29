/**
 * Example: Comprehensive Error Handling
 *
 * This example demonstrates:
 * 1. FHIR-compliant error responses with OperationOutcome
 * 2. Request/response logging
 * 3. Error metrics collection
 * 4. Development debug mode
 * 5. Custom error handling hooks
 */

import {
  FhirServer,
  FhirNotFoundError,
  FhirValidationError,
  FhirUnauthorizedError
} from '../src/index.js';

async function main() {
  console.log('Starting FHIR Server with Comprehensive Error Handling...\n');

  // Create server with full error handling configuration
  const server = new FhirServer({
    port: 3000,
    host: 'localhost',
    serverName: 'error-handling-demo',
    serverVersion: '1.0.0',
    description: 'FHIR Server with Comprehensive Error Handling',
    packages: ['hl7.fhir.r4.core#4.0.1'],
    packageConfig: {
      registryUrls: ['https://packages.fhir.org'],
      enableProgressLogging: false // Less noise for this example
    },
    enableDynamicRoutes: true,

    // Error handling configuration
    errorHandling: {
      includeStackTrace: false, // Set to true in development
      logErrors: true,
      logLevel: 'error',
      sanitizeErrors: true,
      detailedValidationErrors: true,
      enableErrorMetrics: true
    },

    // Request/response logging
    requestLogging: {
      logRequests: true,
      logResponses: true,
      logBodies: false, // Set to true for debugging
      logHeaders: true,
      slowRequestThreshold: 1000, // 1 second
      sanitizeHeaders: ['authorization', 'cookie']
    },

    // Enable debug mode
    debug: true, // Set to false in production

    logging: {
      level: 'info',
      format: 'text'
    }
  });

  // Add custom error handling hook
  server.addHook({
    name: 'custom-error-handler',
    phase: 'onError',
    priority: 50, // Lower priority than default error handler
    handler: async (context: any) => {
      // Custom error processing
      console.log('\n🔴 Custom Error Handler:', {
        errorName: context.error.name,
        errorMessage: context.error.message,
        resourceType: context.resourceType,
        operation: context.operation
      });

      // Don't handle - let default handler process it
      return context;
    }
  });

  // Add a hook that demonstrates error throwing
  server.addHook({
    name: 'auth-check',
    phase: 'preHandler',
    priority: 90,
    handler: async (context: any) => {
      // Simulate authentication check
      const authHeader = context.headers.authorization || context.headers.Authorization;

      // Example: require auth for write operations
      if (['create', 'update', 'delete', 'patch'].includes(context.operation)) {
        if (!authHeader) {
          throw new FhirUnauthorizedError('Authentication required for write operations');
        }
      }

      return context;
    }
  });

  // Start the server
  await server.start();

  console.log('\n✅ Server started successfully!\n');
  console.log('🌐 Endpoints:');
  console.log('   - GET http://localhost:3000/Patient/{id} - Read Patient (404 if not found)');
  console.log('   - POST http://localhost:3000/Patient - Create Patient (422 for validation errors)');
  console.log('   - GET http://localhost:3000/metadata - Capability Statement');

  console.log('\n\n📝 Testing Error Responses:');
  console.log('\n1. Test 404 Not Found:');
  console.log('   curl http://localhost:3000/Patient/non-existent-id');
  console.log('\n   Expected: 404 with OperationOutcome');

  console.log('\n2. Test 422 Validation Error (invalid gender):');
  console.log('   curl -X POST http://localhost:3000/Patient \\');
  console.log('        -H "Content-Type: application/fhir+json" \\');
  console.log('        -d \'{"resourceType":"Patient","gender":"invalid"}\'');
  console.log('\n   Expected: 422 with detailed validation error');

  console.log('\n3. Test 401 Unauthorized (create without auth):');
  console.log('   curl -X POST http://localhost:3000/Patient \\');
  console.log('        -H "Content-Type: application/fhir+json" \\');
  console.log('        -d \'{"resourceType":"Patient"}\'');
  console.log('\n   Expected: 401 with security error');

  console.log('\n4. Test 400 Bad Request (invalid JSON):');
  console.log('   curl -X POST http://localhost:3000/Patient \\');
  console.log('        -H "Content-Type": application/fhir+json" \\');
  console.log('        -d \'{invalid json}\'');
  console.log('\n   Expected: 400 with invalid request error');

  console.log('\n5. Test successful request:');
  console.log('   curl -X POST http://localhost:3000/Patient \\');
  console.log('        -H "Content-Type: application/fhir+json" \\');
  console.log('        -H "Authorization: Bearer demo-token" \\');
  console.log('        -d \'{"resourceType":"Patient","gender":"male"}\'');
  console.log('\n   Expected: 201 Created');

  console.log('\n\n📊 Error Metrics:');
  console.log('   Access error metrics: server.getErrorMetrics()');

  // Set up interval to display error metrics
  setInterval(() => {
    const metrics = server.getErrorMetrics();
    if (metrics && metrics.totalErrors > 0) {
      console.log('\n📊 Current Error Metrics:');
      console.log(`   Total Errors: ${metrics.totalErrors}`);
      console.log(`   Last Error: ${metrics.lastErrorTime || 'N/A'}`);

      if (metrics.topErrors.length > 0) {
        console.log('\n   Top Errors:');
        metrics.topErrors.forEach(({ type, count }) => {
          console.log(`     - ${type}: ${count}`);
        });
      }

      if (metrics.statusCodeDistribution.length > 0) {
        console.log('\n   Status Code Distribution:');
        metrics.statusCodeDistribution.forEach(({ statusCode, count }) => {
          console.log(`     - ${statusCode}: ${count}`);
        });
      }
    }
  }, 30000); // Every 30 seconds

  console.log('\n\n✨ Error Handling Features:');
  console.log('   ✓ FHIR OperationOutcome responses');
  console.log('   ✓ Request/response logging');
  console.log('   ✓ Error metrics collection');
  console.log('   ✓ Development debug mode');
  console.log('   ✓ Stack trace in development');
  console.log('   ✓ Sanitized errors in production');
  console.log('   ✓ Performance monitoring');
  console.log('   ✓ Slow request detection');
  console.log('   ✓ Custom error hooks');
  console.log('   ✓ Enhanced validation errors');

  console.log('\n\n💡 Error Response Format:');
  console.log('   All errors return FHIR OperationOutcome:');
  console.log('   {');
  console.log('     "resourceType": "OperationOutcome",');
  console.log('     "issue": [{');
  console.log('       "severity": "error",');
  console.log('       "code": "not-found",');
  console.log('       "diagnostics": "Patient/123 not found",');
  console.log('       "location": ["Patient/123"]');
  console.log('     }]');
  console.log('   }');

  console.log('\n\n🔍 Debug Headers:');
  console.log('   - X-Request-ID: Unique request identifier');
  console.log('   - X-Response-Time: Request duration in ms');
  console.log('   - X-Error-Type: Error class name (in error responses)');

  console.log('\n\nPress Ctrl+C to stop the server and see final metrics\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down server...');

    // Display final error metrics
    const finalMetrics = server.getErrorMetrics();
    if (finalMetrics) {
      console.log('\n📊 Final Error Metrics:');
      console.log(`   Total Errors: ${finalMetrics.totalErrors}`);
      console.log(`   Error Rate: ${finalMetrics.errorRate.toFixed(2)}%`);

      if (finalMetrics.topErrors.length > 0) {
        console.log('\n   Error Type Breakdown:');
        finalMetrics.topErrors.forEach(({ type, count }) => {
          console.log(`     - ${type}: ${count}`);
        });
      }

      if (finalMetrics.statusCodeDistribution.length > 0) {
        console.log('\n   HTTP Status Code Distribution:');
        finalMetrics.statusCodeDistribution.forEach(({ statusCode, count }) => {
          const statusText = getStatusText(statusCode);
          console.log(`     - ${statusCode} (${statusText}): ${count}`);
        });
      }

      if (finalMetrics.resourceTypeErrors.length > 0) {
        console.log('\n   Errors by Resource Type:');
        finalMetrics.resourceTypeErrors.forEach(({ resourceType, count }) => {
          console.log(`     - ${resourceType}: ${count}`);
        });
      }
    }

    await server.stop();
    console.log('\n✅ Server stopped');
    process.exit(0);
  });
}

/**
 * Get HTTP status text
 */
function getStatusText(code: number): string {
  const statusTexts: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    503: 'Service Unavailable'
  };
  return statusTexts[code] || 'Unknown';
}

// Run the example
main().catch(error => {
  console.error('❌ Error running example:', error);
  process.exit(1);
});