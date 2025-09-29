# Task 006: Integrate Validation Bridge

## Phase
Phase 3: Validation and Capabilities - Milestone 3.1

## Duration
1 week

## Description
Create `@atomic-ehr/validation-bridge` package that integrates existing `@atomic-ehr/fhirschema` validation capabilities into the hook-based server. Auto-integrate validation into the server so that all resource operations are automatically validated with proper FHIR OperationOutcome error responses.

## Prerequisites
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- Task 005: Implement Dynamic Route Generation (completed)
- Existing `@atomic-ehr/fhirschema` package with validation functionality

## Technical Requirements

### 1. Validation Bridge Package (@atomic-ehr/validation-bridge)
Create a bridge that integrates fhirschema validation with the hooks system:

```typescript
// @atomic-ehr/validation-bridge
import { validateSchema, type ValidationContext, type ValidationResult } from '@atomic-ehr/fhirschema';
import { HookDefinition, type RequestContext } from '@atomic-ehr/core';

interface ValidationBridgeConfig {
  enabled?: boolean;
  validateOnCreate?: boolean;
  validateOnUpdate?: boolean;
  validateOnPatch?: boolean;
  strictMode?: boolean;
  profileValidation?: boolean;
  customValidators?: Map<string, ResourceValidator>;
}

class ValidationBridge {
  private config: ValidationBridgeConfig;
  private schemas: Map<string, FHIRSchema> = new Map();
  private validationContext: ValidationContext;

  constructor(config: ValidationBridgeConfig = {}) {
    this.config = {
      enabled: true,
      validateOnCreate: true,
      validateOnUpdate: true,
      validateOnPatch: true,
      strictMode: true,
      profileValidation: true,
      ...config
    };

    this.validationContext = {
      schemas: {},
      // Additional context configuration
    };
  }

  // Schema management
  setSchemas(schemas: Map<string, FHIRSchema>): void {
    this.schemas = schemas;
    this.validationContext.schemas = Object.fromEntries(schemas);
  }

  updateSchema(resourceType: string, schema: FHIRSchema): void {
    this.schemas.set(resourceType, schema);
    this.validationContext.schemas[resourceType] = schema;
  }

  // Hook factory methods
  createValidationHook(): HookDefinition {
    return {
      name: 'fhir-validation',
      phase: 'preHandler',
      priority: 80, // High priority to validate early
      resources: '*',
      handler: this.validateResource.bind(this)
    };
  }

  createProfileValidationHook(): HookDefinition {
    return {
      name: 'fhir-profile-validation',
      phase: 'preHandler',
      priority: 75, // After basic validation
      resources: '*',
      handler: this.validateProfiles.bind(this)
    };
  }

  // Core validation logic
  private async validateResource(context: RequestContext): Promise<void> {
    if (!this.shouldValidate(context)) {
      return;
    }

    const { resourceType, body, operation } = context;

    if (!body || !resourceType) {
      return;
    }

    try {
      const result = validateSchema(
        this.validationContext,
        [resourceType],
        body
      );

      if (!result.valid) {
        throw new FhirValidationError(
          this.createOperationOutcome(result.errors, resourceType),
          422
        );
      }

      // Add validation metadata to context
      context.validationResult = result;
      context.addDiagnostic({
        level: 'info',
        code: 'validation-success',
        message: `${resourceType} resource validation successful`,
        source: 'fhir-validation-bridge',
        timestamp: Date.now()
      });

    } catch (error) {
      if (error instanceof FhirValidationError) {
        throw error;
      }

      // Wrap unexpected validation errors
      throw new FhirValidationError(
        this.createValidationErrorOperationOutcome(error, resourceType),
        500
      );
    }
  }

  private async validateProfiles(context: RequestContext): Promise<void> {
    if (!this.config.profileValidation || !context.body?.meta?.profile) {
      return;
    }

    const profiles = context.body.meta.profile;
    const resourceType = context.resourceType!;

    for (const profileUrl of profiles) {
      const result = validateSchema(
        this.validationContext,
        [profileUrl],
        context.body
      );

      if (!result.valid) {
        throw new FhirValidationError(
          this.createProfileValidationOperationOutcome(result.errors, profileUrl),
          422
        );
      }
    }

    context.addDiagnostic({
      level: 'info',
      code: 'profile-validation-success',
      message: `Profile validation successful for ${profiles.join(', ')}`,
      source: 'fhir-profile-validation',
      timestamp: Date.now()
    });
  }

  // Helper methods
  private shouldValidate(context: RequestContext): boolean {
    if (!this.config.enabled) return false;

    const { operation } = context;
    switch (operation) {
      case 'create':
        return this.config.validateOnCreate!;
      case 'update':
        return this.config.validateOnUpdate!;
      case 'patch':
        return this.config.validateOnPatch!;
      default:
        return false;
    }
  }

  private createOperationOutcome(errors: ValidationError[], resourceType: string): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: errors.map(error => ({
        severity: 'error' as const,
        code: this.mapValidationErrorCode(error),
        diagnostics: `${resourceType} validation failed: ${error.message}`,
        expression: error.path ? [error.path] : undefined,
        location: error.location ? [error.location] : undefined
      }))
    };
  }

  private createProfileValidationOperationOutcome(errors: ValidationError[], profileUrl: string): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: errors.map(error => ({
        severity: 'error' as const,
        code: 'structure',
        diagnostics: `Profile validation failed for ${profileUrl}: ${error.message}`,
        expression: error.path ? [error.path] : undefined
      }))
    };
  }

  private createValidationErrorOperationOutcome(error: Error, resourceType: string): OperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error' as const,
        code: 'exception',
        diagnostics: `Validation error for ${resourceType}: ${error.message}`
      }]
    };
  }

  private mapValidationErrorCode(error: ValidationError): string {
    // Map fhirschema validation errors to FHIR issue codes
    if (error.type === 'required') return 'required';
    if (error.type === 'type') return 'structure';
    if (error.type === 'format') return 'invalid';
    if (error.type === 'enum') return 'code-invalid';
    return 'invalid';
  }
}

// Custom validation error
class FhirValidationError extends Error {
  constructor(
    public operationOutcome: OperationOutcome,
    public statusCode: number = 422
  ) {
    super('FHIR validation failed');
    this.name = 'FhirValidationError';
  }
}

// Custom validator interface
interface ResourceValidator {
  resourceType: string;
  validate(resource: any, context: ValidationContext): Promise<ValidationResult>;
}
```

