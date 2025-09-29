/**
 * Validation bridge - integrates @atomic-ehr/fhirschema with hooks-based server
 *
 * @module @atomic-ehr/validation-bridge
 */

// Core bridge
export { ValidationBridge } from './bridge.js';

// Metrics collection
export { ValidationMetricsCollector } from './metrics.js';

// Error handling
export {
  mapValidationErrorCode,
  createOperationOutcome,
  createProfileValidationOperationOutcome,
  createValidationErrorOperationOutcome
} from './errors.js';

// Types
export type {
  ValidationBridgeConfig,
  OperationOutcome,
  OperationOutcomeIssue,
  ValidationMetrics,
  ExtendedValidationResult,
  ValidationError,
  ValidationResult
} from './types.js';

export { FhirValidationError } from './types.js';

// Re-export useful types from dependencies
export type {
  FHIRSchema
} from '@atomic-ehr/fhirschema';

export type {
  HookDefinition
} from '@atomic-ehr/core';