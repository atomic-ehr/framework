/**
 * Validation bridge - integrates fhirschema validation with hooks system
 */

import { validateSchema, type FHIRSchema } from '@atomic-ehr/fhirschema';
import type { HookDefinition } from '@atomic-ehr/core';
import type { ValidationBridgeConfig, ExtendedValidationResult, ValidationResult } from './types.js';
import { FhirValidationError } from './types.js';

/**
 * Schema resolution context for fhirschema validator
 * Note: This is different from @atomic-ehr/core's AtomicContext
 */
interface SchemaResolutionContext {
  resolveSchema(ctx: SchemaResolutionContext, url: string): FHIRSchema;
}
import {
  createOperationOutcome,
  createProfileValidationOperationOutcome,
  createValidationErrorOperationOutcome
} from './errors.js';

/**
 * Validation bridge class
 */
export class ValidationBridge {
  private config: Required<ValidationBridgeConfig>;
  private schemas: Map<string, FHIRSchema> = new Map();
  private schemaContext: SchemaResolutionContext;

  constructor(config: ValidationBridgeConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      validateOnCreate: config.validateOnCreate ?? true,
      validateOnUpdate: config.validateOnUpdate ?? true,
      validateOnPatch: config.validateOnPatch ?? true,
      strictMode: config.strictMode ?? true,
      profileValidation: config.profileValidation ?? true
    };

    // Create schema resolution context for fhirschema validator
    this.schemaContext = {
      resolveSchema: (ctx: SchemaResolutionContext, url: string): FHIRSchema => {
        const schema = this.schemas.get(url);
        if (!schema) {
          throw new Error(`Schema not found: ${url}`);
        }
        return schema;
      }
    };
  }

  /**
   * Set schemas from loaded packages
   */
  setSchemas(schemas: Map<string, FHIRSchema>): void {
    this.schemas = schemas;
  }

  /**
   * Update a single schema
   */
  updateSchema(resourceType: string, schema: FHIRSchema): void {
    this.schemas.set(resourceType, schema);
  }

  /**
   * Get schema for a resource type
   */
  getSchema(resourceType: string): FHIRSchema | undefined {
    return this.schemas.get(resourceType);
  }

  /**
   * Check if schemas are loaded
   */
  hasSchemasLoaded(): boolean {
    return this.schemas.size > 0;
  }

  /**
   * Create validation hook for resource operations
   */
  createValidationHook(): HookDefinition {
    return {
      name: 'fhir-validation',
      phase: 'preHandler',
      priority: 80,
      handler: async (context: any) => {
        if (!this.shouldValidate(context)) {
          return context;
        }

        const { resourceType, body, operation } = context;

        if (!body || !resourceType) {
          return context;
        }

        const startTime = Date.now();

        try {
          const result = validateSchema(this.schemaContext, {
            schemaUrls: [resourceType],
            resource: body
          });

          if (result.errors.length > 0) {
            const outcome = createOperationOutcome(result.errors, resourceType);
            const error = new FhirValidationError(outcome, 422);

            // Set error response in context
            if (context.setResponse) {
              context.setResponse({
                statusCode: 422,
                responseHeaders: {
                  'Content-Type': 'application/fhir+json; charset=utf-8',
                  'X-Request-ID': context.requestId
                },
                responseBody: outcome,
                timing: {
                  startTime: context.startTime,
                  endTime: Date.now(),
                  duration: Date.now() - context.startTime,
                  hookDuration: Date.now() - startTime
                }
              });
              context.takeOver();
            } else {
              throw error;
            }

            return context;
          }

          // Add validation success diagnostic
          if (context.addDiagnostic) {
            context.addDiagnostic({
              level: 'info',
              code: 'validation-success',
              message: `${resourceType} resource validation successful`,
              source: 'fhir-validation-bridge',
              timestamp: Date.now()
            });
          }

          // Store validation result in context
          (context as any).validationResult = {
            errors: result.errors,
            resourceType,
            duration: Date.now() - startTime,
            timestamp: Date.now()
          } as ExtendedValidationResult;

        } catch (error) {
          if (error instanceof FhirValidationError) {
            throw error;
          }

          // Wrap unexpected errors
          const outcome = createValidationErrorOperationOutcome(error as Error, resourceType);
          throw new FhirValidationError(outcome, 500);
        }

        return context;
      }
    };
  }

  /**
   * Create profile validation hook
   */
  createProfileValidationHook(): HookDefinition {
    return {
      name: 'fhir-profile-validation',
      phase: 'preHandler',
      priority: 75,
      handler: async (context: any) => {
        if (!this.config.profileValidation) {
          return context;
        }

        const { body, resourceType } = context;

        if (!body?.meta?.profile || !resourceType) {
          return context;
        }

        const profiles = Array.isArray(body.meta.profile)
          ? body.meta.profile
          : [body.meta.profile];

        const startTime = Date.now();

        try {
          for (const profileUrl of profiles) {
            const result = validateSchema(this.schemaContext, {
              schemaUrls: [profileUrl],
              resource: body
            });

            if (result.errors.length > 0) {
              const outcome = createProfileValidationOperationOutcome(result.errors, profileUrl);
              const error = new FhirValidationError(outcome, 422);

              if (context.setResponse) {
                context.setResponse({
                  statusCode: 422,
                  responseHeaders: {
                    'Content-Type': 'application/fhir+json; charset=utf-8',
                    'X-Request-ID': context.requestId
                  },
                  responseBody: outcome,
                  timing: {
                    startTime: context.startTime,
                    endTime: Date.now(),
                    duration: Date.now() - context.startTime,
                    hookDuration: Date.now() - startTime
                  }
                });
                context.takeOver();
              } else {
                throw error;
              }

              return context;
            }
          }

          // Add success diagnostic
          if (context.addDiagnostic) {
            context.addDiagnostic({
              level: 'info',
              code: 'profile-validation-success',
              message: `Profile validation successful for ${profiles.join(', ')}`,
              source: 'fhir-profile-validation',
              timestamp: Date.now()
            });
          }

        } catch (error) {
          if (error instanceof FhirValidationError) {
            throw error;
          }

          const outcome = createValidationErrorOperationOutcome(error as Error, resourceType);
          throw new FhirValidationError(outcome, 500);
        }

        return context;
      }
    };
  }

  /**
   * Validate a resource manually
   */
  async validateResource(resourceType: string, resource: any): Promise<ValidationResult> {
    if (!this.schemas.has(resourceType)) {
      throw new Error(`No schema found for resource type: ${resourceType}`);
    }

    return validateSchema(this.schemaContext, {
      schemaUrls: [resourceType],
      resource
    });
  }

  /**
   * Validate against a specific profile
   */
  async validateProfile(profileUrl: string, resource: any): Promise<ValidationResult> {
    return validateSchema(this.schemaContext, {
      schemaUrls: [profileUrl],
      resource
    });
  }

  /**
   * Check if validation should be performed for this context
   */
  private shouldValidate(context: any): boolean {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.hasSchemasLoaded()) {
      return false;
    }

    const { operation } = context;

    switch (operation) {
      case 'create':
        return this.config.validateOnCreate;
      case 'update':
        return this.config.validateOnUpdate;
      case 'patch':
        return this.config.validateOnPatch;
      default:
        return false;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Required<ValidationBridgeConfig> {
    return { ...this.config };
  }

  /**
   * Get schema resolution context
   */
  getSchemaContext(): SchemaResolutionContext {
    return this.schemaContext;
  }
}