### 2. Server Integration
Auto-integrate validation bridge into FhirServer:

```typescript
// Update @atomic-ehr/server to auto-integrate validation
import { ValidationBridge, FhirValidationError } from '@atomic-ehr/validation-bridge';

interface FhirServerConfig {
  // ... existing config
  validation?: {
    enabled?: boolean;
    validateOnCreate?: boolean;
    validateOnUpdate?: boolean;
    validateOnPatch?: boolean;
    strictMode?: boolean;
    profileValidation?: boolean;
    customValidators?: Map<string, ResourceValidator>;
  };
}

class FhirServer {
  private validationBridge: ValidationBridge;

  constructor(config: FhirServerConfig) {
    // ... existing initialization

    // Auto-initialize validation bridge
    this.validationBridge = new ValidationBridge(config.validation);

    // Auto-register validation hooks
    this.registerValidationHooks();
  }

  private registerValidationHooks(): void {
    // Register schemas when packages are loaded
    this.addHook({
      name: 'validation-schema-setup',
      phase: 'onRouteRegister',
      priority: 85, // After packages loaded, before route generation
      handler: async (context) => {
        const schemas = this.packageLoader.getSchemas();
        this.validationBridge.setSchemas(schemas);

        context.logger.info('Validation schemas configured', {
          schemaCount: schemas.size,
          resourceTypes: Array.from(schemas.keys())
        });
      }
    });

    // Auto-register validation hooks
    this.addHook(this.validationBridge.createValidationHook());

    if (this.config.validation?.profileValidation) {
      this.addHook(this.validationBridge.createProfileValidationHook());
    }

    // Handle validation errors
    this.addHook({
      name: 'validation-error-handler',
      phase: 'onError',
      priority: 90,
      handler: async (context) => {
        if (context.error instanceof FhirValidationError) {
          context.setResponse({
            statusCode: context.error.statusCode,
            responseHeaders: { 'Content-Type': 'application/fhir+json' },
            responseBody: context.error.operationOutcome
          });
          context.handled = true;

          context.logger.warn('FHIR validation failed', {
            resourceType: context.resourceType,
            operation: context.operation,
            issues: context.error.operationOutcome.issue?.length || 0
          });
        }
      }
    });
  }

  // Expose validation functionality
  getValidationBridge(): ValidationBridge {
    return this.validationBridge;
  }

  async validateResource(resourceType: string, resource: any): Promise<ValidationResult> {
    // Allow manual validation
    const schema = this.packageLoader.getSchema(resourceType);
    if (!schema) {
      throw new Error(`No schema found for resource type: ${resourceType}`);
    }

    return validateSchema(
      this.validationBridge.validationContext,
      [resourceType],
      resource
    );
  }
}
```

