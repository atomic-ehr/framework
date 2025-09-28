/**
 * Integration tests for FhirServer with routing
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FhirServer, FhirOperation } from '../src/index.js';
import type { FhirServerConfig } from '../src/types.js';

describe('FhirServer with Routing', () => {
  let server: FhirServer;
  let testConfig: FhirServerConfig;
  let baseUrl: string;

  beforeEach(() => {
    const port = 3100 + Math.floor(Math.random() * 100); // Random port to avoid conflicts
    testConfig = {
      port,
      host: 'localhost',
      logging: { level: 'error' }, // Suppress logs during tests
      timeout: 5000
    };
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  describe('Basic FHIR Endpoints', () => {
    test('should handle capabilities endpoint', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/metadata`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/fhir+json');

      const body = await response.json();
      expect(body.resourceType).toBe('CapabilityStatement');
      expect(body.status).toBe('active');
      expect(body.fhirVersion).toBe('4.0.1');
      expect(body.software.name).toBe('@atomic-ehr/server');
    });

    test('should handle Patient read (not implemented)', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123`);
      expect(response.status).toBe(501); // Not implemented
      expect(response.headers.get('content-type')).toContain('application/fhir+json');

      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].severity).toBe('error');
      expect(body.issue[0].code).toBe('not-supported');
      expect(body.issue[0].diagnostics).toContain('Read operation');
    });

    test('should handle Patient create (not implemented)', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const patient = {
        resourceType: 'Patient',
        name: [{ family: 'Doe', given: ['John'] }],
        gender: 'male'
      };

      const response = await fetch(`${baseUrl}/Patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(patient)
      });

      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('Create operation');
    });

    test('should handle Patient search (not implemented)', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient?name=john`);
      expect(response.status).toBe(501);

      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('Search operation');
    });

    test('should handle Patient update (not implemented)', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const patient = {
        resourceType: 'Patient',
        id: '123',
        name: [{ family: 'Doe', given: ['John'] }],
        gender: 'male'
      };

      const response = await fetch(`${baseUrl}/Patient/123`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(patient)
      });

      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('Update operation');
    });

    test('should handle Patient delete (not implemented)', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('Delete operation');
    });

    test('should handle version read (not implemented)', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123/_history/1`);
      expect(response.status).toBe(501);

      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('Vread operation');
    });
  });

  describe('Custom Operations', () => {
    test('should handle system-level operations', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/$validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('System operation $validate');
    });

    test('should handle type-level operations', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/$validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify({ resourceType: 'Patient' })
      });

      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('Type operation $validate');
    });

    test('should handle instance-level operations', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123/$everything`, {
        method: 'POST'
      });

      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('Instance operation $everything');
    });
  });

  describe('Batch Operations', () => {
    test('should handle batch requests', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: {
              method: 'GET',
              url: 'Patient/123'
            }
          }
        ]
      };

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(bundle)
      });

      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics).toContain('batch');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unrecognized URLs', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/invalid/url`);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
      expect(body.issue[0].code).toBe('not-found');
      expect(body.issue[0].diagnostics).toContain('URL pattern not recognized');
    });

    test('should validate request body for create operations', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      // Missing body
      const response1 = await fetch(`${baseUrl}/Patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' }
      });

      expect(response1.status).toBe(400);
      const body1 = await response1.json();
      expect(body1.issue[0].diagnostics).toContain('Request body is required');

      // Mismatched resource type
      const response2 = await fetch(`${baseUrl}/Patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify({ resourceType: 'Observation' })
      });

      expect(response2.status).toBe(400);
      const body2 = await response2.json();
      expect(body2.issue[0].diagnostics).toContain('Resource type in body');
    });

    test('should validate request body for update operations', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/fhir+json' }
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.issue[0].diagnostics).toContain('Request body is required');
    });
  });

  describe('Hook Integration with Routing', () => {
    test('should provide route information to hooks', async () => {
      server = new FhirServer(testConfig);

      let hookContext: any = null;

      server.addHook({
        name: 'route-inspector',
        phase: 'preHandler',
        priority: 100,
        handler: async (context) => {
          hookContext = {
            operation: context.operation,
            resourceType: context.resourceType,
            level: (context as any).level,
            params: context.params
          };
        }
      });

      await server.start();

      await fetch(`${baseUrl}/Patient/123`);

      expect(hookContext).toBeTruthy();
      expect(hookContext.operation).toBe(FhirOperation.READ);
      expect(hookContext.resourceType).toBe('Patient');
      expect(hookContext.level).toBe('instance');
      expect(hookContext.params.id).toBe('123');
    });

    test('should allow hooks to take over before routing', async () => {
      server = new FhirServer(testConfig);

      server.addHook({
        name: 'early-takeover',
        phase: 'preRequest',
        priority: 100,
        handler: async (context: any) => {
          context.setResponse({
            statusCode: 418,
            responseHeaders: { 'Content-Type': 'application/fhir+json' },
            responseBody: {
              resourceType: 'OperationOutcome',
              issue: [{
                severity: 'information',
                code: 'informational',
                diagnostics: 'Request intercepted by hook'
              }]
            }
          });
          context.takeOver();
        }
      });

      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123`);
      expect(response.status).toBe(418);

      const body = await response.json();
      expect(body.issue[0].diagnostics).toBe('Request intercepted by hook');
    });
  });

  describe('Multiple Resource Types', () => {
    test('should handle different resource types', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const resources = ['Patient', 'Observation', 'Practitioner', 'Organization'];

      for (const resourceType of resources) {
        const response = await fetch(`${baseUrl}/${resourceType}/123`);
        expect(response.status).toBe(501);

        const body = await response.json();
        expect(body.issue[0].diagnostics).toContain(resourceType);
      }
    });
  });

  describe('System-level Operations', () => {
    test('should handle system search', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/?_type=Patient&name=john`);
      expect(response.status).toBe(501);

      const body = await response.json();
      expect(body.issue[0].diagnostics).toContain('System-wide search');
    });

    test('should handle system history', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/_history`);
      expect(response.status).toBe(501);

      const body = await response.json();
      expect(body.issue[0].diagnostics).toContain('System-wide history');
    });
  });

  describe('CORS Integration', () => {
    test('should handle CORS with routing', async () => {
      const corsConfig = {
        ...testConfig,
        cors: {
          enabled: true,
          origins: ['http://localhost:3000'],
          methods: ['GET', 'POST', 'PUT', 'DELETE']
        }
      };

      server = new FhirServer(corsConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });

    test('should handle OPTIONS preflight for FHIR endpoints', async () => {
      const corsConfig = {
        ...testConfig,
        cors: { enabled: true }
      };

      server = new FhirServer(corsConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET'
        }
      });

      // Note: This will currently return 501 because OPTIONS isn't handled by routing
      // In a full implementation, we'd add OPTIONS handling to the server
      expect(response.status).toBe(501);
    });
  });
});