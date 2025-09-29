# Getting Started with Atomic FHIR Server

## What You'll Build

In this 15-minute tutorial, you'll create a fully functional FHIR R4 server with:
- ✅ Complete CRUD operations for all FHIR resources
- ✅ Automatic validation using FHIR R4 Core schemas
- ✅ RESTful API endpoints following FHIR HTTP specification
- ✅ Capability statement at `/metadata`
- ✅ Custom business logic hooks
- ✅ Request/response logging
- ✅ Error handling with FHIR OperationOutcome

## Prerequisites

- **Node.js 18+** or **Bun** installed
- **5-15 minutes** of your time
- Basic JavaScript/TypeScript knowledge

## Step 1: Create Your Project (1 minute)

```bash
# Create a new directory
mkdir my-fhir-server
cd my-fhir-server

# Initialize package.json
npm init -y

# Install dependencies
npm install @atomic-ehr/server @atomic-ehr/core
```

Or with Bun:

```bash
bun init
bun add @atomic-ehr/server @atomic-ehr/core
```

## Step 2: Create Basic Server (2 minutes)

Create `src/server.js`:

```javascript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  host: 'localhost',
  packages: ['hl7.fhir.r4.core#4.0.1'],
  packageConfig: {
    registryUrls: ['https://packages.fhir.org']
  }
});

await server.start();

console.log('🚀 FHIR server running on http://localhost:3000');
console.log('📊 Capability statement: http://localhost:3000/metadata');
```

**Run it:**

```bash
node src/server.js
# or with Bun:
bun src/server.js
```

**Test it:**

```bash
# Get capability statement
curl http://localhost:3000/metadata

# Create a patient
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{
      "family": "Doe",
      "given": ["John"]
    }],
    "gender": "male",
    "birthDate": "1990-01-01"
  }'

# Read the patient (use ID from previous response)
curl http://localhost:3000/Patient/{id}

# Search patients
curl http://localhost:3000/Patient?family=Doe
```

🎉 **Congratulations!** You now have a working FHIR server with full CRUD operations!

## Step 3: Add Custom Validation (3 minutes)

Let's add business rules for Patient resources.

Create `src/hooks/patient-validation.js`:

```javascript
import { defineHook } from '@atomic-ehr/core';
import { FhirValidationError } from '@atomic-ehr/server';

export default defineHook({
  name: 'patient-business-rules',
  phase: 'preHandler',
  resources: 'Patient',
  priority: 60,
  async handler(context) {
    if (context.operation === 'create' && context.body) {
      const patient = context.body;

      // Rule 1: All patients must have a family name
      if (!patient.name?.[0]?.family) {
        throw new FhirValidationError(
          'Patient must have a family name',
          [{
            type: 'required',
            message: 'Family name is required',
            path: 'Patient.name.family'
          }]
        );
      }

      // Rule 2: Adult patients must have contact info
      if (patient.birthDate) {
        const age = calculateAge(patient.birthDate);
        if (age >= 18 && !patient.telecom?.length) {
          throw new FhirValidationError(
            'Adult patients must have contact information',
            [{
              type: 'constraint',
              message: 'Patients 18 or older must have at least one telecom',
              path: 'Patient.telecom',
              constraint: 'age >= 18 implies telecom.exists()'
            }]
          );
        }
      }

      // Rule 3: Email must be valid format
      if (patient.telecom) {
        for (const contact of patient.telecom) {
          if (contact.system === 'email' && contact.value) {
            if (!isValidEmail(contact.value)) {
              throw new FhirValidationError(
                'Invalid email format',
                [{
                  type: 'format',
                  message: `Email address '${contact.value}' is not valid`,
                  path: 'Patient.telecom.value'
                }]
              );
            }
          }
        }
      }
    }

    return context;
  }
});

function calculateAge(birthDate) {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

The hook is automatically discovered and loaded from `src/hooks/`!

**Test the validation:**

```bash
# Try without family name (should fail)
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","gender":"male"}'
# Expected: 422 Unprocessable Entity

# Try adult without contact (should fail)
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType":"Patient",
    "name":[{"family":"Doe","given":["John"]}],
    "birthDate":"1990-01-01"
  }'
# Expected: 422 with telecom requirement message

# Valid patient
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType":"Patient",
    "name":[{"family":"Doe","given":["John"]}],
    "birthDate":"1990-01-01",
    "telecom":[{"system":"email","value":"john.doe@example.com"}]
  }'
# Expected: 201 Created
```

## Step 4: Add Audit Logging (3 minutes)

Track all resource modifications for compliance.

Create `src/hooks/audit-logger.js`:

```javascript
import { defineHook } from '@atomic-ehr/core';

