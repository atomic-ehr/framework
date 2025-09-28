/**
 * Demonstration server showing @atomic-ehr/server integration with hooks
 */

import { FhirServer } from '../src/index.js';

async function createDemoServer() {
  console.log('🚀 Creating Atomic EHR FHIR Server Demo');

  // Create server with configuration
  const server = new FhirServer({
    port: 3000,
    host: 'localhost',
    cors: {
      enabled: true,
      origins: ['http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Accept']
    },
    logging: {
      level: 'info',
      format: 'text'
    },
    timeout: 30000,
    maxBodySize: 10 * 1024 * 1024 // 10MB
  });

  // Register authentication hook
  server.addHook({
    name: 'basic-auth',
    phase: 'preRequest',
    priority: 200, // High priority - runs early
    handler: async (context: any) => {
      console.log(`🔐 [AUTH] Processing ${context.method} ${context.url}`);

      // Simple auth check - in real implementation, validate JWT/OAuth
      const authHeader = context.headers.authorization;

      if (context.url.startsWith('/secure/') && !authHeader) {
        console.log('❌ [AUTH] No authorization header for secure endpoint');

        context.setResponse({
          statusCode: 401,
          responseHeaders: { 'Content-Type': 'application/fhir+json' },
          responseBody: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'security',
              diagnostics: 'Authorization required for secure endpoints'
            }]
          }
        });
        context.takeOver();
        return;
      }

      if (authHeader) {
        // Mock user context
        (context as any).user = {
          id: 'demo-user',
          role: 'practitioner',
          permissions: ['read', 'write']
        };
        console.log('✅ [AUTH] User authenticated');
      }
    }
  });

  // Register validation hook for Patient resources
  server.addHook({
    name: 'patient-validation',
    phase: 'preHandler',
    priority: 100,
    resources: 'Patient',
    handler: async (context: any) => {
      console.log('🏥 [VALIDATION] Validating Patient resource');

      if (context.operation === 'create' && context.body) {
        const patient = context.body;

        // Business validation rules
        if (!patient.name || !patient.name[0]?.family) {
          throw new Error('Patient must have a family name');
        }

        if (patient.gender && !['male', 'female', 'other', 'unknown'].includes(patient.gender)) {
          throw new Error('Invalid gender value');
        }

        console.log('✅ [VALIDATION] Patient validation passed');
      }
    }
  });

  // Register audit logging hook
  server.addHook({
    name: 'audit-logger',
    phase: 'onResponse',
    priority: 50,
    resources: '*', // All resources
    handler: async (context: any) => {
      console.log('📝 [AUDIT] Logging request');

      const auditEntry = {
        timestamp: new Date().toISOString(),
        requestId: context.requestId,
        method: context.method,
        url: context.url,
        statusCode: context.statusCode,
        userAgent: context.headers['user-agent'],
        clientIP: context.headers['x-forwarded-for'] || 'unknown',
        duration: Date.now() - context.startTime,
        resourceType: context.resourceType,
        operation: context.operation,
        userId: context.user?.id || 'anonymous'
      };

      console.log(`📊 [AUDIT] ${JSON.stringify(auditEntry, null, 2)}`);
    }
  });

  // Register performance monitoring hook
  server.addHook({
    name: 'performance-monitor',
    phase: 'onResponse',
    priority: 90,
    handler: async (context: any) => {
      const duration = Date.now() - context.startTime;

      if (duration > 1000) { // Slow request threshold
        console.log(`⚠️  [PERF] Slow request detected: ${duration}ms for ${context.method} ${context.url}`);
      } else if (duration > 500) {
        console.log(`🐌 [PERF] Medium request: ${duration}ms for ${context.method} ${context.url}`);
      } else {
        console.log(`⚡ [PERF] Fast request: ${duration}ms for ${context.method} ${context.url}`);
      }

      // Add performance diagnostic
      context.addDiagnostic({
        level: 'info',
        code: 'performance',
        message: `Request completed in ${duration}ms`,
        source: 'performance-monitor',
        metadata: {
          duration,
          method: context.method,
          url: context.url,
          threshold: duration > 1000 ? 'slow' : duration > 500 ? 'medium' : 'fast'
        }
      });
    }
  });

  // Register error enrichment hook
  server.addHook({
    name: 'error-enrichment',
    phase: 'onError',
    priority: 100,
    handler: async (context: any) => {
      console.log(`💥 [ERROR] Handling error: ${context.error.message}`);

      // Enrich error with additional context
      const enrichedResponse = {
        statusCode: 500,
        responseHeaders: {
          'Content-Type': 'application/fhir+json',
          'X-Request-ID': context.requestId
        },
        responseBody: {
          resourceType: 'OperationOutcome',
          issue: [{
            severity: 'error',
            code: 'exception',
            diagnostics: context.error.message,
            details: {
              text: `Error occurred during ${context.operation || 'unknown'} operation`
            },
            location: [context.url]
          }]
        }
      };

      context.errorResponse = enrichedResponse;
      context.handled = true;

      console.log('🔧 [ERROR] Error enriched and handled');
    }
  });

  // Setup event listeners
  server.on('server:starting', () => {
    console.log('🔄 Server is starting...');
  });

  server.on('server:started', () => {
    console.log('✅ Server started successfully!');
    console.log('📡 Available endpoints:');
    console.log('   GET  http://localhost:3000/metadata - Server capabilities');
    console.log('   GET  http://localhost:3000/Patient - Public patient search');
    console.log('   POST http://localhost:3000/Patient - Create patient (validates)');
    console.log('   GET  http://localhost:3000/secure/Patient - Secure endpoint (auth required)');
    console.log('   Any  http://localhost:3000/test - Test endpoint');
    console.log('');
    console.log('🔑 For secure endpoints, include header: Authorization: Bearer any-token');
    console.log('');
  });

  server.on('request:received', (data) => {
    console.log(`📨 [REQUEST] ${data.data.method} ${data.data.url} (${data.requestId})`);
  });

  server.on('request:completed', (data) => {
    console.log(`✅ [RESPONSE] ${data.data.statusCode} in ${data.data.duration}ms (${data.requestId})`);
  });

  server.on('request:error', (data) => {
    console.log(`❌ [ERROR] ${data.data.error} (${data.requestId})`);
  });

  server.on('server:stopping', () => {
    console.log('🔄 Server is stopping...');
  });

  server.on('server:stopped', () => {
    console.log('🛑 Server stopped');
  });

  // Start the server
  try {
    await server.start();

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

    // Keep the process alive
    console.log('🎯 Server running. Press Ctrl+C to stop.');

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Run the demo
createDemoServer().catch(console.error);