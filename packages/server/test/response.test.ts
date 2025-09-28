/**
 * Tests for ResponseHandler
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ResponseHandler } from '../src/response.js';
import type { FhirServerConfig, HttpRequestContext, HttpResponseContext } from '../src/types.js';
import { ServerResponse } from 'http';

// Mock ServerResponse for testing
class MockServerResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: string = '';
  ended = false;

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  getHeader(name: string) {
    return this.headers[name];
  }

  end(data?: string) {
    if (data) {
      this.body = data;
    }
    this.ended = true;
  }
}

describe('ResponseHandler', () => {
  let responseHandler: ResponseHandler;
  let config: FhirServerConfig;

  beforeEach(() => {
    config = {
      port: 3000,
      cors: { enabled: false }
    };
    responseHandler = new ResponseHandler(config);
  });

  test('should send basic response', () => {
    const mockRes = new MockServerResponse() as any;
    const context: HttpResponseContext = {
      statusCode: 200,
      responseHeaders: {
        'Content-Type': 'application/fhir+json',
        'X-Request-ID': 'test-123'
      },
      responseBody: { resourceType: 'Patient', id: '123' }
    };

    responseHandler.sendResponse(mockRes, context);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.headers['Content-Type']).toBe('application/fhir+json');
    expect(mockRes.headers['X-Request-ID']).toBe('test-123');
    expect(mockRes.ended).toBe(true);

    const body = JSON.parse(mockRes.body);
    expect(body.resourceType).toBe('Patient');
    expect(body.id).toBe('123');
  });

  test('should set default FHIR content type', () => {
    const mockRes = new MockServerResponse() as any;
    const context: HttpResponseContext = {
      statusCode: 200,
      responseHeaders: {},
      responseBody: { resourceType: 'Patient' }
    };

    responseHandler.sendResponse(mockRes, context);

    expect(mockRes.headers['Content-Type']).toBe('application/fhir+json; charset=utf-8');
  });

  test('should add security headers', () => {
    const mockRes = new MockServerResponse() as any;
    const context: HttpResponseContext = {
      statusCode: 200,
      responseHeaders: {},
      responseBody: { resourceType: 'Patient' }
    };

    responseHandler.sendResponse(mockRes, context);

    expect(mockRes.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(mockRes.headers['X-Frame-Options']).toBe('DENY');
    expect(mockRes.headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(mockRes.headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  test('should add CORS headers when enabled', () => {
    const corsConfig = {
      port: 3000,
      cors: {
        enabled: true,
        origins: ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        headers: ['Content-Type', 'Authorization']
      }
    };

    const corsHandler = new ResponseHandler(corsConfig);
    const mockRes = new MockServerResponse() as any;
    const context: HttpResponseContext = {
      statusCode: 200,
      responseHeaders: {},
      responseBody: { resourceType: 'Patient' }
    };

    corsHandler.sendResponse(mockRes, context);

    expect(mockRes.headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    expect(mockRes.headers['Access-Control-Allow-Methods']).toBe('GET, POST');
    expect(mockRes.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
    expect(mockRes.headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  test('should send error response with OperationOutcome', () => {
    const mockRes = new MockServerResponse() as any;
    const error = new Error('Test error message');

    responseHandler.sendErrorResponse(mockRes, error, 400, 'test-123');

    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.headers['Content-Type']).toBe('application/fhir+json; charset=utf-8');
    expect(mockRes.headers['X-Request-ID']).toBe('test-123');

    const body = JSON.parse(mockRes.body);
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.issue).toHaveLength(1);
    expect(body.issue[0].severity).toBe('error');
    expect(body.issue[0].code).toBe('invalid');
    expect(body.issue[0].diagnostics).toBe('Test error message');
  });

  test('should create OperationOutcome with correct severity and code', () => {
    const testCases = [
      { statusCode: 400, expectedSeverity: 'error', expectedCode: 'invalid' },
      { statusCode: 401, expectedSeverity: 'error', expectedCode: 'security' },
      { statusCode: 403, expectedSeverity: 'error', expectedCode: 'forbidden' },
      { statusCode: 404, expectedSeverity: 'error', expectedCode: 'not-found' },
      { statusCode: 500, expectedSeverity: 'fatal', expectedCode: 'exception' },
      { statusCode: 503, expectedSeverity: 'fatal', expectedCode: 'transient' }
    ];

    for (const testCase of testCases) {
      const mockRes = new MockServerResponse() as any;
      const error = new Error('Test error');

      responseHandler.sendErrorResponse(mockRes, error, testCase.statusCode);

      const body = JSON.parse(mockRes.body);
      expect(body.issue[0].severity).toBe(testCase.expectedSeverity);
      expect(body.issue[0].code).toBe(testCase.expectedCode);
    }
  });

  test('should create success response context', () => {
    const requestContext = {
      requestId: 'test-123',
      startTime: Date.now() - 100
    } as HttpRequestContext;

    const body = { resourceType: 'Patient', id: '123' };
    const additionalHeaders = { 'Location': '/Patient/123' };

    const response = responseHandler.createSuccessResponse(
      requestContext,
      body,
      201,
      additionalHeaders
    );

    expect(response.statusCode).toBe(201);
    expect(response.responseHeaders['Content-Type']).toBe('application/fhir+json; charset=utf-8');
    expect(response.responseHeaders['X-Request-ID']).toBe('test-123');
    expect(response.responseHeaders['Location']).toBe('/Patient/123');
    expect(response.responseBody).toBe(body);
    expect(response.timing?.duration).toBeGreaterThan(0);
  });

  test('should create error response context', () => {
    const requestContext = {
      requestId: 'test-123',
      startTime: Date.now() - 100
    } as HttpRequestContext;

    const error = new Error('Test error');

    const response = responseHandler.createErrorResponse(requestContext, error, 400);

    expect(response.statusCode).toBe(400);
    expect(response.responseHeaders['Content-Type']).toBe('application/fhir+json; charset=utf-8');
    expect(response.responseHeaders['X-Request-ID']).toBe('test-123');
    expect(response.responseBody.resourceType).toBe('OperationOutcome');
    expect(response.timing?.duration).toBeGreaterThan(0);
  });

  test('should create resource created response', () => {
    const requestContext = {
      requestId: 'test-123',
      startTime: Date.now() - 100
    } as HttpRequestContext;

    const resource = {
      resourceType: 'Patient',
      id: '123',
      meta: {
        versionId: '1',
        lastUpdated: '2023-01-01T00:00:00Z'
      }
    };

    const response = responseHandler.createResourceCreatedResponse(
      requestContext,
      resource,
      '/Patient/123'
    );

    expect(response.statusCode).toBe(201);
    expect(response.responseHeaders['Location']).toBe('/Patient/123');
    expect(response.responseHeaders['Last-Modified']).toBeTruthy();
    expect(response.responseHeaders['ETag']).toBe('W/"1"');
    expect(response.responseBody).toBe(resource);
  });

  test('should create resource updated response', () => {
    const requestContext = {
      requestId: 'test-123',
      startTime: Date.now() - 100
    } as HttpRequestContext;

    const resource = {
      resourceType: 'Patient',
      id: '123',
      meta: {
        versionId: '2',
        lastUpdated: '2023-01-02T00:00:00Z'
      }
    };

    const response = responseHandler.createResourceUpdatedResponse(requestContext, resource);

    expect(response.statusCode).toBe(200);
    expect(response.responseHeaders['Last-Modified']).toBeTruthy();
    expect(response.responseHeaders['ETag']).toBe('W/"2"');
    expect(response.responseBody).toBe(resource);
  });

  test('should create deleted response', () => {
    const requestContext = {
      requestId: 'test-123',
      startTime: Date.now() - 100
    } as HttpRequestContext;

    const response = responseHandler.createDeletedResponse(requestContext);

    expect(response.statusCode).toBe(204);
    expect(response.responseHeaders['X-Request-ID']).toBe('test-123');
    expect(response.responseBody).toBeUndefined();
  });

  test('should handle OPTIONS preflight request', () => {
    const corsHandler = new ResponseHandler({
      port: 3000,
      cors: { enabled: true }
    });

    const mockRes = new MockServerResponse() as any;

    corsHandler.handlePreflightRequest(mockRes);

    expect(mockRes.statusCode).toBe(204);
    expect(mockRes.headers['Access-Control-Allow-Methods']).toBeTruthy();
    expect(mockRes.ended).toBe(true);
  });

  test('should send string response body', () => {
    const mockRes = new MockServerResponse() as any;
    const context: HttpResponseContext = {
      statusCode: 200,
      responseHeaders: { 'Content-Type': 'text/plain' },
      responseBody: 'Plain text response'
    };

    responseHandler.sendResponse(mockRes, context);

    expect(mockRes.body).toBe('Plain text response');
  });

  test('should send empty response when body is undefined', () => {
    const mockRes = new MockServerResponse() as any;
    const context: HttpResponseContext = {
      statusCode: 204,
      responseHeaders: {}
    };

    responseHandler.sendResponse(mockRes, context);

    expect(mockRes.body).toBe('');
    expect(mockRes.ended).toBe(true);
  });

  test('should format JSON response with proper indentation', () => {
    const mockRes = new MockServerResponse() as any;
    const context: HttpResponseContext = {
      statusCode: 200,
      responseHeaders: {},
      responseBody: { resourceType: 'Patient', id: '123', name: [{ family: 'Doe' }] }
    };

    responseHandler.sendResponse(mockRes, context);

    // Check that JSON is formatted with 2-space indentation
    expect(mockRes.body).toContain('\\n');
    expect(mockRes.body).toContain('  ');

    // Verify it's valid JSON
    const parsed = JSON.parse(mockRes.body);
    expect(parsed.resourceType).toBe('Patient');
  });
});