export default defineHook({
  name: 'audit-logger',
  phase: 'onResponse',
  resources: '*', // All resources
  priority: 50,
  async handler(context) {
    // Only audit write operations
    if (['create', 'update', 'delete', 'patch'].includes(context.operation)) {
      const auditEvent = {
        timestamp: new Date().toISOString(),
        eventType: context.operation,
        resourceType: context.resourceType,
        resourceId: context.params?.id || context.responseBody?.id,
        userId: context.user?.id || 'anonymous',
        userRole: context.user?.role,
        ipAddress: context.headers['x-forwarded-for'] ||
                   context.headers['x-real-ip'] ||
                   'unknown',
        userAgent: context.headers['user-agent'],
        statusCode: context.statusCode,
        success: context.statusCode < 400
      };

      // In production, send to audit log system (e.g., database, SIEM)
      console.log('AUDIT:', JSON.stringify(auditEvent));

      // You could also create a FHIR AuditEvent resource
      // await createAuditEvent(auditEvent);
    }

    return context;
  }
});
```

## Step 5: Add Authentication (4 minutes)

Secure your server with token-based authentication.

Create `src/hooks/auth.js`:

```javascript
import { defineHook } from '@atomic-ehr/core';
import { FhirUnauthorizedError, FhirForbiddenError } from '@atomic-ehr/server';

export default defineHook({
  name: 'bearer-auth',
  phase: 'preRequest',
  priority: 95, // Run early
  async handler(context) {
    // Skip auth for metadata endpoint (required by FHIR spec)
    if (context.url === '/metadata' || context.url.startsWith('/metadata')) {
      return context;
    }

    // Check for Authorization header
    const authHeader = context.headers.authorization || context.headers.Authorization;

    if (!authHeader) {
      throw new FhirUnauthorizedError('Authorization header required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new FhirUnauthorizedError('Bearer token required');
    }

    const token = authHeader.substring(7);

    // Validate token (this is simplified - use proper JWT validation in production)
    const user = await validateToken(token);

    if (!user) {
      throw new FhirUnauthorizedError('Invalid or expired token');
    }

    // Add user to context for use in other hooks
    context.user = user;

    // Check permissions for write operations
    if (['create', 'update', 'delete', 'patch'].includes(context.operation)) {
      if (!user.permissions.includes('write')) {
        throw new FhirForbiddenError('Insufficient permissions for write operations');
      }
    }

    return context;
  }
});

async function validateToken(token) {
  // Simple token validation for demo
  // In production, use proper JWT validation with jwt.verify()
  if (token === 'demo-token-123') {
    return {
      id: 'demo-user',
      username: 'demo',
      role: 'practitioner',
      permissions: ['read', 'write']
    };
  }

  if (token === 'readonly-token-456') {
    return {
      id: 'readonly-user',
      username: 'readonly',
      role: 'viewer',
      permissions: ['read']
    };
  }

  return null;
}
```

**Test authentication:**

```bash
# Without auth (should fail)
curl -X GET http://localhost:3000/Patient
# Expected: 401 Unauthorized

# With valid token
curl -X GET http://localhost:3000/Patient \
  -H "Authorization: Bearer demo-token-123"
# Expected: 200 OK with search results

# Read-only token trying to create (should fail)
curl -X POST http://localhost:3000/Patient \
  -H "Authorization: Bearer readonly-token-456" \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","name":[{"family":"Test"}]}'
# Expected: 403 Forbidden
```

## Step 6: Add Custom Operations (3 minutes)

Implement a custom FHIR operation.

Create `src/operations/patient-summary.js`:

```javascript
import { defineOperation } from '@atomic-ehr/core';

export default defineOperation({
  name: 'summary',
  resourceType: 'Patient',
  level: 'instance', // /Patient/{id}/$summary
  async handler(context) {
    const patientId = context.params.id;

    // Get the patient
    const storage = context.storage;
    const patientResult = await storage.read('Patient', patientId);

    if (!patientResult.found) {
      throw new FhirNotFoundError('Patient', patientId);
    }

    const patient = patientResult.resource;

    // Generate summary
    const summary = {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: [
        {
          fullUrl: `${context.baseUrl}/Patient/${patientId}`,
          resource: patient
        }
      ]
    };

    // In a real implementation, you'd also fetch related resources
    // - Observations for this patient
    // - Conditions
    // - Medications
    // - etc.

    return {
      statusCode: 200,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8'
      },
      responseBody: summary
    };
  }
});
```

**Test the custom operation:**

```bash
# First create a patient
PATIENT_ID=$(curl -s -X POST http://localhost:3000/Patient \
  -H "Authorization: Bearer demo-token-123" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType":"Patient",
    "name":[{"family":"Doe","given":["John"]}],
    "birthDate":"1990-01-01",
    "telecom":[{"system":"email","value":"john@example.com"}]
  }' | jq -r '.id')

