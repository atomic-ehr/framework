/**
 * Error handling module exports
 */

// Error classes
export {
  FhirError,
  FhirBadRequestError,
  FhirUnauthorizedError,
  FhirForbiddenError,
  FhirNotFoundError,
  FhirMethodNotAllowedError,
  FhirConflictError,
  FhirGoneError,
  FhirPreconditionFailedError,
  FhirPayloadTooLargeError,
  FhirUnsupportedMediaTypeError,
  FhirValidationError,
  FhirTooManyRequestsError,
  FhirInternalError,
  FhirNotImplementedError,
  FhirBadGatewayError,
  FhirServiceUnavailableError,
  FhirGatewayTimeoutError,
  isFhirError,
  isFhirValidationError
} from './errors.js';

// Error handler
export { ErrorHandler } from './handler.js';

// Enhanced validation
export {
  EnhancedValidationError,
  createValidationError,
  validateRequiredFields,
  validateFieldTypes,
  validateEnumValues
} from './validation.js';

// Logging
export { RequestResponseLogger } from './logging.js';

// Debug support
export { DebugSupport, createDebugSupport } from './debug.js';

// Types
export type {
  IssueSeverity,
  IssueCode,
  ErrorHandlerConfig,
  LoggingConfig,
  ValidationError,
  ErrorMetrics,
  OperationOutcome,
  OperationOutcomeIssue
} from './types.js';