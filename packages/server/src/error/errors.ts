/**
 * FHIR error class hierarchy
 */

import type { OperationOutcome, IssueSeverity, IssueCode, ValidationError } from './types.js';

/**
 * Base FHIR error class
 */
export abstract class FhirError extends Error {
  abstract statusCode: number;

  constructor(
    message: string,
    public code: IssueCode = 'exception',
    public severity: IssueSeverity = 'error',
    public diagnostics?: string,
    public expression?: string[],
    public location?: string[]
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get OperationOutcome representation
   */
  get operationOutcome(): OperationOutcome {
    return this.createOperationOutcome();
  }

  /**
   * Create OperationOutcome from error details
   */
  protected createOperationOutcome(): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: this.severity,
        code: this.code,
        diagnostics: this.diagnostics || this.message,
        expression: this.expression,
        location: this.location
      }]
    };
  }

  /**
   * Convert to JSON (for serialization)
   */
  toJSON() {
    return this.operationOutcome;
  }
}

/**
 * 400 Bad Request - Invalid request syntax
 */
export class FhirBadRequestError extends FhirError {
  statusCode = 400;

  constructor(message: string = 'Bad request', diagnostics?: string) {
    super(message, 'invalid', 'error', diagnostics);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class FhirUnauthorizedError extends FhirError {
  statusCode = 401;

  constructor(message: string = 'Authentication required', diagnostics?: string) {
    super(message, 'security', 'error', diagnostics);
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class FhirForbiddenError extends FhirError {
  statusCode = 403;

  constructor(message: string = 'Insufficient permissions', diagnostics?: string) {
    super(message, 'forbidden', 'error', diagnostics);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class FhirNotFoundError extends FhirError {
  statusCode = 404;

  constructor(resourceType: string, id: string) {
    const message = `${resourceType} with id ${id} not found`;
    const diagnostics = `Resource ${resourceType}/${id} does not exist`;
    super(message, 'not-found', 'error', diagnostics);
    this.location = [`${resourceType}/${id}`];
  }
}

/**
 * 405 Method Not Allowed - HTTP method not supported
 */
export class FhirMethodNotAllowedError extends FhirError {
  statusCode = 405;

  constructor(method: string, resourceType?: string) {
    const message = resourceType
      ? `${method} method not allowed for ${resourceType}`
      : `${method} method not allowed`;
    super(message, 'not-supported', 'error');
  }
}

/**
 * 409 Conflict - Resource conflict
 */
export class FhirConflictError extends FhirError {
  statusCode = 409;

  constructor(message: string, resourceType?: string, id?: string) {
    const diagnostics = resourceType && id
      ? `Conflict with existing ${resourceType}/${id}`
      : message;
    super(message, 'conflict', 'error', diagnostics);
    if (resourceType && id) {
      this.location = [`${resourceType}/${id}`];
    }
  }
}

/**
 * 410 Gone - Resource deleted
 */
export class FhirGoneError extends FhirError {
  statusCode = 410;

  constructor(resourceType: string, id: string) {
    const message = `${resourceType}/${id} has been deleted`;
    super(message, 'deleted', 'error');
    this.location = [`${resourceType}/${id}`];
  }
}

/**
 * 412 Precondition Failed - Conditional operation failed
 */
export class FhirPreconditionFailedError extends FhirError {
  statusCode = 412;

  constructor(message: string = 'Precondition failed') {
    super(message, 'conflict', 'error');
  }
}

/**
 * 413 Payload Too Large - Request entity too large
 */
export class FhirPayloadTooLargeError extends FhirError {
  statusCode = 413;

  constructor(size: number, maxSize: number) {
    const message = `Request payload too large: ${size} bytes (max: ${maxSize} bytes)`;
    super(message, 'too-long', 'error');
  }
}

/**
 * 415 Unsupported Media Type - Content type not supported
 */
export class FhirUnsupportedMediaTypeError extends FhirError {
  statusCode = 415;

  constructor(contentType: string) {
    const message = `Unsupported media type: ${contentType}`;
    super(message, 'not-supported', 'error');
  }
}

/**
 * 422 Unprocessable Entity - Validation errors
 */
export class FhirValidationError extends FhirError {
  statusCode = 422;
  validationErrors: ValidationError[] = [];

  constructor(
    message: string,
    validationErrors: ValidationError[] = [],
    diagnostics?: string
  ) {
    super(message, 'invalid', 'error', diagnostics);
    this.validationErrors = validationErrors;
  }

  override get operationOutcome(): OperationOutcome {
    if (this.validationErrors.length === 0) {
      return this.createOperationOutcome();
    }

    return {
      resourceType: 'OperationOutcome',
      issue: this.validationErrors.map(error => ({
        severity: 'error' as const,
        code: this.mapValidationErrorCode(error.type),
        diagnostics: error.message,
        expression: error.path ? [error.path] : undefined,
        location: error.location ? [error.location] : undefined
      }))
    };
  }

  protected mapValidationErrorCode(type: string): IssueCode {
    const mapping: Record<string, IssueCode> = {
      'required': 'required',
      'type': 'structure',
      'format': 'invalid',
      'enum': 'code-invalid',
      'constraint': 'invariant',
      'cardinality': 'value'
    };
    return mapping[type] || 'invalid';
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class FhirTooManyRequestsError extends FhirError {
  statusCode = 429;

  constructor(retryAfter?: number) {
    const message = 'Too many requests';
    const diagnostics = retryAfter
      ? `Rate limit exceeded. Retry after ${retryAfter} seconds`
      : 'Rate limit exceeded';
    super(message, 'throttled', 'error', diagnostics);
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class FhirInternalError extends FhirError {
  statusCode = 500;

  constructor(message: string = 'Internal server error', cause?: Error) {
    const diagnostics = cause ? `${message}: ${cause.message}` : message;
    super(message, 'exception', 'error', diagnostics);
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * 501 Not Implemented - Operation not implemented
 */
export class FhirNotImplementedError extends FhirError {
  statusCode = 501;

  constructor(operation: string, resourceType?: string) {
    const message = resourceType
      ? `${operation} operation not implemented for ${resourceType}`
      : `${operation} operation not implemented`;
    super(message, 'not-supported', 'error');
  }
}

/**
 * 502 Bad Gateway - Upstream service error
 */
export class FhirBadGatewayError extends FhirError {
  statusCode = 502;

  constructor(message: string = 'Bad gateway', service?: string) {
    const diagnostics = service
      ? `Error communicating with ${service}`
      : message;
    super(message, 'transient', 'error', diagnostics);
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class FhirServiceUnavailableError extends FhirError {
  statusCode = 503;

  constructor(message: string = 'Service unavailable', retryAfter?: number) {
    const diagnostics = retryAfter
      ? `${message}. Retry after ${retryAfter} seconds`
      : message;
    super(message, 'transient', 'error', diagnostics);
  }
}

/**
 * 504 Gateway Timeout - Upstream service timeout
 */
export class FhirGatewayTimeoutError extends FhirError {
  statusCode = 504;

  constructor(message: string = 'Gateway timeout', service?: string) {
    const diagnostics = service
      ? `Timeout waiting for ${service}`
      : message;
    super(message, 'timeout', 'error', diagnostics);
  }
}

/**
 * Check if an error is a FHIR error
 */
export function isFhirError(error: any): error is FhirError {
  return error instanceof FhirError;
}

/**
 * Check if an error is a validation error
 */
export function isFhirValidationError(error: any): error is FhirValidationError {
  return error instanceof FhirValidationError;
}