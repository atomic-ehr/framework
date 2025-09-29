/**
 * Request and response logging system
 */

import type { HookDefinition } from '@atomic-ehr/core';
import type { HttpRequestContext, HttpResponseContext } from '../types.js';
import type { LoggingConfig } from './types.js';

/**
 * Request/response logger
 */
export class RequestResponseLogger {
  private config: Required<LoggingConfig>;

  constructor(config: LoggingConfig = {}) {
    this.config = {
      logRequests: config.logRequests ?? true,
      logResponses: config.logResponses ?? true,
      logBodies: config.logBodies ?? false,
      logHeaders: config.logHeaders ?? true,
      slowRequestThreshold: config.slowRequestThreshold ?? 1000,
      sanitizeHeaders: config.sanitizeHeaders ?? [
        'authorization',
        'cookie',
        'x-api-key',
        'api-key',
        'access-token'
      ]
    };
  }

  /**
   * Create all logging hooks
   */
  createLoggingHooks(): HookDefinition[] {
    const hooks: HookDefinition[] = [];

    if (this.config.logRequests) {
      hooks.push(this.createRequestLoggingHook());
    }

    if (this.config.logResponses) {
      hooks.push(this.createResponseLoggingHook());
    }

    hooks.push(this.createPerformanceLoggingHook());

    return hooks;
  }

  /**
   * Create request logging hook
   */
  private createRequestLoggingHook(): HookDefinition {
    return {
      name: 'request-logger',
      phase: 'preRequest',
      priority: 95,
      handler: async (context: HttpRequestContext) => {
        if (!context.logger) {
          return context;
        }

        const logData: any = {
          requestId: context.requestId,
          method: context.method,
          url: context.url,
          resourceType: context.resourceType,
          operation: context.operation,
          timestamp: new Date().toISOString()
        };

        if (this.config.logHeaders) {
          logData.headers = this.sanitizeHeaders(context.headers);
        }

        if (this.config.logBodies && context.body) {
          logData.body = this.sanitizeBody(context.body);
        }

        context.logger.info('FHIR request received', logData);

        return context;
      }
    };
  }

  /**
   * Create response logging hook
   */
  private createResponseLoggingHook(): HookDefinition {
    return {
      name: 'response-logger',
      phase: 'onResponse',
      priority: 95,
      handler: async (context: HttpResponseContext) => {
        if (!context.logger) {
          return context;
        }

        const duration = Date.now() - (context as any).startTime || 0;

        const logData: any = {
          requestId: (context as any).requestId,
          method: (context as any).method,
          url: (context as any).url,
          resourceType: (context as any).resourceType,
          operation: (context as any).operation,
          statusCode: context.statusCode,
          duration,
          timestamp: new Date().toISOString()
        };

        if (this.config.logHeaders) {
          logData.responseHeaders = context.responseHeaders;
        }

        if (this.config.logBodies && context.responseBody) {
          logData.responseSize = this.getResponseSize(context.responseBody);
        }

        const level = context.statusCode >= 400 ? 'warn' : 'info';
        if (context.logger[level]) {
          context.logger[level]('FHIR request completed', logData);
        }

        return context;
      }
    };
  }

  /**
   * Create performance logging hook
   */
  private createPerformanceLoggingHook(): HookDefinition {
    return {
      name: 'performance-logger',
      phase: 'onResponse',
      priority: 90,
      handler: async (context: HttpResponseContext) => {
        const startTime = (context as any).startTime || Date.now();
        const duration = Date.now() - startTime;

        // Add performance headers
        context.responseHeaders['X-Response-Time'] = `${duration}ms`;
        context.responseHeaders['X-Request-ID'] = (context as any).requestId || 'unknown';

        // Log slow requests
        if (duration > this.config.slowRequestThreshold && context.logger) {
          context.logger.warn('Slow FHIR request detected', {
            requestId: (context as any).requestId,
            method: (context as any).method,
            url: (context as any).url,
            resourceType: (context as any).resourceType,
            operation: (context as any).operation,
            duration,
            threshold: this.config.slowRequestThreshold
          });
        }

        return context;
      }
    };
  }

  /**
   * Sanitize headers to remove sensitive information
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };

    for (const key of this.config.sanitizeHeaders) {
      const lowerKey = key.toLowerCase();
      for (const headerKey in sanitized) {
        if (headerKey.toLowerCase() === lowerKey) {
          sanitized[headerKey] = '[REDACTED]';
        }
      }
    }

    return sanitized;
  }

  /**
   * Sanitize request body to limit size
   */
  private sanitizeBody(body: any): any {
    if (!body) {
      return null;
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    // Limit body size in logs
    const maxLength = 500;
    if (bodyStr.length > maxLength) {
      return bodyStr.substring(0, maxLength) + `... (${bodyStr.length} bytes total)`;
    }

    return body;
  }

  /**
   * Get response size
   */
  private getResponseSize(responseBody: any): number {
    if (!responseBody) {
      return 0;
    }

    const bodyStr = typeof responseBody === 'string'
      ? responseBody
      : JSON.stringify(responseBody);

    return bodyStr.length;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<LoggingConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggingConfig {
    return { ...this.config };
  }
}