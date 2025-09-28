/**
 * Comprehensive demonstration of FHIR routing capabilities
 */

import { FhirServer, FhirOperation, FhirUrlPattern, RouteHelpers } from '../src/index.js';

async function createFhirRoutingDemo() {
  console.log('🚀 FHIR Routing Demonstration Server');
  console.log('=====================================');

  // Create server with enhanced configuration
  const server = new FhirServer({
    port: 3001,
    host: 'localhost',
    cors: {
      enabled: true,
      origins: ['http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Accept', 'X-Request-ID']
    },
    logging: {
      level: 'info',
      format: 'text'
    },
    timeout: 30000
  });

  // Add comprehensive routing logging hook
  server.addHook({
    name: 'routing-logger',
    phase: 'preHandler',
    priority: 200,
    handler: async (context: any) => {
      const { operation, resourceType, params, level, operationName } = context;

      let logMessage = `🔗 [ROUTING] ${operation}`;

      if (level === 'system') {
        logMessage += ' (system-level)';
        if (operationName) {
          logMessage += ` - Operation: $${operationName}`;
        }
      } else if (level === 'type') {
        logMessage += ` (${resourceType})`;
        if (operationName) {
          logMessage += ` - Operation: $${operationName}`;
        }
      } else if (level === 'instance') {
        logMessage += ` (${resourceType}/${params.id})`;
        if (params.vid) {
          logMessage += ` version ${params.vid}`;
        }
        if (operationName) {
          logMessage += ` - Operation: $${operationName}`;
        }
      }

      console.log(logMessage);

      // Log query parameters if present
      if (context.query && Object.keys(context.query).length > 0) {
        console.log(`   📋 Query params:`, context.query);
      }
    }
  });

  // Add validation hooks for different resource types
  server.addHook({
    name: 'patient-validation',
    phase: 'preHandler',
    priority: 100,
    resources: 'Patient',
    handler: async (context: any) => {
      if (context.operation === FhirOperation.CREATE && context.body) {
        console.log('🏥 [VALIDATION] Validating Patient resource...');

        const patient = context.body;
        if (!patient.name || !patient.name[0]?.family) {
          throw new Error('Patient must have a family name');
        }

        console.log('✅ [VALIDATION] Patient validation passed');
      }
    }
  });

  server.addHook({
    name: 'observation-validation',
    phase: 'preHandler',
    priority: 100,
    resources: 'Observation',
    handler: async (context: any) => {
      if (context.operation === FhirOperation.CREATE && context.body) {
        console.log('🔬 [VALIDATION] Validating Observation resource...');

        const observation = context.body;
        if (!observation.status) {
          throw new Error('Observation must have a status');
        }
        if (!observation.code) {
          throw new Error('Observation must have a code');
        }

        console.log('✅ [VALIDATION] Observation validation passed');
      }
    }
  });

  // Add operation-specific logging
  server.addHook({
    name: 'operation-specific-logger',
    phase: 'onResponse',
    priority: 100,
    handler: async (context: any) => {
      const { operation, resourceType, params, statusCode } = context;

      let emoji = '📄';
      let action = '';

      switch (operation) {
        case FhirOperation.READ:
          emoji = '👁️';
          action = 'Read';
          break;
        case FhirOperation.CREATE:
          emoji = '➕';
          action = 'Create';
          break;
        case FhirOperation.UPDATE:
          emoji = '✏️';
          action = 'Update';
          break;
        case FhirOperation.DELETE:
          emoji = '🗑️';
          action = 'Delete';
          break;
        case FhirOperation.SEARCH_TYPE:
          emoji = '🔍';
          action = 'Search';
          break;
        case FhirOperation.CAPABILITIES:
          emoji = '⚙️';
          action = 'Capabilities';
          break;
        case FhirOperation.OPERATION:
          emoji = '🔧';
          action = 'Custom Operation';
          break;
        case FhirOperation.BATCH:
          emoji = '📦';
          action = 'Batch';
          break;
        default:
          action = operation;
      }

      console.log(`${emoji} [${action.toUpperCase()}] ${statusCode} - ${resourceType || 'System'} ${params.id || ''}`);
    }
  });

  // Add custom operation demonstration
  server.addHook({
    name: 'custom-operation-demo',
    phase: 'preHandler',
    priority: 150,
    handler: async (context: any) => {
      if (context.operation === FhirOperation.OPERATION) {
        const { operationName, level, resourceType, params } = context;

        // Demonstrate handling of $validate operation
        if (operationName === 'validate') {
          console.log(`🔧 [CUSTOM-OP] Handling $validate operation at ${level} level`);

          if (level === 'system') {
            console.log('   Validating system configuration...');
          } else if (level === 'type') {
            console.log(`   Validating ${resourceType} resource type...`);
          } else if (level === 'instance') {
            console.log(`   Validating ${resourceType}/${params.id}...`);
          }

          // Override response for demonstration
          context.setResponse({
            statusCode: 200,
            responseHeaders: {
              'Content-Type': 'application/fhir+json',
              'X-Request-ID': context.requestId
            },
            responseBody: {
              resourceType: 'OperationOutcome',
              issue: [{
                severity: 'information',
                code: 'informational',
                diagnostics: `$validate operation completed successfully at ${level} level`
              }]
            }
          });
          context.takeOver();
          return;
        }

        // Demonstrate $everything operation
        if (operationName === 'everything') {
          console.log(`🔧 [CUSTOM-OP] Handling $everything operation for ${resourceType}/${params.id}`);

          context.setResponse({
            statusCode: 200,
            responseHeaders: {
              'Content-Type': 'application/fhir+json',
              'X-Request-ID': context.requestId
            },
            responseBody: {
              resourceType: 'Bundle',
              type: 'searchset',
              total: 1,
              entry: [{
                resource: {
                  resourceType: resourceType,
                  id: params.id,
                  meta: {
                    lastUpdated: new Date().toISOString()
                  }
                }
              }]
            }
          });
          context.takeOver();
          return;
        }
      }
    }
  });

  // Add search parameter demonstration
  server.addHook({
    name: 'search-demo',
    phase: 'preHandler',
    priority: 150,
    handler: async (context: any) => {
      if (context.operation === FhirOperation.SEARCH_TYPE || context.operation === FhirOperation.SEARCH_SYSTEM) {
        const { query, resourceType } = context;

        // Demonstrate search parameter handling
        if (query && Object.keys(query).length > 0) {
          console.log(`🔍 [SEARCH] Searching ${resourceType || 'all resources'} with parameters:`);

          for (const [param, value] of Object.entries(query)) {
            if (!param.startsWith('_')) {
              console.log(`   ${param} = ${value}`);
            }
          }

          // Create a mock search result
          const mockResult = {
            resourceType: 'Bundle',
            type: 'searchset',
            total: 0,
            entry: [],
            link: [{
              relation: 'self',
              url: context.url
            }]
          };

          context.setResponse({
            statusCode: 200,
            responseHeaders: {
              'Content-Type': 'application/fhir+json',
              'X-Request-ID': context.requestId
            },
            responseBody: mockResult
          });
          context.takeOver();
        }
      }
    }
  });

  // Setup comprehensive event logging
  server.on('server:starting', () => {
    console.log('🔄 Server is starting...');
  });

  server.on('server:started', () => {
    console.log('✅ FHIR Server with routing started successfully!');
    console.log('');
    console.log('📡 Available FHIR Endpoints:');
    console.log('');
    console.log('   🏥 PATIENT OPERATIONS:');
    console.log('     GET  http://localhost:3001/Patient/123         - Read patient');
    console.log('     GET  http://localhost:3001/Patient/123/_history/1 - Read patient version');
    console.log('     POST http://localhost:3001/Patient             - Create patient');
    console.log('     PUT  http://localhost:3001/Patient/123         - Update patient');
    console.log('     DELETE http://localhost:3001/Patient/123       - Delete patient');
    console.log('     GET  http://localhost:3001/Patient?name=john   - Search patients');
    console.log('     GET  http://localhost:3001/Patient/_history    - Patient history');
    console.log('');
    console.log('   🔬 OBSERVATION OPERATIONS:');
    console.log('     GET  http://localhost:3001/Observation/456     - Read observation');
    console.log('     POST http://localhost:3001/Observation         - Create observation');
    console.log('     GET  http://localhost:3001/Observation?patient=123 - Search observations');
    console.log('');
    console.log('   ⚙️  SYSTEM OPERATIONS:');
    console.log('     GET  http://localhost:3001/metadata            - Server capabilities');
    console.log('     GET  http://localhost:3001/?_type=Patient      - System search');
    console.log('     GET  http://localhost:3001/_history            - System history');
    console.log('     POST http://localhost:3001/                    - Batch operations');
    console.log('');
    console.log('   🔧 CUSTOM OPERATIONS:');
    console.log('     POST http://localhost:3001/$validate           - System validate');
    console.log('     POST http://localhost:3001/Patient/$validate   - Type validate');
    console.log('     POST http://localhost:3001/Patient/123/$validate - Instance validate');
    console.log('     POST http://localhost:3001/Patient/123/$everything - Everything operation');
    console.log('');
    console.log('🎯 Try these example requests:');
    console.log('   curl http://localhost:3001/metadata');
    console.log('   curl http://localhost:3001/Patient/123');
    console.log('   curl "http://localhost:3001/Patient?name=john&gender=male"');
    console.log('   curl -X POST http://localhost:3001/Patient/$validate');
    console.log('');
  });

  server.on('request:received', (data) => {
    console.log(`📨 [REQUEST] ${data.data.method} ${data.data.url}`);
  });

  server.on('request:completed', (data) => {
    const duration = data.data.duration;
    const status = data.data.statusCode;

    let statusIcon = '✅';
    if (status >= 400 && status < 500) {
      statusIcon = '⚠️';
    } else if (status >= 500) {
      statusIcon = '❌';
    }

    console.log(`${statusIcon} [RESPONSE] ${status} in ${duration}ms`);
  });

  server.on('request:error', (data) => {
    console.log(`❌ [ERROR] ${data.data.error}`);
  });

  // Start the server
  try {
    await server.start();

    // Display router statistics periodically
    setInterval(() => {
      const stats = server.getRouter().getStats();
      console.log('');
      console.log('📊 [ROUTER STATS]');
      console.log(`   Total routes: ${stats.totalRoutes}`);
      console.log(`   Total matches: ${stats.totalMatches}`);
      console.log(`   Success rate: ${stats.totalMatches > 0 ?
        Math.round((stats.successfulMatches / stats.totalMatches) * 100) : 0}%`);
      console.log(`   Average match time: ${stats.averageMatchTime.toFixed(2)}ms`);

      if (stats.popularRoutes.length > 0) {
        console.log('   Popular routes:');
        stats.popularRoutes.slice(0, 3).forEach(route => {
          console.log(`     ${route.route} (${route.count} hits)`);
        });
      }
      console.log('');
    }, 30000); // Every 30 seconds

    // Setup graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\\n🛑 Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\\n🛑 Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    console.log('🎯 Server running. Press Ctrl+C to stop.');

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Run the demo
createFhirRoutingDemo().catch(console.error);