/**
 * Validator for FHIR CapabilityStatement
 */

import type { CapabilityStatement, ValidationResult, ValidationError } from './types.js';

/**
 * Validates FHIR CapabilityStatement resources
 */
export class CapabilityStatementValidator {
  /**
   * Validate a capability statement
   */
  validateCapabilityStatement(capability: CapabilityStatement): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate required fields
    this.validateRequiredFields(capability, errors);

    // Validate status
    this.validateStatus(capability, errors);

    // Validate kind
    this.validateKind(capability, errors);

    // Validate date
    this.validateDate(capability, errors);

    // Validate fhirVersion
    this.validateFhirVersion(capability, errors);

    // Validate format
    this.validateFormat(capability, errors);

    // Validate rest component
    if (capability.rest) {
      this.validateRestComponent(capability.rest, errors);
    }

    // Validate software component
    if (capability.software) {
      this.validateSoftwareComponent(capability.software, errors);
    }

    // Validate implementation component
    if (capability.implementation) {
      this.validateImplementationComponent(capability.implementation, errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate required fields
   */
  private validateRequiredFields(capability: CapabilityStatement, errors: ValidationError[]): void {
    if (!capability.status) {
      errors.push({
        path: 'CapabilityStatement.status',
        message: 'status is required'
      });
    }

    if (!capability.date) {
      errors.push({
        path: 'CapabilityStatement.date',
        message: 'date is required'
      });
    }

    if (!capability.kind) {
      errors.push({
        path: 'CapabilityStatement.kind',
        message: 'kind is required'
      });
    }

    if (!capability.fhirVersion) {
      errors.push({
        path: 'CapabilityStatement.fhirVersion',
        message: 'fhirVersion is required'
      });
    }

    if (!capability.format || capability.format.length === 0) {
      errors.push({
        path: 'CapabilityStatement.format',
        message: 'format is required and must have at least one value'
      });
    }
  }

  /**
   * Validate status field
   */
  private validateStatus(capability: CapabilityStatement, errors: ValidationError[]): void {
    const validStatuses = ['draft', 'active', 'retired', 'unknown'];

    if (capability.status && !validStatuses.includes(capability.status)) {
      errors.push({
        path: 'CapabilityStatement.status',
        message: `status must be one of: ${validStatuses.join(', ')}`
      });
    }
  }

  /**
   * Validate kind field
   */
  private validateKind(capability: CapabilityStatement, errors: ValidationError[]): void {
    const validKinds = ['instance', 'capability', 'requirements'];

    if (capability.kind && !validKinds.includes(capability.kind)) {
      errors.push({
        path: 'CapabilityStatement.kind',
        message: `kind must be one of: ${validKinds.join(', ')}`
      });
    }
  }

  /**
   * Validate date field
   */
  private validateDate(capability: CapabilityStatement, errors: ValidationError[]): void {
    if (capability.date) {
      try {
        const date = new Date(capability.date);
        if (isNaN(date.getTime())) {
          errors.push({
            path: 'CapabilityStatement.date',
            message: 'date must be a valid ISO 8601 datetime'
          });
        }
      } catch (e) {
        errors.push({
          path: 'CapabilityStatement.date',
          message: 'date must be a valid ISO 8601 datetime'
        });
      }
    }
  }

  /**
   * Validate fhirVersion field
   */
  private validateFhirVersion(capability: CapabilityStatement, errors: ValidationError[]): void {
    if (capability.fhirVersion) {
      const validVersions = ['0.01', '0.05', '0.06', '0.11', '0.0.80', '0.0.81', '0.0.82',
        '0.4.0', '0.5.0', '1.0.0', '1.0.1', '1.0.2', '1.1.0', '1.4.0', '1.6.0',
        '1.8.0', '3.0.0', '3.0.1', '3.0.2', '3.3.0', '3.5.0', '4.0.0', '4.0.1'];

      if (!validVersions.includes(capability.fhirVersion)) {
        errors.push({
          path: 'CapabilityStatement.fhirVersion',
          message: `fhirVersion ${capability.fhirVersion} is not a known FHIR version`
        });
      }
    }
  }

  /**
   * Validate format field
   */
  private validateFormat(capability: CapabilityStatement, errors: ValidationError[]): void {
    if (capability.format) {
      const validFormats = [
        'application/fhir+json',
        'application/fhir+xml',
        'application/fhir+turtle',
        'application/json',
        'application/xml',
        'text/xml'
      ];

      for (const format of capability.format) {
        if (!validFormats.some(valid => format.includes(valid))) {
          errors.push({
            path: 'CapabilityStatement.format',
            message: `format '${format}' is not a recognized FHIR format`
          });
        }
      }
    }
  }

  /**
   * Validate REST component
   */
  private validateRestComponent(rest: any[], errors: ValidationError[]): void {
    for (let i = 0; i < rest.length; i++) {
      const restComponent = rest[i];

      // Validate mode
      if (!restComponent.mode) {
        errors.push({
          path: `CapabilityStatement.rest[${i}].mode`,
          message: 'mode is required for REST component'
        });
      } else if (!['client', 'server'].includes(restComponent.mode)) {
        errors.push({
          path: `CapabilityStatement.rest[${i}].mode`,
          message: 'mode must be either "client" or "server"'
        });
      }

      // Validate resources
      if (restComponent.resource) {
        this.validateResourceComponents(restComponent.resource, i, errors);
      }

      // Validate interactions
      if (restComponent.interaction) {
        this.validateSystemInteractions(restComponent.interaction, i, errors);
      }
    }
  }

  /**
   * Validate resource components
   */
  private validateResourceComponents(resources: any[], restIndex: number, errors: ValidationError[]): void {
    for (let j = 0; j < resources.length; j++) {
      const resource = resources[j];

      // Validate type
      if (!resource.type) {
        errors.push({
          path: `CapabilityStatement.rest[${restIndex}].resource[${j}].type`,
          message: 'type is required for resource component'
        });
      }

      // Validate interaction codes
      if (resource.interaction) {
        const validInteractions = [
          'read', 'vread', 'update', 'patch', 'delete',
          'history-instance', 'history-type', 'create', 'search-type'
        ];

        for (let k = 0; k < resource.interaction.length; k++) {
          const interaction = resource.interaction[k];
          if (!interaction.code) {
            errors.push({
              path: `CapabilityStatement.rest[${restIndex}].resource[${j}].interaction[${k}].code`,
              message: 'code is required for interaction'
            });
          } else if (!validInteractions.includes(interaction.code)) {
            errors.push({
              path: `CapabilityStatement.rest[${restIndex}].resource[${j}].interaction[${k}].code`,
              message: `code must be one of: ${validInteractions.join(', ')}`
            });
          }
        }
      }

      // Validate versioning
      if (resource.versioning) {
        const validVersioning = ['no-version', 'versioned', 'versioned-update'];
        if (!validVersioning.includes(resource.versioning)) {
          errors.push({
            path: `CapabilityStatement.rest[${restIndex}].resource[${j}].versioning`,
            message: `versioning must be one of: ${validVersioning.join(', ')}`
          });
        }
      }

      // Validate conditionalRead
      if (resource.conditionalRead) {
        const validConditionalRead = ['not-supported', 'modified-since', 'not-match', 'full-support'];
        if (!validConditionalRead.includes(resource.conditionalRead)) {
          errors.push({
            path: `CapabilityStatement.rest[${restIndex}].resource[${j}].conditionalRead`,
            message: `conditionalRead must be one of: ${validConditionalRead.join(', ')}`
          });
        }
      }

      // Validate conditionalDelete
      if (resource.conditionalDelete) {
        const validConditionalDelete = ['not-supported', 'single', 'multiple'];
        if (!validConditionalDelete.includes(resource.conditionalDelete)) {
          errors.push({
            path: `CapabilityStatement.rest[${restIndex}].resource[${j}].conditionalDelete`,
            message: `conditionalDelete must be one of: ${validConditionalDelete.join(', ')}`
          });
        }
      }

      // Validate search parameters
      if (resource.searchParam) {
        this.validateSearchParameters(resource.searchParam, restIndex, j, errors);
      }
    }
  }

  /**
   * Validate search parameters
   */
  private validateSearchParameters(
    searchParams: any[],
    restIndex: number,
    resourceIndex: number,
    errors: ValidationError[]
  ): void {
    const validTypes = ['number', 'date', 'string', 'token', 'reference', 'composite', 'quantity', 'uri', 'special'];

    for (let k = 0; k < searchParams.length; k++) {
      const param = searchParams[k];

      if (!param.name) {
        errors.push({
          path: `CapabilityStatement.rest[${restIndex}].resource[${resourceIndex}].searchParam[${k}].name`,
          message: 'name is required for search parameter'
        });
      }

      if (!param.type) {
        errors.push({
          path: `CapabilityStatement.rest[${restIndex}].resource[${resourceIndex}].searchParam[${k}].type`,
          message: 'type is required for search parameter'
        });
      } else if (!validTypes.includes(param.type)) {
        errors.push({
          path: `CapabilityStatement.rest[${restIndex}].resource[${resourceIndex}].searchParam[${k}].type`,
          message: `type must be one of: ${validTypes.join(', ')}`
        });
      }
    }
  }

  /**
   * Validate system interactions
   */
  private validateSystemInteractions(interactions: any[], restIndex: number, errors: ValidationError[]): void {
    const validSystemInteractions = ['transaction', 'batch', 'search-system', 'history-system'];

    for (let k = 0; k < interactions.length; k++) {
      const interaction = interactions[k];

      if (!interaction.code) {
        errors.push({
          path: `CapabilityStatement.rest[${restIndex}].interaction[${k}].code`,
          message: 'code is required for system interaction'
        });
      } else if (!validSystemInteractions.includes(interaction.code)) {
        errors.push({
          path: `CapabilityStatement.rest[${restIndex}].interaction[${k}].code`,
          message: `code must be one of: ${validSystemInteractions.join(', ')}`
        });
      }
    }
  }

  /**
   * Validate software component
   */
  private validateSoftwareComponent(software: any, errors: ValidationError[]): void {
    if (!software.name) {
      errors.push({
        path: 'CapabilityStatement.software.name',
        message: 'name is required for software component'
      });
    }
  }

  /**
   * Validate implementation component
   */
  private validateImplementationComponent(implementation: any, errors: ValidationError[]): void {
    if (!implementation.description) {
      errors.push({
        path: 'CapabilityStatement.implementation.description',
        message: 'description is required for implementation component'
      });
    }
  }
}