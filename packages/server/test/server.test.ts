/**
 * Tests for FhirServer class
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { FhirServer } from '../src/server.js';
import type { FhirServerConfig } from '../src/types.js';

describe('FhirServer', () => {
  let server: FhirServer;
  let testConfig: FhirServerConfig;

  beforeEach(() => {
    testConfig = {
      port: 0, // Use random port for testing
      host: 'localhost',
      logging: { level: 'error' }, // Suppress logs during tests
      timeout: 5000
    };
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  test('should create server with valid config', () => {
    server = new FhirServer(testConfig);
    expect(server).toBeDefined();
    expect(server.isRunning()).toBe(false);
  });

  test('should reject invalid port config', () => {
    expect(() => {
      new FhirServer({ ...testConfig, port: -1 });
    }).toThrow();
  });

  test('should reject invalid timeout config', () => {
    expect(() => {
      new FhirServer({ ...testConfig, timeout: -1 });
    }).toThrow();
  });

  test('should start and stop server', async () => {
    server = new FhirServer({ ...testConfig, port: 3001 });

    expect(server.isRunning()).toBe(false);

    await server.start();
    expect(server.isRunning()).toBe(true);

    await server.stop();
    expect(server.isRunning()).toBe(false);
  });

  test('should handle server lifecycle events', async () => {
    const events: string[] = [];

    server = new FhirServer({ ...testConfig, port: 3002 });

    server.on('server:starting', () => events.push('starting'));
    server.on('server:started', () => events.push('started'));
    server.on('server:stopping', () => events.push('stopping'));
    server.on('server:stopped', () => events.push('stopped'));

    await server.start();
    await server.stop();

    expect(events).toEqual(['starting', 'started', 'stopping', 'stopped']);
  });

  test('should register and execute hooks', async () => {
    server = new FhirServer({ ...testConfig, port: 3003 });

    const hookExecuted = mock(() => {});

    server.addHook({
      name: 'test-hook',
      phase: 'preRequest',
      priority: 100,
      handler: hookExecuted
    });

    await server.start();

    // Make a test request
    const response = await fetch(`http://localhost:3003/test`);
    expect(response.status).toBe(200);

    // Wait a bit for async hooks
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(hookExecuted).toHaveBeenCalled();

    await server.stop();
  });

  test('should handle hook errors gracefully', async () => {
    server = new FhirServer({ ...testConfig, port: 3004 });

    server.addHook({
      name: 'error-hook',
      phase: 'preRequest',
      priority: 100,
      handler: async () => {
        throw new Error('Test hook error');
      }
    });

    await server.start();

    const response = await fetch(`http://localhost:3004/test`);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.issue[0].diagnostics).toContain('Test hook error');

    await server.stop();
  });

  test('should handle hook takeOver', async () => {
    server = new FhirServer({ ...testConfig, port: 3005 });

    server.addHook({
      name: 'takeover-hook',
      phase: 'preRequest',
      priority: 100,
      handler: async (context: any) => {
        context.setResponse({
          statusCode: 401,
          responseHeaders: { 'Content-Type': 'application/fhir+json' },
          responseBody: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'security',
              diagnostics: 'Authentication required'
            }]
          }
        });
        context.takeOver();
      }
    });

    await server.start();

    const response = await fetch(`http://localhost:3005/test`);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.issue[0].diagnostics).toBe('Authentication required');

    await server.stop();
  });

  test('should collect server statistics', async () => {
    server = new FhirServer({ ...testConfig, port: 3006 });

    await server.start();

    const initialStats = server.getStats();
    expect(initialStats.totalRequests).toBe(0);

    // Make some requests
    await fetch(`http://localhost:3006/test1`);
    await fetch(`http://localhost:3006/test2`);

    // Wait for stats to update
    await new Promise(resolve => setTimeout(resolve, 10));

    const finalStats = server.getStats();
    expect(finalStats.totalRequests).toBe(2);

    await server.stop();
  });

  test('should handle CORS when enabled', async () => {
    server = new FhirServer({
      ...testConfig,
      port: 3007,
      cors: {
        enabled: true,
        origins: ['http://localhost:3000'],
        methods: ['GET', 'POST']
      }
    });

    await server.start();

    const response = await fetch(`http://localhost:3007/test`);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');

    await server.stop();
  });

  test('should handle preflight OPTIONS requests', async () => {
    server = new FhirServer({
      ...testConfig,
      port: 3008,
      cors: { enabled: true }
    });

    await server.start();

    const response = await fetch(`http://localhost:3008/test`, {
      method: 'OPTIONS'
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();

    await server.stop();
  });

  test('should handle request timeout', async () => {
    server = new FhirServer({
      ...testConfig,
      port: 3009,
      timeout: 100 // Very short timeout
    });

    server.addHook({
      name: 'slow-hook',
      phase: 'preRequest',
      priority: 100,
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 200)); // Longer than timeout
      }
    });

    await server.start();

    const response = await fetch(`http://localhost:3009/test`);
    expect(response.status).toBe(500);

    await server.stop();
  });

  test('should validate request body size', async () => {
    server = new FhirServer({
      ...testConfig,
      port: 3010,
      maxBodySize: 100 // Very small limit
    });

    await server.start();

    const largeBody = 'x'.repeat(200); // Larger than limit

    const response = await fetch(`http://localhost:3010/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: largeBody
    });

    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.issue[0].diagnostics).toContain('Request body too large');

    await server.stop();
  });
});