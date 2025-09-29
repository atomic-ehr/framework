/**
 * Central error handler for FHIR server
 */

import type { HookDefinition } from '@atomic-ehr/core';
import type { ErrorContext, HttpResponseContext } from '../types.js';
import type { ErrorHandlerConfig, ErrorMetrics } from './types.js';
import {
  FhirError,
  FhirValidationError,
  FhirNotFoundError,
  FhirUnauthorizedError,
  FhirForbiddenError,
  FhirConflictError,
  FhirTooManyRequestsError,
  FhirInternalError,
  isFhirError
} from './errors.js';

/**
 * Central error handler for FHIR operations
 */
export class ErrorHandler {
  private config: Required<ErrorHandlerConfig>;
  private metrics: ErrorMetrics;

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      includeStackTrace: config.includeStackTrace ?? false,
      logErrors: config.logErrors ?? true,
      logLevel: config.logLevel ?? 'error',
      sanitizeErrors: config.sanitizeErrors ?? true,
      detailedValidationErrors: config.detailedValidationErrors ?? true,
      enableErrorMetrics: config.enableErrorMetrics ?? true
    };

    this.metrics = {
      totalErrors: 0,
      errorsByStatusCode: new Map(),
      errorsByType: new Map(),
      errorsByResourceType: new Map(),
      errorRate: 0
    };
  }

  /**
   * Create error handling hook
   */
  createErrorHandlingHook(): HookDefinition {
    return {
      name: 'fhir-error-handler',
      phase: 'onError',
      priority: 100, // High priority to handle first
      handler: async (context: ErrorContext) => {
        await this.handleError(context);
        return context;
      }
    };
  }

  /**
   * Handle error from context
   */
  private async handleError(context: ErrorContext): Promise<void> {
    const { error } = context;

    // Log the error
    if (this.config.logErrors && context.logger) {
      this.logError(error, context);
    }

    // Convert to FHIR error if needed
    const fhirError = this.convertToFhirError(error, context);

    // Create error response
    const response = this.createErrorResponse(fhirError, context);

    // Set response and mark as handled
    if (context.setResponse) {
      context.setResponse(response);
    }
    context.handled = true;

    // Record metrics
    if (this.config.enableErrorMetrics) {
      this.recordErrorMetrics(fhirError, context);
    }

    // Add diagnostic information
    if (context.addDiagnostic) {
      context.addDiagnostic({
        level: 'error',
        code: 'error-handled',
        message: `Error handled: ${fhirError.constructor.name}`,
        source: 'fhir-error-handler',
        timestamp: Date.now(),
        metadata: {
          statusCode: fhirError.statusCode,
          errorCode: fhirError.code,
          resourceType: context.resourceType,
          operation: context.operation
        }
      });
    }
  }

  /**
   * Convert any error to FHIR error
   */
  private convertToFhirError(error: Error, context: ErrorContext): FhirError {
    // If already a FHIR error, return as-is
    if (isFhirError(error)) {
      return error;
    }

    // Convert common error types by name
    switch (error.name) {
      case 'ValidationError':
        return new FhirValidationError(error.message);

      case 'NotFoundError':
        return new FhirNotFoundError(
          context.resourceType || 'Resource',
          context.params?.id as string || 'unknown'
        );

      case 'UnauthorizedError':
      case 'AuthenticationError':
        return new FhirUnauthorizedError(error.message);

      case 'ForbiddenError':
      case 'AuthorizationError':
        return new FhirForbiddenError(error.message);

      case 'ConflictError':
        return new FhirConflictError(
          error.message,
          context.resourceType,
          context.params?.id as string
        );

      case 'TooManyRequestsError':
      case 'RateLimitError':
        return new FhirTooManyRequestsError();

      default:
        // Default to internal error
        return new FhirInternalError(
          this.config.sanitizeErrors ? 'Internal server error' : error.message,
          error
        );
    }
  }

  /**
   * Create error response from FHIR error
   */
  private createErrorResponse(
    error: FhirError,
    context: ErrorContext
  ): HttpResponseContext {
    const operationOutcome = error.operationOutcome;

    // Add stack trace in development
    if (this.config.includeStackTrace && error.stack) {
      operationOutcome.issue.forEach(issue => {
        issue.diagnostics = `${issue.diagnostics}\n\nStack trace:\n${error.stack}`;
      });
    }

    // Add request context information to issues
    operationOutcome.issue.forEach(issue => {
      if (!issue.location && context.url) {
        issue.location = [context.url];
      }
    });

    return {
      statusCode: error.statusCode,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Error-Type': error.constructor.name,
        'X-Request-ID': context.requestId
      },
      responseBody: operationOutcome,
      timing: {
        startTime: context.startTime,
        endTime: Date.now(),
        duration: Date.now() - context.startTime,
        hookDuration: 0
      }
    };
  }

  /**
   * Log error with context
   */
  private logError(error: Error, context: ErrorContext): void {
    const logger = context.logger;
    if (!logger) return;

    const logData = {
      error: {
        name: error.name,
        message: error.message,
        stack: this.config.includeStackTrace ? error.stack : undefined
      },
      request: {
        id: context.requestId,
        method: context.method,
        url: context.url,
        resourceType: context.resourceType,
        operation: context.operation,
        userAgent: context.headers['user-agent'] || context.headers['User-Agent'],
        ip: context.headers['x-forwarded-for'] || context.headers['x-real-ip']
      },
      timestamp: new Date().toISOString()
    };

    const logLevel = this.config.logLevel;
    if (logger[logLevel]) {
      logger[logLevel]('FHIR operation error', logData);
    } else if (logger.error) {
      logger.error('FHIR operation error', logData);
    }
  }

  /**
   * Record error metrics
   */
  private recordErrorMetrics(error: FhirError, context: ErrorContext): void {
    this.metrics.totalErrors++;
    this.metrics.lastErrorTime = Date.now();

    // Count by status code
    const statusCount = this.metrics.errorsByStatusCode.get(error.statusCode) || 0;
    this.metrics.errorsByStatusCode.set(error.statusCode, statusCount + 1);

    // Count by error type
    const typeCount = this.metrics.errorsByType.get(error.constructor.name) || 0;
    this.metrics.errorsByType.set(error.constructor.name, typeCount + 1);

    // Count by resource type
    if (context.resourceType) {
      const resourceCount = this.metrics.errorsByResourceType.get(context.resourceType) || 0;
      this.metrics.errorsByResourceType.set(context.resourceType, resourceCount + 1);
    }
  }

  /**
   * Get error metrics
   */
  getMetrics(): ErrorMetrics {
    return {
      ...this.metrics,
      errorsByStatusCode: new Map(this.metrics.errorsByStatusCode),
      errorsByType: new Map(this.metrics.errorsByType),
      errorsByResourceType: new Map(this.metrics.errorsByResourceType)
    };
  }

  /**
   * Get error metrics summary
   */
  getSummary() {
    return {
      totalErrors: this.metrics.totalErrors,
      errorRate: this.metrics.errorRate,
      lastErrorTime: this.metrics.lastErrorTime
        ? new Date(this.metrics.lastErrorTime).toISOString()
        : undefined,
      topErrors: Array.from(this.metrics.errorsByType.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([type, count]) => ({ type, count })),
      statusCodeDistribution: Array.from(this.metrics.errorsByStatusCode.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ statusCode: code, count })),
      resourceTypeErrors: Array.from(this.metrics.errorsByResourceType.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([resourceType, count]) => ({ resourceType, count }))
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalErrors: 0,
      errorsByStatusCode: new Map(),
      errorsByType: new Map(),
      errorsByResourceType: new Map(),
      errorRate: 0
    };
  }
}