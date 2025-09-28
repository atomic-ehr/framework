/**
 * Tests for ContextManager
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ContextManager } from '../src/context.js';
import type { FhirServerConfig } from '../src/types.js';
import { IncomingMessage, ServerResponse } from 'http';

describe('ContextManager', () => {
  let contextManager: ContextManager;
  let config: FhirServerConfig;

  beforeEach(() => {
    config = {
      port: 3000,
      maxBodySize: 1024 * 1024
    };
    contextManager = new ContextManager(config);
  });

  test('should create request context from HTTP request', async () => {
    const mockReq = {
      method: 'GET',
      url: '/Patient/123',
      headers: {
        'content-type': 'application/fhir+json',
        'authorization': 'Bearer token123',
        'user-agent': 'Test Agent'
      }
    } as IncomingMessage;

    const mockRes = {} as ServerResponse;
    const mockAppContext = {
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      clock: { now: () => Date.now(), toISOString: () => new Date().toISOString() },
      config: { get: () => {}, set: () => {}, has: () => false },
      events: { emit: () => {}, on: () => {}, off: () => {} }
    };

    const requestId = 'test-request-123';
    const startTime = Date.now();

    const context = await contextManager.createRequestContext(
      mockReq,
      mockRes,
      requestId,
      startTime,
      mockAppContext
    );

    expect(context.requestId).toBe(requestId);
    expect(context.startTime).toBe(startTime);
    expect(context.method).toBe('GET');
    expect(context.url).toBe('/Patient/123');
    expect(context.headers['content-type']).toBe('application/fhir+json');
    expect(context.headers.authorization).toBe('Bearer token123');
    expect(context.resourceType).toBe('Patient');
    expect(context.operation).toBe('read');
    expect(context.raw.req).toBe(mockReq);
    expect(context.raw.res).toBe(mockRes);
  });

  test('should extract resource type from URL', async () => {
    const testCases = [
      { url: '/Patient/123', expected: 'Patient' },
      { url: '/Observation', expected: 'Observation' },
      { url: '/DiagnosticReport/abc-123', expected: 'DiagnosticReport' },
      { url: '/metadata', expected: undefined },
      { url: '/invalid/path', expected: undefined }
    ];

    for (const testCase of testCases) {
      const mockReq = {
        method: 'GET',
        url: testCase.url,
        headers: {}
      } as IncomingMessage;

      const mockRes = {} as ServerResponse;
      const mockAppContext = {
        logger: {},
        clock: {},
        config: {},
        events: {}
      };

      const context = await contextManager.createRequestContext(
        mockReq,
        mockRes,
        'test-id',
        Date.now(),
        mockAppContext
      );

      expect(context.resourceType).toBe(testCase.expected);
    }
  });

  test('should extract operation from method and URL', async () => {
    const testCases = [
      { method: 'GET', url: '/Patient/123', expected: 'read' },
      { method: 'GET', url: '/Patient', expected: 'search-type' },
      { method: 'POST', url: '/Patient', expected: 'create' },
      { method: 'PUT', url: '/Patient/123', expected: 'update' },
      { method: 'DELETE', url: '/Patient/123', expected: 'delete' },
      { method: 'PATCH', url: '/Patient/123', expected: 'patch' }
    ];

    for (const testCase of testCases) {
      const mockReq = {
        method: testCase.method,
        url: testCase.url,
        headers: {}
      } as IncomingMessage;

      const mockRes = {} as ServerResponse;
      const mockAppContext = {
        logger: {},
        clock: {},
        config: {},
        events: {}
      };

      const context = await contextManager.createRequestContext(
        mockReq,
        mockRes,
        'test-id',
        Date.now(),
        mockAppContext
      );

      expect(context.operation).toBe(testCase.expected);
    }
  });

  test('should parse query parameters', async () => {
    const mockReq = {
      method: 'GET',
      url: '/Patient?name=John&family=Doe&_format=json',
      headers: {}
    } as IncomingMessage;

    const mockRes = {} as ServerResponse;
    const mockAppContext = {
      logger: {},
      clock: {},
      config: {},
      events: {}
    };

    const context = await contextManager.createRequestContext(
      mockReq,
      mockRes,
      'test-id',
      Date.now(),
      mockAppContext
    );

    expect(context.query.name).toBe('John');
    expect(context.query.family).toBe('Doe');
    expect(context.query._format).toBe('json');
  });

  test('should normalize headers to lowercase', async () => {
    const mockReq = {
      method: 'GET',
      url: '/Patient',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token',
        'X-REQUEST-ID': '123'
      }
    } as IncomingMessage;

    const mockRes = {} as ServerResponse;
    const mockAppContext = {
      logger: {},
      clock: {},
      config: {},
      events: {}
    };

    const context = await contextManager.createRequestContext(
      mockReq,
      mockRes,
      'test-id',
      Date.now(),
      mockAppContext
    );

    expect(context.headers['content-type']).toBe('application/json');
    expect(context.headers.authorization).toBe('Bearer token');
    expect(context.headers['x-request-id']).toBe('123');
  });

  test('should augment context with hook controls', async () => {
    const mockReq = {
      method: 'GET',
      url: '/Patient',
      headers: {}
    } as IncomingMessage;

    const mockRes = {} as ServerResponse;
    const mockAppContext = {
      logger: {},
      clock: {},
      config: {},
      events: {}
    };

    const context = await contextManager.createRequestContext(
      mockReq,
      mockRes,
      'test-id',
      Date.now(),
      mockAppContext
    );

    // Check that hook control methods are available
    expect(typeof (context as any).stopPropagation).toBe('function');
    expect(typeof (context as any).takeOver).toBe('function');
    expect(typeof (context as any).skip).toBe('function');
    expect(typeof (context as any).setResponse).toBe('function');
    expect(typeof (context as any).addDiagnostic).toBe('function');

    // Test hook state manipulation
    (context as any).stopPropagation();
    expect(context._hookState?.stopped).toBe(true);

    (context as any).takeOver();
    expect(context._hookState?.takenOver).toBe(true);

    (context as any).skip();
    expect(context._hookState?.skipped).toBe(true);

    const mockResponse = { statusCode: 200, responseHeaders: {}, responseBody: {} };
    (context as any).setResponse(mockResponse);
    expect(context._hookState?.response).toBe(mockResponse);

    const diagnostic = { level: 'info', message: 'test', code: 'test' };
    (context as any).addDiagnostic(diagnostic);
    expect(context._hookState?.diagnostics).toHaveLength(1);
    expect(context._hookState?.diagnostics[0]).toMatchObject(diagnostic);
  });

  test('should create response context', () => {
    const mockRequestContext = {
      requestId: 'test-123',
      startTime: Date.now() - 100,
      _hookState: { diagnostics: [{ level: 'info', message: 'test' }] }
    } as any;

    const response = contextManager.createResponseContext(
      mockRequestContext,
      201,
      { 'Location': '/Patient/123' },
      { resourceType: 'Patient', id: '123' }
    );

    expect(response.statusCode).toBe(201);
    expect(response.responseHeaders['Content-Type']).toBe('application/fhir+json');
    expect(response.responseHeaders['X-Request-ID']).toBe('test-123');
    expect(response.responseHeaders['Location']).toBe('/Patient/123');
    expect(response.responseBody).toEqual({ resourceType: 'Patient', id: '123' });
    expect(response.timing?.duration).toBeGreaterThan(0);
    expect(response.diagnostics).toHaveLength(1);
  });

  test('should create error context', () => {
    const mockRequestContext = {
      requestId: 'test-123',
      method: 'GET',
      url: '/Patient',
      startTime: Date.now()
    } as any;

    const error = new Error('Test error');
    const errorContext = contextManager.createErrorContext(mockRequestContext, error);

    expect(errorContext.error).toBe(error);
    expect(errorContext.handled).toBe(false);
    expect(errorContext.requestId).toBe('test-123');
    expect(errorContext.method).toBe('GET');
  });

  test('should extract client IP address', () => {
    const testCases = [
      {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
        expected: '192.168.1.1'
      },
      {
        headers: { 'x-real-ip': '192.168.1.2' },
        socket: { remoteAddress: '127.0.0.1' },
        expected: '192.168.1.2'
      },
      {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
        expected: '127.0.0.1'
      },
      {
        headers: {},
        socket: {},
        expected: 'unknown'
      }
    ];

    for (const testCase of testCases) {
      const context = {
        raw: {
          req: {
            headers: testCase.headers,
            socket: testCase.socket
          }
        }
      } as any;

      const clientIP = contextManager.getClientIP(context);
      expect(clientIP).toBe(testCase.expected);
    }
  });

  test('should detect browser requests', () => {
    const testCases = [
      { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', expected: true },
      { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', expected: true },
      { userAgent: 'curl/7.68.0', expected: false },
      { userAgent: 'PostmanRuntime/7.26.8', expected: false },
      { userAgent: undefined, expected: false }
    ];

    for (const testCase of testCases) {
      const context = {
        headers: testCase.userAgent ? { 'user-agent': testCase.userAgent } : {}
      } as any;

      const isBrowser = contextManager.isBrowser(context);
      expect(isBrowser).toBe(testCase.expected);
    }
  });

  test('should check if request expects JSON', () => {
    const testCases = [
      { accept: 'application/json', expected: true },
      { accept: 'application/fhir+json', expected: true },
      { accept: '*/*', expected: true },
      { accept: 'text/html', expected: false },
      { accept: undefined, expected: true } // Default to true
    ];

    for (const testCase of testCases) {
      const context = {
        headers: testCase.accept ? { accept: testCase.accept } : {}
      } as any;

      const expectsJson = contextManager.expectsJson(context);
      expect(expectsJson).toBe(testCase.expected);
    }
  });
});