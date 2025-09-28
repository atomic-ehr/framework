/**
 * Context creation and management utilities for HTTP requests and responses
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type {
  HttpRequestContext,
  HttpResponseContext,
  ErrorContext,
  FhirServerConfig
} from './types.js';

/**
 * Utility class for creating and managing HTTP contexts
 */
export class ContextManager {
  private config: FhirServerConfig;

  constructor(config: FhirServerConfig) {
    this.config = config;
  }

  /**
   * Create an HTTP request context from Node.js request
   */
  async createRequestContext(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    startTime: number,
    appContext: any
  ): Promise<HttpRequestContext> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const body = await this.parseRequestBody(req);

    const context: HttpRequestContext = {
      // Core context properties
      requestId,
      logger: appContext.logger,
      clock: appContext.clock,
      config: appContext.config,
      events: appContext.events,

      // Request timing
      startTime,

      // HTTP properties
      method: req.method!,
      url: req.url!,
      headers: this.normalizeHeaders(req.headers),
      params: {}, // Will be populated by router
      query: Object.fromEntries(url.searchParams),
      body,

      // Raw request/response objects
      raw: { req, res },

      // FHIR context (will be populated by router)
      resourceType: this.extractResourceType(req.url!),
      operation: this.extractOperation(req.method!, req.url!),

      // Hook control state
      _hookState: {
        stopped: false,
        takenOver: false,
        skipped: false,
        diagnostics: []
      }
    };

    // Add hook control methods
    this.augmentWithHookControls(context);

    return context;
  }

  /**
   * Create an HTTP response context
   */
  createResponseContext(
    requestContext: HttpRequestContext,
    statusCode: number = 200,
    headers: Record<string, string> = {},
    body?: any
  ): HttpResponseContext {
    const endTime = Date.now();

    return {
      statusCode,
      responseHeaders: {
        'Content-Type': 'application/fhir+json',
        'X-Request-ID': requestContext.requestId,
        'X-Response-Time': `${endTime - requestContext.startTime}ms`,
        ...headers
      },
      responseBody: body,
      timing: {
        startTime: requestContext.startTime,
        endTime,
        duration: endTime - requestContext.startTime,
        hookDuration: 0 // Will be calculated by hook executor
      },
      diagnostics: requestContext._hookState?.diagnostics || []
    };
  }

  /**
   * Create an error context for error handling
   */
  createErrorContext(
    requestContext: HttpRequestContext,
    error: Error
  ): ErrorContext {
    return {
      ...requestContext,
      error,
      handled: false
    };
  }

  /**
   * Parse request body based on content type
   */
  private async parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD') {
        resolve(undefined);
        return;
      }

      let body = '';
      let length = 0;
      const maxSize = this.config.maxBodySize || 10 * 1024 * 1024; // 10MB default

      req.on('data', (chunk) => {
        length += chunk.length;
        if (length > maxSize) {
          reject(new Error(`Request body too large. Maximum size: ${maxSize} bytes`));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          if (!body) {
            resolve(undefined);
            return;
          }

          const contentType = req.headers['content-type']?.toLowerCase() || '';

          if (contentType.includes('application/json') || contentType.includes('application/fhir+json')) {
            resolve(JSON.parse(body));
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            resolve(this.parseFormData(body));
          } else if (contentType.includes('text/')) {
            resolve(body);
          } else {
            // For binary data or unknown content types, return as buffer
            resolve(Buffer.from(body));
          }
        } catch (error) {
          if (error instanceof SyntaxError) {
            reject(new Error('Invalid JSON in request body'));
          } else {
            reject(error);
          }
        }
      });

      req.on('error', reject);

      // Handle request timeout
      req.on('timeout', () => {
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Parse form-encoded data
   */
  private parseFormData(body: string): Record<string, string> {
    const params = new URLSearchParams(body);
    const result: Record<string, string> = {};

    for (const [key, value] of params.entries()) {
      result[key] = value;
    }

    return result;
  }

  /**
   * Normalize headers to consistent format
   */
  private normalizeHeaders(headers: IncomingMessage['headers']): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (value) {
        normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
      }
    }

    return normalized;
  }

  /**
   * Extract resource type from URL (basic implementation for Task 002)
   */
  private extractResourceType(url: string): string | undefined {
    // Basic pattern matching - will be enhanced in Task 003
    const cleanUrl = url.split('?')[0]; // Remove query parameters
    const pathSegments = cleanUrl.split('/').filter(Boolean);

    // Look for FHIR resource type pattern (capitalized word)
    for (const segment of pathSegments) {
      if (/^[A-Z][a-zA-Z]*$/.test(segment)) {
        return segment;
      }
    }

    return undefined;
  }

  /**
   * Extract operation from method and URL (basic implementation for Task 002)
   */
  private extractOperation(method: string, url: string): string | undefined {
    const cleanUrl = url.split('?')[0];
    const hasId = cleanUrl.split('/').pop()?.match(/^[a-zA-Z0-9\-\.]{1,64}$/);

    switch (method.toUpperCase()) {
      case 'GET':
        return hasId ? 'read' : 'search-type';
      case 'POST':
        return 'create';
      case 'PUT':
        return 'update';
      case 'PATCH':
        return 'patch';
      case 'DELETE':
        return 'delete';
      case 'HEAD':
        return 'read';
      default:
        return undefined;
    }
  }

  /**
   * Augment context with hook control methods
   */
  private augmentWithHookControls(context: HttpRequestContext): void {
    // Add control flow methods that hooks can use
    (context as any).stopPropagation = () => {
      if (context._hookState) {
        context._hookState.stopped = true;
      }
    };

    (context as any).takeOver = () => {
      if (context._hookState) {
        context._hookState.takenOver = true;
      }
    };

    (context as any).skip = () => {
      if (context._hookState) {
        context._hookState.skipped = true;
      }
    };

    (context as any).setResponse = (response: HttpResponseContext) => {
      if (context._hookState) {
        context._hookState.response = response;
      }
    };

    (context as any).addDiagnostic = (diagnostic: any) => {
      if (context._hookState) {
        context._hookState.diagnostics.push({
          ...diagnostic,
          timestamp: Date.now(),
          requestId: context.requestId
        });
      }
    };
  }

  /**
   * Extract user agent information
   */
  getUserAgent(context: HttpRequestContext): string | undefined {
    return context.headers['user-agent'];
  }

  /**
   * Get client IP address
   */
  getClientIP(context: HttpRequestContext): string {
    const req = context.raw.req;

    // Check common proxy headers
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return req.socket.remoteAddress || 'unknown';
  }

  /**
   * Check if request expects JSON response
   */
  expectsJson(context: HttpRequestContext): boolean {
    const accept = context.headers.accept || '';
    return accept.includes('application/json') ||
           accept.includes('application/fhir+json') ||
           accept.includes('*/*');
  }

  /**
   * Get request content type
   */
  getContentType(context: HttpRequestContext): string | undefined {
    return context.headers['content-type'];
  }

  /**
   * Check if request is from a browser
   */
  isBrowser(context: HttpRequestContext): boolean {
    const userAgent = this.getUserAgent(context)?.toLowerCase() || '';
    return userAgent.includes('mozilla') ||
           userAgent.includes('chrome') ||
           userAgent.includes('safari') ||
           userAgent.includes('firefox');
  }
}