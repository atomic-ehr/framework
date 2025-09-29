# @atomic-ehr/validation-bridge

> Validation bridge integrating @atomic-ehr/fhirschema with the hook-based server

## Overview

`@atomic-ehr/validation-bridge` provides seamless integration of FHIR resource validation into the Atomic EHR server's hook system. It automatically validates resources during create, update, and patch operations, ensuring data quality and FHIR compliance.

## Features

- ✅ **Automatic Validation** - Validates resources during write operations
- ✅ **Hook Integration** - Seamlessly integrates with server hooks
- ✅ **FHIRSchema** - Uses FHIRSchema for accurate validation
- ✅ **Configurable** - Control when and how validation occurs
- ✅ **Detailed Errors** - Provides clear validation error messages
- ✅ **OperationOutcome** - Returns FHIR-compliant error responses
- ✅ **Performance** - Optimized for high-throughput scenarios

## Installation

```bash
bun add @atomic-ehr/validation-bridge
```

## Quick Start

```typescript
import { FhirServer } from '@atomic-ehr/server';
import { createValidationHook } from '@atomic-ehr/validation-bridge';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

// Add validation hook
server.addHook(createValidationHook({
  enabled: true,
  strictMode: false
}));

await server.start();
```

Now all resource operations are automatically validated!

## Validation Hook

### createValidationHook()

Creates a validation hook for integration with the FHIR server.

```typescript
function createValidationHook(options?: ValidationOptions): HookDefinition
```

**Options:**
```typescript
interface ValidationOptions {
  enabled?: boolean;              // Enable validation (default: true)
  strictMode?: boolean;           // Throw errors vs warnings (default: false)
  validateOnCreate?: boolean;     // Validate during create (default: true)
  validateOnUpdate?: boolean;     // Validate during update (default: true)
  validateOnPatch?: boolean;      // Validate during patch (default: true)
  validateNested?: boolean;       // Validate nested resources (default: true)
  validateReferences?: boolean;   // Validate references exist (default: false)
}
```

### Example Usage

#### Basic Validation

```typescript
import { createValidationHook } from '@atomic-ehr/validation-bridge';

server.addHook(createValidationHook({
  enabled: true,
  strictMode: false  // Return validation errors, don't throw
}));
```

#### Strict Mode

```typescript
// Fail requests with validation errors
server.addHook(createValidationHook({
  enabled: true,
  strictMode: true  // Throws error on validation failure
}));
```

#### Selective Validation

```typescript
// Only validate on create, not on update
server.addHook(createValidationHook({
  validateOnCreate: true,
  validateOnUpdate: false,
  validateOnPatch: false
}));
```

## Validation Results

### Success

When validation passes, the request continues normally.

```typescript
// POST /Patient
// {
//   "resourceType": "Patient",
//   "name": [{ "family": "Doe", "given": ["John"] }],
//   "gender": "male"
// }

// Response: 201 Created
// { "resourceType": "Patient", "id": "123", ... }
```

### Failure (Non-Strict Mode)

When validation fails in non-strict mode, an OperationOutcome is returned:

```typescript
// POST /Patient
// {
//   "resourceType": "Patient",
//   "gender": "invalid-value"  // ❌ Invalid gender
// }

// Response: 400 Bad Request
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "diagnostics": "Invalid value for Patient.gender: must be one of male, female, other, unknown",
      "expression": ["Patient.gender"]
    }
  ]
}
```

### Failure (Strict Mode)

In strict mode, validation errors prevent the operation:

```typescript
// POST /Patient with invalid data

// Response: 400 Bad Request with OperationOutcome
// Request is rejected immediately
```

## Validation Errors

The validation bridge provides detailed error information:

### Error Structure

```typescript
interface ValidationError {
  path: string;          // JSONPath to the error (e.g., "Patient.name[0].family")
  message: string;       // Human-readable error message
  severity: string;      // error, warning, or information
  code: string;          // FHIR issue type code
}
```

### Common Validation Errors

1. **Missing Required Field**
```json
{
  "path": "Patient.name",
  "message": "Required field 'name' is missing",
  "severity": "error",
  "code": "required"
}
```

2. **Invalid Data Type**
```json
{
  "path": "Patient.birthDate",
  "message": "Invalid date format: expected YYYY-MM-DD",
  "severity": "error",
  "code": "invalid"
}
```

3. **Invalid Enum Value**
```json
{
  "path": "Patient.gender",
  "message": "Invalid value: must be one of male, female, other, unknown",
  "severity": "error",
  "code": "code-invalid"
}
```

4. **Cardinality Violation**
```json
{
  "path": "Patient.identifier",
  "message": "Too many identifiers: maximum is 10",
  "severity": "error",
  "code": "too-costly"
}
```

## Custom Validation

### Adding Custom Validators

You can add custom validation logic alongside the schema validation:

```typescript
import { createValidationHook } from '@atomic-ehr/validation-bridge';

// Schema validation
server.addHook(createValidationHook({ enabled: true }));

// Custom business rule validation
server.addHook({
  name: 'custom-patient-validation',
  phase: 'preHandler',
  resources: 'Patient',
  priority: 65,  // Run after schema validation (priority 70)
  handler: async (context) => {
    if (context.operation === 'create') {
      const patient = context.body;

      // Business rule: Must have at least one contact method
      const hasContact = patient.telecom && patient.telecom.length > 0;
      const hasAddress = patient.address && patient.address.length > 0;

      if (!hasContact && !hasAddress) {
        throw new Error('Patient must have at least one contact method (telecom or address)');
      }
    }

    return context;
  }
});
```

