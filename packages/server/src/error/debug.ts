/**
 * Development debugging support
 */

import type { HookDefinition } from '@atomic-ehr/core';
import type { HttpRequestContext, HttpResponseContext } from '../types.js';

/**
 * Debug support for development environments
 */
export class DebugSupport {
  constructor(private isDevelopment: boolean = false) {}

  /**
   * Create debug hooks (only in development mode)
   */
  createDebugHooks(): HookDefinition[] {
    if (!this.isDevelopment) {
      return [];
    }

    return [
      this.createHookExecutionLogger(),
      this.createValidationDebugger(),
      this.createRequestDumper(),
      this.createResponseDumper()
    ];
  }

  /**
   * Create hook execution logger
   */
  private createHookExecutionLogger(): HookDefinition {
    return {
      name: 'hook-execution-logger',
      phase: 'preRequest',
      priority: 999, // Highest priority
      handler: async (context: HttpRequestContext) => {
        console.log('🪝 Starting request processing', {
          requestId: context.requestId,
          method: context.method,
          url: context.url
        });

        return context;
      }
    };
  }

  /**
   * Create validation debugger
   */
  private createValidationDebugger(): HookDefinition {
    return {
      name: 'validation-debugger',
      phase: 'preHandler',
      priority: 85,
      handler: async (context: HttpRequestContext) => {
        if (['create', 'update', 'patch'].includes(context.operation!) && context.body) {
          console.log('🔍 Validation Debug:', {
            resourceType: context.resourceType,
            operation: context.operation,
            resourceId: context.body.id,
            bodyKeys: Object.keys(context.body),
            bodySize: JSON.stringify(context.body).length
          });
        }

        return context;
      }
    };
  }

  /**
   * Create request dumper
   */
  private createRequestDumper(): HookDefinition {
    return {
      name: 'request-dumper',
      phase: 'preRequest',
      priority: 98,
      handler: async (context: HttpRequestContext) => {
        console.log('📥 Request Details:', {
          id: context.requestId,
          method: context.method,
          url: context.url,
          resourceType: context.resourceType,
          operation: context.operation,
          headers: this.sanitizeHeaders(context.headers),
          params: context.params,
          query: context.query,
          bodyPreview: this.getBodyPreview(context.body)
        });

        return context;
      }
    };
  }

  /**
   * Create response dumper
   */
  private createResponseDumper(): HookDefinition {
    return {
      name: 'response-dumper',
      phase: 'onResponse',
      priority: 98,
      handler: async (context: HttpResponseContext) => {
        const duration = Date.now() - (context as any).startTime || 0;

        console.log('📤 Response Details:', {
          requestId: (context as any).requestId,
          statusCode: context.statusCode,
          duration: `${duration}ms`,
          headers: context.responseHeaders,
          bodyPreview: this.getBodyPreview(context.responseBody)
        });

        return context;
      }
    };
  }

  /**
   * Sanitize headers to hide sensitive data
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitive = ['authorization', 'cookie', 'x-api-key', 'api-key', 'access-token'];
    const sanitized = { ...headers };

    sensitive.forEach(key => {
      const lowerKey = key.toLowerCase();
      for (const headerKey in sanitized) {
        if (headerKey.toLowerCase() === lowerKey) {
          sanitized[headerKey] = '[REDACTED]';
        }
      }
    });

    return sanitized;
  }

  /**
   * Get body preview for logging
   */
  private getBodyPreview(body: any): any {
    if (!body) {
      return null;
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const maxLength = 200;

    if (bodyStr.length > maxLength) {
      return bodyStr.substring(0, maxLength) + `... (${bodyStr.length} chars total)`;
    }

    return body;
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.isDevelopment = enabled;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode(): boolean {
    return this.isDevelopment;
  }
}

/**
 * Create debug support instance from environment
 */
export function createDebugSupport(): DebugSupport {
  const isDevelopment =
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG === 'true' ||
    process.env.ATOMIC_DEBUG === 'true';

  return new DebugSupport(isDevelopment);
}