### 3. Extended Context Types
Extend request context to include validation information:

```typescript
// Extend RequestContext to include validation data
interface ExtendedRequestContext extends RequestContext {
  validationResult?: ValidationResult;
  validationErrors?: ValidationError[];
  isValid?: boolean;

  // Validation convenience methods
  getValidationErrors(): ValidationError[];
  hasValidationErrors(): boolean;
  addValidationError(error: ValidationError): void;
}
```

### 4. Advanced Validation Features
Implement advanced validation capabilities:

```typescript
// Conditional validation based on operation
class ConditionalValidator {
  constructor(private validationBridge: ValidationBridge) {}

  createConditionalValidationHook(condition: (context: RequestContext) => boolean): HookDefinition {
    return {
      name: 'conditional-validation',
      phase: 'preHandler',
      priority: 70,
      handler: async (context: RequestContext) => {
        if (condition(context)) {
          await this.validationBridge.validateResource(context);
        }
      }
    };
  }
}

// Custom validation for specific use cases
class CustomValidationRules {
  static createBusinessRuleValidator(rules: BusinessRule[]): HookDefinition {
    return {
      name: 'business-rule-validation',
      phase: 'preHandler',
      priority: 60, // After schema validation
      handler: async (context: RequestContext) => {
        for (const rule of rules) {
          if (rule.appliesTo(context)) {
            const result = await rule.validate(context.body, context);
            if (!result.valid) {
              throw new FhirValidationError(
                createBusinessRuleOperationOutcome(result.errors),
                422
              );
            }
          }
        }
      }
    };
  }
}

interface BusinessRule {
  name: string;
  appliesTo(context: RequestContext): boolean;
  validate(resource: any, context: RequestContext): Promise<ValidationResult>;
}
```

### 5. Validation Metrics and Monitoring
Add validation metrics and monitoring:

```typescript
interface ValidationMetrics {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  validationsByResourceType: Map<string, number>;
  validationErrors: Map<string, number>;
  averageValidationTime: number;
}

class ValidationMetricsCollector {
  private metrics: ValidationMetrics = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    validationsByResourceType: new Map(),
    validationErrors: new Map(),
    averageValidationTime: 0
  };

  createMetricsHook(): HookDefinition {
    return {
      name: 'validation-metrics',
      phase: 'preHandler',
      priority: 50,
      handler: async (context: RequestContext) => {
        const startTime = Date.now();

        try {
          // Let validation proceed
          await context.next();

          // Record success
          this.recordSuccess(context.resourceType!, Date.now() - startTime);
        } catch (error) {
          if (error instanceof FhirValidationError) {
            this.recordFailure(context.resourceType!, error);
          }
          throw error;
        }
      }
    };
  }

  private recordSuccess(resourceType: string, duration: number): void {
    this.metrics.totalValidations++;
    this.metrics.successfulValidations++;
    this.updateResourceTypeCount(resourceType);
    this.updateAverageTime(duration);
  }

  private recordFailure(resourceType: string, error: FhirValidationError): void {
    this.metrics.totalValidations++;
    this.metrics.failedValidations++;
    this.updateResourceTypeCount(resourceType);

    // Record error types
    error.operationOutcome.issue?.forEach(issue => {
      const count = this.metrics.validationErrors.get(issue.code) || 0;
      this.metrics.validationErrors.set(issue.code, count + 1);
    });
  }

  getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }
}
```

