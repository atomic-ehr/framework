/**
 * Enhanced validation error reporting
 */

import type { OperationOutcome, ValidationError } from './types.js';
import { FhirValidationError } from './errors.js';

/**
 * Enhanced validation error with detailed diagnostics
 */
export class EnhancedValidationError extends FhirValidationError {
  constructor(
    resourceType: string,
    validationErrors: ValidationError[],
    resource?: any
  ) {
    super(`${resourceType} validation failed`, validationErrors);
    this.enhanceValidationErrors(resourceType, resource);
  }

  /**
   * Enhance validation errors with additional context
   */
  private enhanceValidationErrors(resourceType: string, resource?: any): void {
    this.validationErrors = this.validationErrors.map(error => ({
      ...error,
      context: {
        resourceType,
        elementPath: error.path,
        attemptedValue: resource && error.path
          ? this.getValueAtPath(resource, error.path)
          : undefined,
        allowedValues: error.allowedValues,
        constraint: error.constraint
      }
    })) as ValidationError[];
  }

  /**
   * Get value at path in object
   */
  private getValueAtPath(obj: any, path: string): any {
    try {
      return path.split('.').reduce((current, key) => {
        if (current === null || current === undefined) {
          return undefined;
        }
        return current[key];
      }, obj);
    } catch {
      return undefined;
    }
  }

  /**
   * Get enhanced OperationOutcome
   */
  override get operationOutcome(): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: this.validationErrors.map(error => ({
        severity: 'error' as const,
        code: this.mapValidationErrorCode(error.type),
        diagnostics: this.createDetailedDiagnostics(error),
        expression: error.path ? [error.path] : undefined,
        location: error.location ? [error.location] : undefined,
        details: {
          coding: [{
            system: 'http://atomic-ehr.org/fhir/CodeSystem/validation-error-types',
            code: error.type,
            display: this.getErrorTypeDisplay(error.type)
          }],
          text: error.message
        }
      }))
    };
  }

  /**
   * Create detailed diagnostics for an error
   */
  private createDetailedDiagnostics(error: ValidationError): string {
    const base = `Validation failed for '${error.path || 'resource'}': ${error.message}`;

    const parts: string[] = [base];

    if (error.context?.attemptedValue !== undefined) {
      const valueStr = JSON.stringify(error.context.attemptedValue);
      parts.push(`Attempted value: ${valueStr}`);
    }

    if (error.context?.allowedValues && error.context.allowedValues.length > 0) {
      parts.push(`Allowed values: ${error.context.allowedValues.join(', ')}`);
    }

    if (error.context?.constraint) {
      parts.push(`Constraint: ${error.context.constraint}`);
    }

    return parts.join('. ');
  }

  /**
   * Get display text for error type
   */
  private getErrorTypeDisplay(type: string): string {
    const displays: Record<string, string> = {
      'required': 'Required field missing',
      'type': 'Invalid data type',
      'format': 'Invalid format',
      'enum': 'Invalid enumeration value',
      'constraint': 'Constraint violation',
      'cardinality': 'Cardinality violation',
      'reference': 'Invalid reference',
      'code': 'Invalid code',
      'pattern': 'Pattern mismatch',
      'length': 'Length constraint violation'
    };
    return displays[type] || 'Validation error';
  }

  /**
   * Map validation error type to FHIR issue code
   */
  protected override mapValidationErrorCode(type: string): any {
    const mapping: Record<string, string> = {
      'required': 'required',
      'type': 'structure',
      'format': 'invalid',
      'enum': 'code-invalid',
      'constraint': 'invariant',
      'cardinality': 'value',
      'reference': 'invalid',
      'code': 'code-invalid',
      'pattern': 'invalid',
      'length': 'too-long'
    };
    return mapping[type] || 'invalid';
  }
}

/**
 * Create validation error from validation results
 */
export function createValidationError(
  resourceType: string,
  errors: ValidationError[],
  resource?: any,
  enhanced: boolean = true
): FhirValidationError {
  if (enhanced) {
    return new EnhancedValidationError(resourceType, errors, resource);
  }
  return new FhirValidationError(`${resourceType} validation failed`, errors);
}

/**
 * Validate required fields
 */
export function validateRequiredFields(
  resource: any,
  requiredFields: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of requiredFields) {
    const value = resource[field];
    if (value === undefined || value === null || value === '') {
      errors.push({
        type: 'required',
        message: `Required field '${field}' is missing`,
        path: field
      });
    }
  }

  return errors;
}

/**
 * Validate field types
 */
export function validateFieldTypes(
  resource: any,
  fieldTypes: Record<string, string>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [field, expectedType] of Object.entries(fieldTypes)) {
    const value = resource[field];
    if (value === undefined || value === null) {
      continue; // Skip missing fields (handled by required check)
    }

    const actualType = typeof value;
    if (actualType !== expectedType) {
      errors.push({
        type: 'type',
        message: `Field '${field}' must be of type ${expectedType}, got ${actualType}`,
        path: field
      });
    }
  }

  return errors;
}

/**
 * Validate enum values
 */
export function validateEnumValues(
  resource: any,
  enumFields: Record<string, string[]>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [field, allowedValues] of Object.entries(enumFields)) {
    const value = resource[field];
    if (value === undefined || value === null) {
      continue; // Skip missing fields
    }

    if (!allowedValues.includes(value)) {
      errors.push({
        type: 'enum',
        message: `Field '${field}' has invalid value '${value}'`,
        path: field,
        allowedValues
      });
    }
  }

  return errors;
}