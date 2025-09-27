# Mental Model Shift: From Traditional Frameworks to Hook-Based Architecture

## Overview
This guide helps developers transition from traditional MVC/middleware-based frameworks to the hook-based architecture of `@atomic-ehr/hook-core`. The shift requires understanding new concepts around lifecycle management, dependency injection, and FHIR-native patterns.

## Key Mental Model Changes

### 1. From Middleware Chains to Hook Pipelines

#### Traditional Middleware (Express-style)
```javascript
// Traditional linear middleware chain
app.use(logger);
app.use(bodyParser);
app.use(auth);
app.use(validation);

app.get('/api/users', (req, res) => {
  // Handler logic
});
```

#### Hook-Based Pipeline
```typescript
// Phase-based hook pipeline with priorities and dependencies
const hooks = [
  {
    name: 'request-logging',
    phase: 'preRequest',
    priority: 1000,
    handler: async (context) => { /* logging */ }
  },
  {
    name: 'body-parsing',
    phase: 'preValidation',
    priority: 900,
    handler: async (context) => { /* parsing */ }
  },
  {
    name: 'authentication',
    phase: 'preValidation',
    priority: 800,
    deps: ['body-parsing'],
    handler: async (context) => { /* auth */ }
  },
  {
    name: 'validation',
    phase: 'preValidation',
    priority: 700,
    deps: ['authentication'],
    handler: async (context) => { /* validation */ }
  }
];
```

**Key Differences:**
- **Phase-based**: Hooks are organized into specific lifecycle phases
- **Priority-driven**: Execution order determined by priority + dependencies
- **Parallel execution**: Independent hooks can run concurrently
- **Type-safe**: Strong typing for context and hook definitions
- **Resource-aware**: Hooks can target specific FHIR resources or operations

### 2. From Route-centric to Resource-centric Thinking

#### Traditional Route Definition
```javascript
// Route-first approach
app.get('/api/patients/:id', getPatient);
app.post('/api/patients', createPatient);
app.put('/api/patients/:id', updatePatient);
app.delete('/api/patients/:id', deletePatient);

// Custom business logic scattered across routes
app.post('/api/patients/:id/validate', validatePatient);
```

#### FHIR Resource-centric Approach
```typescript
// Resource-first approach with automatic route generation
const patientResource = {
  resourceType: 'Patient',
  profiles: ['http://hl7.org/fhir/StructureDefinition/Patient'],

  // Operations auto-generated from FHIR spec
  operations: ['create', 'read', 'update', 'delete', 'search', 'validate'],

  // Custom behavior via hooks, not separate routes
  hooks: [
    {
      name: 'patient-validation',
      phase: 'preHandler',
      resources: ['Patient'],
      handler: async (context) => { /* custom validation */ }
    }
  ]
};

// Routes automatically generated:
// POST /Patient (create)
// GET /Patient/:id (read)
// PUT /Patient/:id (update)
// DELETE /Patient/:id (delete)
// GET /Patient (search)
// POST /Patient/$validate (operation)
```

**Key Differences:**
- **FHIR-native**: Routes follow FHIR REST API patterns
- **Auto-generation**: Routes generated from FHIR specifications
- **Behavior composition**: Custom logic added via hooks, not route overrides
- **Standard compliance**: Automatic compliance with FHIR specifications

### 3. From Manual Configuration to Package-driven Discovery

#### Traditional Manual Setup
```javascript
// Manual service registration
app.use('/api/patients', patientRoutes);
app.use('/api/observations', observationRoutes);
app.use('/api/practitioners', practitionerRoutes);

// Manual validation setup
const patientSchema = { /* manual JSON schema */ };
const observationSchema = { /* manual JSON schema */ };

// Manual search parameter definition
const patientSearchParams = {
  name: { type: 'string', operator: 'contains' },
  birthdate: { type: 'date', operator: 'eq' }
};
```

#### Package-driven Auto-discovery
```typescript
// Automatic discovery from FHIR packages
const platform = await createPlatform({
  preset: '@atomic-ehr/preset-fhir-full',
  config: {
    fhir: {
      packages: [
        { package: 'hl7.fhir.r4.core', version: '4.0.1' },
        { package: 'hl7.fhir.us.core', version: '7.0.0' }
      ]
    }
  }
});

// Automatic results:
// - All R4 resources with CRUD operations
// - US Core profiles with validation
// - Search parameters from specifications
// - Operation definitions ($validate, $everything, etc.)
// - Terminology services (ValueSets, CodeSystems)
```

**Key Differences:**
- **Package-driven**: Configuration sourced from standard FHIR packages
- **Auto-discovery**: Resources, operations, and constraints discovered automatically
- **Standards compliance**: Built-in compliance with FHIR specifications
- **Version management**: Automatic handling of package dependencies and versions