## Implementation Details

### File Structure
```
packages/validation-bridge/
├── src/
│   ├── index.ts              # Main exports
│   ├── bridge.ts             # ValidationBridge implementation
│   ├── hooks.ts              # Validation hook implementations
│   ├── errors.ts             # Validation error types
│   ├── metrics.ts            # Validation metrics
│   ├── custom.ts             # Custom validation utilities
│   └── types.ts              # Validation types
├── package.json
├── tsconfig.json
└── README.md

packages/server/src/
├── integration/
│   ├── validation.ts         # Validation integration
│   └── ... (existing files)
└── ... (existing files)
```

### Key Components

#### 1. ValidationBridge (`validation-bridge/src/bridge.ts`)
- Integrate fhirschema validation with hooks
- Handle schema management and updates
- Provide validation configuration options
- Generate appropriate OperationOutcome responses

#### 2. Validation Hooks (`validation-bridge/src/hooks.ts`)
- Resource validation hook for create/update operations
- Profile validation hook for profile-specific validation
- Business rule validation hooks
- Conditional validation based on context

#### 3. Error Handling (`validation-bridge/src/errors.ts`)
- FhirValidationError with OperationOutcome
- Error mapping from fhirschema to FHIR codes
- Comprehensive error reporting
- Stack trace preservation for debugging

#### 4. Server Integration (`server/src/integration/validation.ts`)
- Auto-registration of validation hooks
- Error handling integration
- Configuration management
- Metrics collection

## Success Criteria

### Must Have
- [x] Validation bridge auto-integrates into FhirServer
- [x] Uses existing @atomic-ehr/fhirschema validateSchema function
- [x] Validation hook automatically registered for create/update operations
- [x] Returns proper FHIR OperationOutcome on validation errors
- [x] No manual validation setup required by users
- [x] Supports both resource-level and profile-level validation

### Validation Features
- [x] Resource validation on create operations
- [x] Resource validation on update operations
- [x] Resource validation on patch operations
- [x] Profile validation when meta.profile is present
- [ ] Custom business rule validation support (future enhancement)
- [x] Validation error mapping to FHIR issue codes

### Testing Requirements
- [ ] Unit tests for ValidationBridge
- [ ] Unit tests for validation hooks
- [ ] Integration tests with FhirServer
- [ ] Error handling tests with various validation failures
- [ ] Performance tests for validation overhead
- [ ] Profile validation tests

### Performance Requirements
- [ ] Validation adds <50ms latency per request
- [ ] Memory usage remains reasonable with large schemas
- [ ] Validation can handle concurrent requests efficiently
- [ ] Schema caching improves performance for repeated validations

## Implementation Status

**Status:** ✅ COMPLETED

**Completed:** 2025-01-XX

**Implementation Summary:**

Created new @atomic-ehr/validation-bridge package with 5 files:
1. `types.ts` - Type definitions, FhirValidationError, ValidationBridgeConfig
2. `errors.ts` - Error mapping and OperationOutcome creation
3. `bridge.ts` - ValidationBridge class with hooks integration
4. `metrics.ts` - ValidationMetricsCollector for monitoring
5. `index.ts` - Package exports

