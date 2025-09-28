/**
 * Response handling utilities with FHIR-specific formatting
 */

import type { ServerResponse } from 'http';
import type {
  HttpRequestContext,
  HttpResponseContext,
  OperationOutcome,
  FhirServerConfig
} from './types.js';

/**
 * Response handler for HTTP responses with FHIR formatting
 */
export class ResponseHandler {
  private config: FhirServerConfig;

  constructor(config: FhirServerConfig) {
    this.config = config;
  }

  /**
   * Send HTTP response with proper FHIR formatting
   */
  sendResponse(res: ServerResponse, context: HttpResponseContext): void {
    // Set status code
    res.statusCode = context.statusCode || 200;

    // Set response headers
    Object.entries(context.responseHeaders || {}).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Ensure FHIR content type if not already set
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');
    }

    // Add security headers
    this.addSecurityHeaders(res);

    // Handle CORS if enabled
    if (this.config.cors?.enabled) {
      this.setCorsHeaders(res);
    }

    // Add server identification
    res.setHeader('Server', 'Atomic-EHR/0.1.0');

    // Send response body
    this.sendBody(res, context.responseBody);
  }

  /**
   * Send error response with FHIR OperationOutcome
   */
  sendErrorResponse(
    res: ServerResponse,
    error: Error,
    statusCode: number = 500,
    requestId?: string
  ): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');

    if (requestId) {
      res.setHeader('X-Request-ID', requestId);
    }

    // Add security headers
    this.addSecurityHeaders(res);

    // Handle CORS if enabled
    if (this.config.cors?.enabled) {
      this.setCorsHeaders(res);
    }

    const operationOutcome = this.createOperationOutcome(error, statusCode);
    this.sendBody(res, operationOutcome);
  }

  /**
   * Send FHIR OperationOutcome response
   */
  sendOperationOutcome(
    res: ServerResponse,
    issues: OperationOutcome['issue'],
    statusCode: number = 400,
    requestId?: string
  ): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');

    if (requestId) {
      res.setHeader('X-Request-ID', requestId);
    }

    this.addSecurityHeaders(res);

    if (this.config.cors?.enabled) {
      this.setCorsHeaders(res);
    }

    const operationOutcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: issues
    };

    this.sendBody(res, operationOutcome);
  }

  /**
   * Create success response context
   */
  createSuccessResponse(
    requestContext: HttpRequestContext,
    body: any,
    statusCode: number = 200,
    additionalHeaders: Record<string, string> = {}
  ): HttpResponseContext {
    return {
      statusCode,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': requestContext.requestId,
        ...additionalHeaders
      },
      responseBody: body,
      timing: {
        startTime: requestContext.startTime,
        endTime: Date.now(),
        duration: Date.now() - requestContext.startTime,
        hookDuration: 0
      }
    };
  }

  /**
   * Create error response context
   */
  createErrorResponse(
    requestContext: HttpRequestContext,
    error: Error,
    statusCode: number = 500
  ): HttpResponseContext {
    const operationOutcome = this.createOperationOutcome(error, statusCode);

    return {
      statusCode,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': requestContext.requestId
      },
      responseBody: operationOutcome,
      timing: {
        startTime: requestContext.startTime,
        endTime: Date.now(),
        duration: Date.now() - requestContext.startTime,
        hookDuration: 0
      }
    };
  }

  /**
   * Create FHIR OperationOutcome from error
   */
  private createOperationOutcome(error: Error, statusCode: number): OperationOutcome {
    const severity = this.getSeverityFromStatusCode(statusCode);
    const code = this.getCodeFromStatusCode(statusCode);

    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity,
        code,
        diagnostics: error.message,
        details: {
          text: this.getDetailsFromStatusCode(statusCode)
        }
      }]
    };
  }

  /**
   * Get issue severity from HTTP status code
   */
  private getSeverityFromStatusCode(statusCode: number): 'fatal' | 'error' | 'warning' | 'information' {
    if (statusCode >= 500) return 'fatal';
    if (statusCode >= 400) return 'error';
    if (statusCode >= 300) return 'warning';
    return 'information';
  }

  /**
   * Get issue code from HTTP status code
   */
  private getCodeFromStatusCode(statusCode: number): string {
    switch (statusCode) {
      case 400: return 'invalid';
      case 401: return 'security';
      case 403: return 'forbidden';
      case 404: return 'not-found';
      case 405: return 'not-supported';
      case 409: return 'conflict';
      case 410: return 'deleted';
      case 412: return 'conflict';
      case 422: return 'invalid';
      case 429: return 'throttled';
      case 500: return 'exception';
      case 501: return 'not-supported';
      case 503: return 'transient';
      default: return 'exception';
    }
  }

  /**
   * Get human-readable details from HTTP status code
   */
  private getDetailsFromStatusCode(statusCode: number): string {
    switch (statusCode) {
      case 400: return 'Bad Request - The request could not be understood by the server';
      case 401: return 'Unauthorized - Authentication is required';
      case 403: return 'Forbidden - Access to the resource is denied';
      case 404: return 'Not Found - The requested resource was not found';
      case 405: return 'Method Not Allowed - The HTTP method is not supported';
      case 409: return 'Conflict - The request conflicts with the current state';
      case 410: return 'Gone - The resource is no longer available';
      case 412: return 'Precondition Failed - One or more conditions failed';
      case 422: return 'Unprocessable Entity - The request was well-formed but contains semantic errors';
      case 429: return 'Too Many Requests - Rate limit exceeded';
      case 500: return 'Internal Server Error - An unexpected error occurred';
      case 501: return 'Not Implemented - The functionality is not implemented';
      case 503: return 'Service Unavailable - The service is temporarily unavailable';
      default: return 'An error occurred while processing the request';
    }
  }

  /**
   * Send response body with proper formatting
   */
  private sendBody(res: ServerResponse, body: any): void {
    if (body === undefined || body === null) {
      res.end();
      return;
    }

    let responseBody: string;

    if (typeof body === 'string') {
      responseBody = body;
    } else if (Buffer.isBuffer(body)) {
      res.end(body);
      return;
    } else {
      // JSON serialization with proper formatting
      responseBody = JSON.stringify(body, null, 2);
    }

    // Set content length
    res.setHeader('Content-Length', Buffer.byteLength(responseBody, 'utf8'));

    res.end(responseBody);
  }

  /**
   * Add security headers to response
   */
  private addSecurityHeaders(res: ServerResponse): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Only add HSTS for HTTPS
    if (res.socket && (res.socket as any).encrypted) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  }

  /**
   * Set CORS headers based on configuration
   */
  private setCorsHeaders(res: ServerResponse): void {
    const corsConfig = this.config.cors!;

    // Allow origins
    if (corsConfig.origins && corsConfig.origins.length > 0) {
      res.setHeader('Access-Control-Allow-Origin', corsConfig.origins.join(', '));
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // Allow methods
    const methods = corsConfig.methods || [
      'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
    ];
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));

    // Allow headers
    const headers = corsConfig.headers || [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Request-ID'
    ];
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));

    // Expose headers
    res.setHeader('Access-Control-Expose-Headers', [
      'X-Request-ID',
      'X-Response-Time',
      'Location',
      'ETag',
      'Last-Modified'
    ].join(', '));

    // Allow credentials
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Preflight cache
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  /**
   * Handle OPTIONS preflight requests
   */
  handlePreflightRequest(res: ServerResponse): void {
    res.statusCode = 204; // No Content

    this.addSecurityHeaders(res);

    if (this.config.cors?.enabled) {
      this.setCorsHeaders(res);
    }

    res.end();
  }

  /**
   * Create response for FHIR resource creation
   */
  createResourceCreatedResponse(
    requestContext: HttpRequestContext,
    resource: any,
    location?: string
  ): HttpResponseContext {
    const headers: Record<string, string> = {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'X-Request-ID': requestContext.requestId
    };

    if (location) {
      headers['Location'] = location;
    }

    if (resource.meta?.lastUpdated) {
      headers['Last-Modified'] = new Date(resource.meta.lastUpdated).toUTCString();
    }

    if (resource.meta?.versionId) {
      headers['ETag'] = `W/"${resource.meta.versionId}"`;
    }

    return {
      statusCode: 201,
      responseHeaders: headers,
      responseBody: resource,
      timing: {
        startTime: requestContext.startTime,
        endTime: Date.now(),
        duration: Date.now() - requestContext.startTime,
        hookDuration: 0
      }
    };
  }

  /**
   * Create response for FHIR resource updates
   */
  createResourceUpdatedResponse(
    requestContext: HttpRequestContext,
    resource: any
  ): HttpResponseContext {
    const headers: Record<string, string> = {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'X-Request-ID': requestContext.requestId
    };

    if (resource.meta?.lastUpdated) {
      headers['Last-Modified'] = new Date(resource.meta.lastUpdated).toUTCString();
    }

    if (resource.meta?.versionId) {
      headers['ETag'] = `W/"${resource.meta.versionId}"`;
    }

    return {
      statusCode: 200,
      responseHeaders: headers,
      responseBody: resource,
      timing: {
        startTime: requestContext.startTime,
        endTime: Date.now(),
        duration: Date.now() - requestContext.startTime,
        hookDuration: 0
      }
    };
  }

  /**
   * Create response for successful deletion
   */
  createDeletedResponse(requestContext: HttpRequestContext): HttpResponseContext {
    return {
      statusCode: 204, // No Content
      responseHeaders: {
        'X-Request-ID': requestContext.requestId
      },
      timing: {
        startTime: requestContext.startTime,
        endTime: Date.now(),
        duration: Date.now() - requestContext.startTime,
        hookDuration: 0
      }
    };
  }
}