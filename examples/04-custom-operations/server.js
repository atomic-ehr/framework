/**
 * Example 4: Custom FHIR Operations
 *
 * Demonstrates how to implement custom FHIR operations.
 */

import { FhirServer, FhirNotFoundError } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

// Custom operation: Patient/$summary
// Returns a summary of patient information
server.addHook({
  name: 'patient-summary-operation',
  phase: 'preHandler',
  priority: 100,
  handler: async (context) => {
    // Match URL pattern: /Patient/{id}/$summary
    const summaryMatch = context.url.match(/^\/Patient\/([^/]+)\/\$summary/);

    if (summaryMatch && context.method === 'GET') {
      const patientId = summaryMatch[1];

      // Get patient from storage
      const storage = server.getStorage();
      const result = await storage.read('Patient', patientId);

      if (!result.found) {
        throw new FhirNotFoundError('Patient', patientId);
      }

      const patient = result.resource;

      // Create summary bundle
      const summary = {
        resourceType: 'Bundle',
        type: 'collection',
        timestamp: new Date().toISOString(),
        entry: [
          {
            fullUrl: `http://localhost:3000/Patient/${patientId}`,
            resource: patient
          }
        ],
        // Add summary metadata
        meta: {
          tag: [{
            system: 'http://example.org/operations',
            code: 'summary',
            display: 'Patient Summary'
          }]
        }
      };

      // Set response
      context.setResponse({
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId
        },
        responseBody: summary,
        timing: {
          startTime: context.startTime,
          endTime: Date.now(),
          duration: Date.now() - context.startTime,
          hookDuration: 0
        }
      });

      // Take over response
      context.takeOver();

      console.log(`✓ Generated summary for Patient/${patientId}`);
    }

    return context;
  }
});

// Custom operation: Patient/$validate
// Validates a patient resource without saving
server.addHook({
  name: 'patient-validate-operation',
  phase: 'preHandler',
  priority: 100,
  handler: async (context) => {
    // Match URL pattern: /Patient/$validate
    if (context.url === '/Patient/$validate' && context.method === 'POST') {
      const patient = context.body;

      // Validate using server's validation bridge
      const result = await server.validateResource('Patient', patient);

      if (result.errors.length > 0) {
        // Return validation errors as OperationOutcome
        context.setResponse({
          statusCode: 200, // Validation operation returns 200 even with errors
          responseHeaders: {
            'Content-Type': 'application/fhir+json; charset=utf-8',
            'X-Request-ID': context.requestId
          },
          responseBody: {
            resourceType: 'OperationOutcome',
            issue: result.errors.map(error => ({
              severity: 'error',
              code: 'invalid',
              diagnostics: error.message,
              expression: error.path ? [error.path] : undefined
            }))
          },
          timing: {
            startTime: context.startTime,
            endTime: Date.now(),
            duration: Date.now() - context.startTime,
            hookDuration: 0
          }
        });
      } else {
        // Validation successful
        context.setResponse({
          statusCode: 200,
          responseHeaders: {
            'Content-Type': 'application/fhir+json; charset=utf-8',
            'X-Request-ID': context.requestId
          },
          responseBody: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'information',
              code: 'informational',
              diagnostics: 'Validation successful'
            }]
          },
          timing: {
            startTime: context.startTime,
            endTime: Date.now(),
            duration: Date.now() - context.startTime,
            hookDuration: 0
          }
        });
      }

      context.takeOver();
      console.log(`✓ Validated patient resource`);
    }

    return context;
  }
});

// Custom operation: /$stats
// Returns server statistics
server.addHook({
  name: 'server-stats-operation',
  phase: 'preHandler',
  priority: 100,
  handler: async (context) => {
    if (context.url === '/$stats' && context.method === 'GET') {
      const stats = server.getStats();
      const packages = server.getLoadedPackages();
      const resourceTypes = server.getSupportedResourceTypes();

      const statsResponse = {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'totalRequests',
            valueInteger: stats.totalRequests
          },
          {
            name: 'activeConnections',
            valueInteger: stats.activeConnections
          },
          {
            name: 'averageResponseTime',
            valueDecimal: stats.averageResponseTime
          },
          {
            name: 'errorRate',
            valueDecimal: stats.errorRate
          },
          {
            name: 'uptime',
            valueInteger: Date.now() - stats.uptime
          },
          {
            name: 'packagesLoaded',
            valueInteger: packages.length
          },
          {
            name: 'resourceTypes',
            valueInteger: resourceTypes.length
          }
        ]
      };

      context.setResponse({
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId
        },
        responseBody: statsResponse,
        timing: {
          startTime: context.startTime,
          endTime: Date.now(),
          duration: Date.now() - context.startTime,
          hookDuration: 0
        }
      });

      context.takeOver();
      console.log(`✓ Generated server statistics`);
    }

    return context;
  }
});

await server.start();

console.log('🚀 FHIR Server with custom operations running on http://localhost:3000');
console.log('\n✨ Custom Operations:');
console.log('  GET  /Patient/{id}/$summary  - Get patient summary');
console.log('  POST /Patient/$validate      - Validate patient without saving');
console.log('  GET  /$stats                 - Get server statistics');
console.log('\nTest commands:');
console.log('  # Create a patient first');
console.log('  curl -X POST http://localhost:3000/Patient \\');
console.log('    -H "Content-Type: application/fhir+json" \\');
console.log('    -d \'{"resourceType":"Patient","name":[{"family":"Doe","given":["John"]}]}\'');
console.log('\n  # Get patient summary (use ID from above)');
console.log('  curl http://localhost:3000/Patient/{id}/\\$summary');
console.log('\n  # Validate a patient');
console.log('  curl -X POST http://localhost:3000/Patient/\\$validate \\');
console.log('    -H "Content-Type: application/fhir+json" \\');
console.log('    -d \'{"resourceType":"Patient","gender":"invalid"}\'');
console.log('\n  # Get server stats');
console.log('  curl http://localhost:3000/\\$stats');