### 4. From Error Handling to OperationOutcome

#### Traditional Error Handling
```javascript
// Traditional HTTP error responses
app.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors
    });
  } else {
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});
```

#### FHIR OperationOutcome
```typescript
// FHIR-compliant error handling
const errorHook = {
  name: 'fhir-error-handler',
  phase: 'onError',
  priority: 1000,
  handler: async (context: ErrorContext) => {
    const operationOutcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: []
    };

    if (context.error instanceof FhirValidationError) {
      operationOutcome.issue.push({
        severity: 'error',
        code: 'structure',
        details: {
          text: context.error.message
        },
        diagnostics: context.error.path,
        expression: context.error.fhirPath
      });
    }

    context.setResponse({
      status: context.error.statusCode || 500,
      headers: { 'Content-Type': 'application/fhir+json' },
      body: operationOutcome
    });
  }
};
```

**Key Differences:**
- **Structured errors**: Errors follow FHIR OperationOutcome format
- **Rich diagnostics**: Detailed error information with FHIRPath expressions
- **Severity levels**: Error, warning, information issue types
- **Traceable**: Errors include detailed diagnostic information

### 5. From Custom Validation to FHIR Schema + Constraints

#### Traditional Custom Validation
```javascript
// Custom validation logic
function validatePatient(req, res, next) {
  const patient = req.body;

  if (!patient.name || patient.name.length === 0) {
    return res.status(400).json({
      error: 'Patient name is required'
    });
  }

  if (patient.birthDate && !isValidDate(patient.birthDate)) {
    return res.status(400).json({
      error: 'Invalid birth date format'
    });
  }

  next();
}
```

#### FHIR Schema + Constraint Validation
```typescript
// Automatic validation from FHIR specifications
const validationHooks = [
  {
    name: 'fhir-schema-validation',
    phase: 'preValidation',
    priority: 900,
    handler: async (context: FhirRequestContext) => {
      // Automatic validation against FHIR schema
      const schemaResult = await context.services.validator.validateSchema(
        context.body,
        context.fhir.resourceType
      );

      if (!schemaResult.valid) {
        throw new FhirValidationError('Schema validation failed', schemaResult.errors);
      }
    }
  },
  {
    name: 'fhir-constraint-validation',
    phase: 'preValidation',
    priority: 800,
    handler: async (context: FhirRequestContext) => {
      // Automatic constraint evaluation from profiles
      for (const profileUrl of context.fhir.profiles) {
        const constraints = await context.services.packages.getConstraints(profileUrl);

        for (const constraint of constraints) {
          const result = await evaluateFhirPath(constraint.expression, context.body);
          if (!result) {
            throw new FhirConstraintError(
              `Constraint violation: ${constraint.human}`,
              constraint.key,
              constraint.expression
            );
          }
        }
      }
    }
  }
];
```

**Key Differences:**
- **Schema-driven**: Validation based on FHIR StructureDefinitions
- **Constraint evaluation**: FHIRPath expressions for complex business rules
- **Profile-aware**: Different validation for different FHIR profiles
- **Automatic**: No manual validation logic required for standard FHIR rules

## Migration Strategies

### 1. Gradual Hook Migration

#### Phase 1: Wrap Existing Middleware
```typescript
// Wrap existing Express middleware as hooks
function wrapMiddleware(middleware: ExpressMiddleware): HookDefinition {
  return {
    name: `wrapped-${middleware.name}`,
    phase: 'preHandler',
    priority: 500,
    handler: async (context) => {
      return new Promise((resolve, reject) => {
        const req = createRequestFromContext(context);
        const res = createResponseFromContext(context);

        middleware(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  };
}

// Use existing middleware during transition
const legacyAuthHook = wrapMiddleware(existingAuthMiddleware);
```

#### Phase 2: Replace with Native Hooks
```typescript
// Replace wrapped middleware with native hooks
const authHook = {
  name: 'authentication',
  phase: 'preValidation',
  priority: 800,
  handler: async (context: RequestContext) => {
    const token = context.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AuthenticationError('Missing authorization token');
    }

    const user = await verifyToken(token);
    context.user = user; // Augment context
  }
};
```

### 2. Route to Resource Migration

#### Step 1: Identify Resource Patterns
```typescript
// Analyze existing routes to identify FHIR resource patterns
const routeAnalysis = {
  '/api/patients/:id': { resourceType: 'Patient', operation: 'read' },
  '/api/patients': { resourceType: 'Patient', operation: 'search' },
  'POST /api/patients': { resourceType: 'Patient', operation: 'create' },
  // ... etc
};
```

