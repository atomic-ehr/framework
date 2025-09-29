/**
 * Error handling and mapping for FHIR validation
 */

import type { OperationOutcome, OperationOutcomeIssue } from './types.js';

/**
 * Validation error from fhirschema (matching actual API)
 */
interface ValidationError {
  code?: string;
  message?: string;
  schemaPath?: string;
  path?: string;
}

/**
 * Map validation error type to FHIR issue code
 */
export function mapValidationErrorCode(error: ValidationError): string {
  const errorType = error.code || 'unknown';

  // Map FHIRSchema error codes to FHIR issue codes
  const mapping: Record<string, string> = {
    'FS001': 'structure', // UnknownElement
    'FS002': 'not-supported', // UnknownSchema
    'FS003': 'structure', // ExpectedArray
    'FS004': 'structure', // UnexpectedArray
    'FS005': 'invalid', // UnknownKeyword
    'FS006': 'value', // WrongType
    'FS007': 'invariant', // SlicingUnmatched
    'FS008': 'invariant', // SlicingAmbiguous
    'FS009': 'invariant', // SliceCardinality
    'unknown': 'invalid'
  };

  return mapping[errorType] || 'invalid';
}

/**
 * Create FHIR OperationOutcome from validation errors
 */
export function createOperationOutcome(
  errors: ValidationError[],
  resourceType?: string
): OperationOutcome {
  const issues: OperationOutcomeIssue[] = errors.map(error => {
    const issue: OperationOutcomeIssue = {
      severity: 'error',
      code: mapValidationErrorCode(error),
      diagnostics: formatErrorMessage(error, resourceType)
    };

    // Add expression (FHIRPath) if path is available
    if (error.path) {
      issue.expression = [error.path];
    }

    return issue;
  });

  return {
    resourceType: 'OperationOutcome',
    issue: issues
  };
}

/**
 * Create OperationOutcome for profile validation errors
 */
export function createProfileValidationOperationOutcome(
  errors: ValidationError[],
  profileUrl: string
): OperationOutcome {
  const issues: OperationOutcomeIssue[] = errors.map(error => {
    const issue: OperationOutcomeIssue = {
      severity: 'error',
      code: 'structure',
      diagnostics: `Profile validation failed for ${profileUrl}: ${formatErrorMessage(error)}`
    };

    if (error.path) {
      issue.expression = [error.path];
    }

    return issue;
  });

  return {
    resourceType: 'OperationOutcome',
    issue: issues
  };
}

/**
 * Create OperationOutcome for unexpected validation errors
 */
export function createValidationErrorOperationOutcome(
  error: Error,
  resourceType?: string
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{
      severity: 'error',
      code: 'exception',
      diagnostics: resourceType
        ? `Validation error for ${resourceType}: ${error.message}`
        : `Validation error: ${error.message}`
    }]
  };
}

/**
 * Format validation error message
 */
function formatErrorMessage(error: ValidationError, resourceType?: string): string {
  const prefix = resourceType ? `${resourceType} validation failed: ` : 'Validation failed: ';

  if (error.message) {
    return prefix + error.message;
  }

  const path = error.path || 'root';
  const errorCode = error.code || 'unknown error';

  return `${prefix}${errorCode} at ${path}`;
}

/**
 * Format path to FHIRPath expression
 */
function formatPath(path: string): string {
  return path;
}