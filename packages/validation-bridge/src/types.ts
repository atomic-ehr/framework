/**
 * Type definitions for validation bridge
 */

import type { HookDefinition } from '@atomic-ehr/core';
import type { FHIRSchema } from '@atomic-ehr/fhirschema';

/**
 * Re-export validation types to match fhirschema actual API
 */
export interface ValidationError {
  code?: string;
  message?: string;
  schemaPath?: string;
  path?: string;
}

export interface ValidationResult {
  errors: ValidationError[];
}

/**
 * Validation bridge configuration
 */
export interface ValidationBridgeConfig {
  /** Enable/disable validation */
  enabled?: boolean;

  /** Validate on create operations */
  validateOnCreate?: boolean;

  /** Validate on update operations */
  validateOnUpdate?: boolean;

  /** Validate on patch operations */
  validateOnPatch?: boolean;

  /** Strict mode - fail on any validation error */
  strictMode?: boolean;

  /** Enable profile validation */
  profileValidation?: boolean;
}

/**
 * FHIR OperationOutcome resource
 */
export interface OperationOutcome {
  resourceType: 'OperationOutcome';
  issue: OperationOutcomeIssue[];
}

/**
 * FHIR OperationOutcome issue
 */
export interface OperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  diagnostics?: string;
  expression?: string[];
  location?: string[];
}

/**
 * FHIR validation error with OperationOutcome
 */
export class FhirValidationError extends Error {
  public readonly operationOutcome: OperationOutcome;
  public readonly statusCode: number;

  constructor(operationOutcome: OperationOutcome, statusCode: number = 422) {
    super('FHIR validation failed');
    this.name = 'FhirValidationError';
    this.operationOutcome = operationOutcome;
    this.statusCode = statusCode;
  }

  toJSON() {
    return this.operationOutcome;
  }
}

/**
 * Validation metrics
 */
export interface ValidationMetrics {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  validationsByResourceType: Map<string, number>;
  validationErrors: Map<string, number>;
  averageValidationTime: number;
}

/**
 * Extended validation result with additional metadata
 */
export interface ExtendedValidationResult extends ValidationResult {
  resourceType?: string;
  duration?: number;
  timestamp?: number;
}