## Validation Configuration

### Per-Operation Configuration

```typescript
// Different validation rules for different operations
server.addHook(createValidationHook({
  validateOnCreate: true,    // Strict validation on create
  validateOnUpdate: true,    // Validate updates
  validateOnPatch: false,    // Skip validation for patches (less strict)
  strictMode: true
}));
```

### Per-Resource Configuration

```typescript
// Strict validation for clinical resources
server.addHook({
  ...createValidationHook({ strictMode: true }),
  resources: ['Patient', 'Observation', 'Medication', 'AllergyIntolerance']
});

// Lenient validation for administrative resources
server.addHook({
  ...createValidationHook({ strictMode: false }),
  resources: ['Organization', 'Location', 'Practitioner']
});
```

## Performance

The validation bridge is optimized for performance:

- **Schema Caching** - Resource schemas are cached in memory
- **Lazy Validation** - Only validates when necessary
- **Batch Optimization** - Efficiently validates bundles
- **Async Processing** - Non-blocking validation

### Performance Tips

1. **Disable Validation in Development** (if needed)
```typescript
const validationEnabled = process.env.NODE_ENV === 'production';

server.addHook(createValidationHook({
  enabled: validationEnabled
}));
```

2. **Use Non-Strict Mode for High-Throughput**
```typescript
// Log errors but don't reject requests
server.addHook(createValidationHook({
  strictMode: false
}));
```

3. **Selective Validation**
```typescript
// Only validate critical resources
server.addHook({
  ...createValidationHook(),
  resources: ['Patient', 'Observation', 'MedicationRequest']
});
```

## Error Handling

### Validation Hook Phase

The validation hook runs in the `preHandler` phase with priority 70:

```
Request → preRequest → [Validation @ preHandler:70] → Handler → Response
```

### Handling Validation Errors

```typescript
// In an onError hook
server.addHook({
  name: 'validation-error-logger',
  phase: 'onError',
  priority: 50,
  handler: async (context) => {
    if (context.error.name === 'ValidationError') {
      // Log validation failures for monitoring
      await validationLog.write({
        timestamp: new Date(),
        resourceType: context.resourceType,
        errors: context.error.details
      });
    }

    return context;
  }
});
```

## Integration Examples

### Complete Server Setup

```typescript
import { FhirServer } from '@atomic-ehr/server';
import { createValidationHook } from '@atomic-ehr/validation-bridge';

const server = new FhirServer({
  port: 3000,
  packages: [
    'hl7.fhir.r4.core#4.0.1',
    'hl7.fhir.us.core#7.0.0'
  ]
});

// Add validation
server.addHook(createValidationHook({
  enabled: true,
  strictMode: false,
  validateNested: true
}));

// Add custom validation
server.addHook({
  name: 'patient-ssn-validation',
  phase: 'preHandler',
  resources: 'Patient',
  priority: 65,
  handler: async (context) => {
    if (context.operation === 'create') {
      const patient = context.body;
      const ssn = patient.identifier?.find(
        id => id.system === 'http://hl7.org/fhir/sid/us-ssn'
      );

      if (ssn && !isValidSSN(ssn.value)) {
        throw new Error('Invalid SSN format');
      }
    }

    return context;
  }
});

await server.start();
```

### With Profile Validation

```typescript
import { createValidationHook } from '@atomic-ehr/validation-bridge';

// Validate against specific profiles
server.addHook(createValidationHook({
  enabled: true,
  validateProfiles: true,
  defaultProfiles: {
    Patient: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
    Observation: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation'
  }
}));
```

## Testing

### Testing Validation

```typescript
import { describe, test, expect } from 'bun:test';
import { FhirServer } from '@atomic-ehr/server';
import { createValidationHook } from '@atomic-ehr/validation-bridge';

describe('Validation', () => {
  const server = new FhirServer({
    port: 3001,
    packages: ['hl7.fhir.r4.core#4.0.1']
  });

  server.addHook(createValidationHook({
    enabled: true,
    strictMode: true
  }));

  test('rejects invalid patient', async () => {
    const response = await fetch('http://localhost:3001/Patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify({
        resourceType: 'Patient',
        gender: 'invalid'  // ❌
      })
    });

    expect(response.status).toBe(400);
    const outcome = await response.json();
    expect(outcome.resourceType).toBe('OperationOutcome');
  });

  test('accepts valid patient', async () => {
    const response = await fetch('http://localhost:3001/Patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify({
        resourceType: 'Patient',
        name: [{ family: 'Doe', given: ['John'] }],
        gender: 'male'  // ✅
      })
    });

    expect(response.status).toBe(201);
  });
});
```

## Dependencies

- `@atomic-ehr/core` - Core hooks system
- `@atomic-ehr/fhirschema` - FHIR schema validation

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Tests
bun test

# Type checking
bun run typecheck
```

## Contributing

This package is part of the Atomic EHR framework. See the main repository for contribution guidelines.

## License

MIT © Atomic EHR Team