#### Step 2: Enable Auto-generated Routes
```typescript
// Enable automatic route generation
const platform = await createPlatform({
  preset: '@atomic-ehr/preset-fhir-minimal',
  config: {
    fhir: {
      packages: [{ package: 'hl7.fhir.r4.core', version: '4.0.1' }]
    }
  }
});

// Routes automatically available:
// GET /Patient/:id
// POST /Patient
// PUT /Patient/:id
// DELETE /Patient/:id
// GET /Patient (search)
```

#### Step 3: Add Custom Behavior via Hooks
```typescript
// Replace custom route logic with hooks
const customPatientHooks = [
  {
    name: 'patient-custom-validation',
    phase: 'preHandler',
    resources: ['Patient'],
    operation: 'create',
    handler: async (context) => {
      // Custom business logic that was in route handler
    }
  }
];
```

### 3. Configuration Migration

#### From Manual to Package-driven
```typescript
// Before: Manual configuration
const config = {
  resources: ['Patient', 'Observation', 'Practitioner'],
  validation: {
    Patient: { /* manual schema */ },
    Observation: { /* manual schema */ }
  },
  searchParams: {
    Patient: { /* manual definition */ }
  }
};

// After: Package-driven configuration
const config = {
  fhir: {
    packages: [
      { package: 'hl7.fhir.r4.core', version: '4.0.1' }
    ]
  }
};
// All resources, validation, and search params automatically available
```

## Common Pitfalls and Solutions

### 1. Hook Order Dependencies
```typescript
// ❌ WRONG - Relying on registration order
const hooks = [
  bodyParserHook,  // Might run after validation
  validationHook   // Needs parsed body
];

// ✅ CORRECT - Explicit dependencies and priorities
const hooks = [
  {
    name: 'body-parser',
    phase: 'preValidation',
    priority: 900,
    handler: bodyParserLogic
  },
  {
    name: 'validation',
    phase: 'preValidation',
    priority: 800,
    deps: ['body-parser'],
    handler: validationLogic
  }
];
```

### 2. Context Mutation
```typescript
// ❌ WRONG - Modifying context without type safety
context.customData = { userId: 123 };

// ✅ CORRECT - Type-safe context augmentation
declare module '@atomic-ehr/core' {
  namespace Plugins {
    interface RequestContext {
      user?: { id: string; roles: string[] };
    }
  }
}

// In hook
context.user = { id: '123', roles: ['admin'] };
```

### 3. Error Handling
```typescript
// ❌ WRONG - Throwing generic errors
throw new Error('Validation failed');

// ✅ CORRECT - Using FHIR-compliant errors
throw new FhirValidationError('Resource validation failed', [
  {
    severity: 'error',
    code: 'structure',
    details: { text: 'Missing required field: name' },
    expression: ['Patient.name']
  }
]);
```

### 4. Route Override Confusion
```typescript
// ❌ WRONG - Trying to override auto-generated routes with custom routes
app.get('/Patient/:id', customHandler); // Won't work

// ✅ CORRECT - Using route overrides
const overrides = [
  {
    method: 'GET',
    path: '/Patient/:id',
    resourceType: 'Patient',
    scope: 'handler',
    type: 'replace',
    handler: customHandler,
    priority: OverridePrecedence.APP_EXPLICIT
  }
];
```

## Benefits of the New Model

### 1. Standardization
- **FHIR Compliance**: Automatic compliance with FHIR specifications
- **Consistent APIs**: All resources follow the same patterns
- **Interoperability**: Better integration with FHIR ecosystem

### 2. Maintainability
- **Less Code**: Reduced boilerplate through auto-generation
- **Type Safety**: Comprehensive TypeScript support
- **Separation of Concerns**: Clear separation between infrastructure and business logic

### 3. Extensibility
- **Hook System**: Easy to add custom behavior without modifying core
- **Package System**: Leverage community packages and implementation guides
- **Override System**: Fine-grained control over behavior when needed

### 4. Performance
- **Parallel Execution**: Independent hooks can run concurrently
- **Optimized Pipelines**: Framework can optimize hook execution order
- **Lazy Loading**: Resources and packages loaded on demand

## Conclusion

The mental model shift from traditional frameworks to hook-based architecture requires understanding:

1. **Phase-based execution** instead of linear middleware chains
2. **Resource-centric design** instead of route-centric patterns
3. **Package-driven configuration** instead of manual setup
4. **FHIR-native patterns** instead of custom validation and error handling
5. **Hook composition** instead of inheritance-based customization

While the initial learning curve exists, the benefits of standardization, maintainability, and FHIR compliance make this transition worthwhile for healthcare applications.