# Call the custom operation
curl http://localhost:3000/Patient/${PATIENT_ID}/\$summary \
  -H "Authorization: Bearer demo-token-123"
```

## Step 7: Enable Full Logging and Debugging (2 minutes)

Update your server configuration for production-ready logging:

```javascript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  host: 'localhost',
  packages: ['hl7.fhir.r4.core#4.0.1'],

  // Logging configuration
  logging: {
    level: 'info',
    format: 'json' // Use 'text' for development
  },

  // Request/response logging
  requestLogging: {
    logRequests: true,
    logResponses: true,
    logBodies: false, // Set true for debugging
    logHeaders: true,
    slowRequestThreshold: 1000 // Warn if > 1 second
  },

  // Error handling
  errorHandling: {
    includeStackTrace: process.env.NODE_ENV === 'development',
    logErrors: true,
    logLevel: 'error',
    sanitizeErrors: process.env.NODE_ENV === 'production',
    detailedValidationErrors: true,
    enableErrorMetrics: true
  },

  // Debug mode (development only)
  debug: process.env.NODE_ENV === 'development',

  // CORS for browser access
  cors: {
    enabled: true,
    origins: ['http://localhost:3001'], // Your frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization']
  }
});

await server.start();

// Display server stats
console.log('\n📊 Server Statistics:');
console.log('Packages loaded:', server.getLoadedPackages().length);
console.log('Resource types:', server.getSupportedResourceTypes().length);
console.log('Dynamic routes:', server.getDynamicRoutes().length);

// Monitor error metrics
setInterval(() => {
  const metrics = server.getErrorMetrics();
  if (metrics && metrics.totalErrors > 0) {
    console.log('\n⚠️  Error Metrics:', {
      total: metrics.totalErrors,
      rate: metrics.errorRate,
      lastError: metrics.lastErrorTime
    });
  }
}, 60000); // Every minute
```

## What You've Built

Congratulations! You now have a production-ready FHIR server with:

✅ **Full CRUD Operations** - All FHIR resource types supported
✅ **Automatic Validation** - FHIR R4 schema validation
✅ **Custom Business Rules** - Patient validation with age checks
✅ **Audit Logging** - Compliance-ready audit trail
✅ **Authentication** - Bearer token security
✅ **Custom Operations** - Patient summary operation
✅ **Error Handling** - FHIR OperationOutcome responses
✅ **Request Logging** - Structured logs with timing
✅ **Capability Statement** - Auto-generated at `/metadata`

## Next Steps

### Learn More

- [API Reference](./api-reference.md) - Complete API documentation
- [Hook System](./hooks.md) - Deep dive into hooks
- [Configuration Guide](./configuration.md) - All configuration options
- [Examples](./examples.md) - More use cases

### Production Deployment

1. **Database** - Integrate a proper database (PostgreSQL, MongoDB)
2. **Authentication** - Implement JWT with proper validation
3. **HTTPS** - Add TLS certificates
4. **Monitoring** - Integrate with monitoring tools
5. **Rate Limiting** - Add rate limiting hooks
6. **Caching** - Implement caching strategies

### Common Patterns

See our [examples directory](../examples/) for:
- Custom search parameters
- Resource versioning
- Bulk operations
- GraphQL integration
- SMART on FHIR
- Subscription support

## Troubleshooting

### Package Loading Issues

If packages fail to load:
```javascript
packageConfig: {
  registryUrls: ['https://packages.fhir.org'],
  failOnPackageLoadError: false, // Continue even if package fails
  enableProgressLogging: true // See what's happening
}
```

### Validation Not Working

Ensure hooks are in the correct directory:
```
src/
├── hooks/          ← Hooks auto-discovered here
├── operations/     ← Operations auto-discovered here
└── server.js
```

### Debug Mode

Enable debug mode to see detailed logs:
```javascript
debug: true,
logging: { level: 'debug' }
```

## Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/atomic-ehr/atomic-ehr)
- **Discussions**: [Ask questions](https://github.com/atomic-ehr/atomic-ehr/discussions)
- **Documentation**: [Full docs](https://docs.atomic-ehr.org)

Happy building! 🚀