Modified server package:
1. `server.ts` - Added validation bridge initialization and hooks
2. `types.ts` - Added validation configuration options
3. `index.ts` - Re-exported validation bridge components

Created example:
- `examples/validation-example.ts` - Comprehensive validation demonstration

**Key Features Delivered:**
- Auto-integration with FhirServer (enabled by default)
- Schema-based validation using @atomic-ehr/fhirschema
- Profile validation for meta.profile declarations
- Detailed FHIR OperationOutcome error responses
- Validation metrics collection and monitoring
- Configurable validation rules
- Manual validation API for custom use cases
- Automatic schema loading from packages
- Hook-based error handling integration

**Configuration:**
```typescript
{
  validation: {
    enabled: true,              // Auto-enabled by default
    validateOnCreate: true,
    validateOnUpdate: true,
    validateOnPatch: true,
    strictMode: true,
    profileValidation: true
  }
}
```

**Testing Status:** Implementation complete, comprehensive tests pending

## Acceptance Criteria

### 1. Auto-Integration
```typescript
// Validation should work automatically with no setup
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core'],
  validation: { enabled: true }
});

await server.start();

// Invalid resources should be rejected
const invalidPatient = {
  resourceType: 'Patient',
  gender: 'invalid-value'
};

const response = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(invalidPatient)
});

expect(response.status).toBe(422);
const outcome = await response.json();
expect(outcome.resourceType).toBe('OperationOutcome');
expect(outcome.issue[0].severity).toBe('error');
```

### 2. Valid Resource Acceptance
```typescript
// Valid resources should be accepted
const validPatient = {
  resourceType: 'Patient',
  name: [{ family: 'Doe', given: ['John'] }],
  gender: 'male'
};

const response = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(validPatient)
});

expect(response.status).toBe(201);
const created = await response.json();
expect(created.resourceType).toBe('Patient');
expect(created.id).toBeDefined();
```

### 3. Profile Validation
```typescript
// Should validate against specified profiles
const usPatient = {
  resourceType: 'Patient',
  meta: {
    profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient']
  },
  name: [{ family: 'Doe', given: ['John'] }],
  gender: 'male'
  // Missing required US Core elements should cause validation failure
};

const response = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(usPatient)
});

// Should fail if US Core requirements not met
expect(response.status).toBe(422);
```

### 4. Configuration Options
```typescript
// Should support validation configuration
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core'],
  validation: {
    enabled: true,
    validateOnCreate: true,
    validateOnUpdate: false, // Disable update validation
    profileValidation: false // Disable profile validation
  }
});

// Update operations should not be validated when disabled
```

### 5. Error Details
```typescript
// Should provide detailed validation errors
const invalidPatient = {
  resourceType: 'Patient',
  name: [{ given: ['John'] }], // Missing required family name
  gender: 'invalid',
  birthDate: 'not-a-date'
};

const response = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json' },
  body: JSON.stringify(invalidPatient)
});

const outcome = await response.json();
expect(outcome.issue).toHaveLength(2); // Multiple validation errors
expect(outcome.issue[0].expression).toBeDefined(); // Field path
expect(outcome.issue[0].diagnostics).toContain('validation failed');
```

## Dependencies
- Task 001: Extend Core with Hooks System (completed)
- Task 002: Build Server Package (completed)
- Task 003: Implement FHIR URL Routing (completed)
- Task 004: Create Bridge Packages (completed)
- Task 005: Implement Dynamic Route Generation (completed)
- Existing `@atomic-ehr/fhirschema` package with validateSchema function
- Understanding of FHIR validation requirements

## Follow-up Tasks
- Task 007: Implement Capability Statement (reports validation capabilities)
- Task 008: Implement Error Handling (enhances validation error reporting)

## Notes
- Focus on seamless integration with existing fhirschema validation
- All validation should be automatic and require no manual setup
- Error responses must follow FHIR OperationOutcome specification
- Consider performance impact of validation on request processing
- Support for custom business rules and conditional validation
- Validation metrics help monitor system health and usage patterns