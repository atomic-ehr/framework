/**
 * Type definitions for error handling
 */

import type { OperationOutcome, OperationOutcomeIssue } from '../types.js';

/**
 * FHIR issue severity codes
 */
export type IssueSeverity = 'fatal' | 'error' | 'warning' | 'information';

/**
 * FHIR issue codes
 */
export type IssueCode =
  | 'invalid'
  | 'structure'
  | 'required'
  | 'value'
  | 'invariant'
  | 'security'
  | 'login'
  | 'unknown'
  | 'expired'
  | 'forbidden'
  | 'suppressed'
  | 'processing'
  | 'not-supported'
  | 'duplicate'
  | 'multiple-matches'
  | 'not-found'
  | 'deleted'
  | 'too-long'
  | 'code-invalid'
  | 'extension'
  | 'too-costly'
  | 'business-rule'
  | 'conflict'
  | 'transient'
  | 'lock-error'
  | 'no-store'
  | 'exception'
  | 'timeout'
  | 'incomplete'
  | 'throttled'
  | 'informational';

/**
 * Configuration for error handler
 */
export interface ErrorHandlerConfig {
  /** Include stack trace in error responses (development only) */
  includeStackTrace?: boolean;

  /** Enable error logging */
  logErrors?: boolean;

  /** Log level for errors */
  logLevel?: 'error' | 'warn' | 'info' | 'debug';

  /** Sanitize error messages to hide internal details */
  sanitizeErrors?: boolean;

  /** Provide detailed validation error messages */
  detailedValidationErrors?: boolean;

  /** Enable error metrics collection */
  enableErrorMetrics?: boolean;
}

/**
 * Configuration for request/response logging
 */
export interface LoggingConfig {
  /** Log incoming requests */
  logRequests?: boolean;

  /** Log outgoing responses */
  logResponses?: boolean;

  /** Log request/response bodies */
  logBodies?: boolean;

  /** Log request/response headers */
  logHeaders?: boolean;

  /** Threshold in ms for slow request warnings */
  slowRequestThreshold?: number;

  /** Headers to sanitize in logs */
  sanitizeHeaders?: string[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Error type/code */
  type: string;

  /** Error message */
  message: string;

  /** JSON path to the field */
  path?: string;

  /** Location in the resource */
  location?: string;

  /** Allowed values for enum errors */
  allowedValues?: string[];

  /** Constraint that was violated */
  constraint?: string;

  /** Additional context */
  context?: {
    resourceType?: string;
    elementPath?: string;
    attemptedValue?: any;
    allowedValues?: string[];
    constraint?: string;
  };
}

/**
 * Error metrics data
 */
export interface ErrorMetrics {
  /** Total errors */
  totalErrors: number;

  /** Errors by status code */
  errorsByStatusCode: Map<number, number>;

  /** Errors by type */
  errorsByType: Map<string, number>;

  /** Errors by resource type */
  errorsByResourceType: Map<string, number>;

  /** Average error rate */
  errorRate: number;

  /** Last error timestamp */
  lastErrorTime?: number;
}

/**
 * Export OperationOutcome types for convenience
 */
export type { OperationOutcome, OperationOutcomeIssue };