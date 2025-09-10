# Atomic FHIR Authentication Module

The Atomic FHIR Authentication Module provides comprehensive OAuth2/OIDC and SMART on FHIR authentication and authorization capabilities for Atomic FHIR servers.

## Features

- 🔐 **OAuth2 Authorization Code Flow** with PKCE support
- 🎯 **SMART on FHIR Scopes** with full grammar support
- 🔄 **Refresh Token Support** for long-lived access
- 🏥 **FHIR-native Storage** using embedded StructureDefinitions
- 🌱 **Automatic Seeding** with default users and clients
- 🎨 **Responsive Login UI** served as static assets
- ⚡ **Production Ready** with security best practices

## Quick Start

### 1. Install Dependencies

```bash
npm install @atomic-fhir/core @atomic-fhir/auth bcrypt jsonwebtoken uuid
```

### 2. Basic Server Setup

```typescript
import { Atomic } from "@atomic-fhir/core";
import { registerAuthRoutes, checkAndRunAutoSeeding, createAuthSecurityMiddleware } from "@atomic-fhir/auth";

const app = new Atomic({
  server: {
    name: "FHIR Server with Authentication",
    port: 3000
  },
  packages: [
    {
      package: "hl7.fhir.r4.core",
      version: "4.0.1",
      npmRegistry: "https://get-ig.org"
    }
  ],
  // Add auth security middleware to populate request.security.scopes
  middleware: [
    createAuthSecurityMiddleware()
  ]
});

// Register authentication routes
registerAuthRoutes(app.router, {
  basePath: '/auth',
  enableStaticAssets: true
});

// Auto-seed users and clients on first run
app.hooks.register('beforeStart', async (context) => {
  await checkAndRunAutoSeeding(context);
});

app.start();
```

### 3. Protecting Routes with Scopes

```typescript
import { SMARTScopes } from "@atomic-fhir/core";

// Protect individual routes
app.router.get('/Patient', SMARTScopes.requireScopes(['patient/*.read']));

// Protect with multiple scope options
app.router.get('/Observation', SMARTScopes.requireAnyScope([
  'patient/Observation.read',
  'user/Observation.read'
]));

// Dynamic scope requirements
app.router.get('/Patient/:id', SMARTScopes.requireScopes((req) => {
  const patientId = req.params.id;
  return [`patient/Patient.read`, `launch/patient`];
}));
```

## Authentication Endpoints

### Authorization Endpoint
```
GET /auth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&scope=SCOPES&state=STATE
```

**Parameters:**
- `response_type`: Must be `code`
- `client_id`: Registered client identifier
- `redirect_uri`: Must match registered redirect URI
- `scope`: Space-separated SMART on FHIR scopes
- `state`: CSRF protection parameter (recommended)
- `code_challenge` & `code_challenge_method`: PKCE parameters (optional)

### Token Endpoint
```
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=AUTH_CODE&redirect_uri=REDIRECT_URI&client_id=CLIENT_ID
```

**Grant Types:**
- `authorization_code`: Exchange authorization code for access token
- `refresh_token`: Exchange refresh token for new access token

### Well-Known Configuration
```
GET /.well-known/smart-configuration
```

Returns SMART on FHIR configuration including supported capabilities and endpoints.

## SMART on FHIR Scopes

### Scope Grammar

The module supports the complete SMART on FHIR scope grammar:

```
[prefix]/[ResourceType].[permissions]
```

**Prefixes:**
- `patient/`: Patient-specific data access
- `user/`: User-accessible data 
- `system/`: System-level access (no user context)

**Permissions:**
- `c`: Create
- `r`: Read  
- `u`: Update
- `d`: Delete
- `s`: Search
- `*`: All permissions
- `cruds`: All permissions (explicit)

**Examples:**
```typescript
// Patient-specific access
"patient/Patient.read"          // Read patient's own data
"patient/*.cruds"              // Full access to patient's data
"patient/Observation.rs"       // Read and search patient's observations

// User-based access  
"user/Patient.read"            // Read patients user can access
"user/*.read"                  // Read all resources user can access

// System access
"system/Patient.*"             // Full patient access (system context)
"system/*.*"                   // Full system access

// Launch context
"launch/patient"               // Request patient context
"launch/encounter"             // Request encounter context

// Special scopes
"offline_access"               // Request refresh token
"online_access"                // Session-based access
"fhirUser"                     // Get user identity
```

### Checking Scopes in Code

```typescript
import { SMARTScopes } from "@atomic-fhir/core";

// In a route handler
app.router.get('/Patient/:id', async (req, context) => {
  // Check if user has required scope
  if (!SMARTScopes.hasScope(req, 'patient/Patient.read')) {
    return { status: 403, body: { error: 'insufficient_scope' } };
  }
  
  // Get security context
  const security = SMARTScopes.getSecurityContext(req);
  console.log('User scopes:', security?.scopes);
  console.log('User info:', security?.user);
  console.log('Client info:', security?.client);
  
  // Proceed with request...
});

// Check permissions for FHIR operations
const canRead = SMARTScopes.scopesToPermissions(
  ['patient/*.read'], 
  'Patient', 
  'read'
);
```

## Seeding and Initial Setup

### Default Credentials

The module automatically creates default users and clients on first startup:

**Users:**
- Username: `admin`, Password: `admin123`
  - Roles: `admin`, `practitioner`
  - Scopes: `system/*.*`, `user/*.*`, `patient/*.*`
- Username: `doctor`, Password: `doctor123`  
  - Roles: `practitioner`
  - Scopes: `user/Patient.read`, `user/Observation.read`, `patient/*.read`

**Clients:**
- Client ID: `demo-public-client` (Public client)
  - Redirect URIs: `http://localhost:3000/callback`, `http://localhost:8080/callback`
  - Scopes: `patient/*.read`, `user/Patient.read`, `launch/patient`, `offline_access`
- Client ID: `demo-confidential-client` (Confidential client)
  - Client Secret: `demo-secret-123`
  - Redirect URIs: `https://app.example.com/auth/callback`
  - Scopes: `system/*.*`, `user/*.*`, `patient/*.*`, `offline_access`

### Manual Seeding

```typescript
import { seedAuthData, getSeedingOptions } from "@atomic-fhir/auth";

// Seed with options
const result = await seedAuthData(context, {
  force: false,           // Don't overwrite existing data
  skipExisting: true,     // Skip resources that already exist
  validateOnly: false     // Actually create resources
});

console.log('Seeding result:', result);

// CLI integration
const shouldSeed = shouldRunSeeding(process.argv);
const options = getSeedingOptions(process.argv);

if (shouldSeed) {
  await seedAuthData(context, options);
}
```

### CLI Flags

```bash
# Force re-seed (overwrite existing data)
bun run dev --force-seed

# Validate seed data without creating
bun run dev --validate-seeds

# Normal seeding (skip existing)
bun run dev --seed
```

## Custom Identity Providers

### Adding Custom Scopes

```typescript
// In your middleware or identity provider
function customIdentityProvider() {
  return async (req, context) => {
    // Authenticate user through custom method
    const user = await authenticateCustomUser(req);
    
    if (user) {
      // Set security context with custom scopes
      SMARTScopes.setSecurityContext(req, {
        scopes: [
          'user/Patient.read',
          'user/Observation.read',
          'launch/patient'
        ],
        user: {
          id: user.id,
          roles: user.roles
        },
        client: {
          id: 'custom-client',
          type: 'confidential'
        }
      });
    }
    
    return req;
  };
}

// Register the middleware
app.middleware.register(customIdentityProvider());
```

### Protecting Routes

```typescript
// Require specific scopes
app.router.get('/Patient', 
  SMARTScopes.requireScopes(['patient/*.read']),
  patientHandler
);

// Require any of multiple scopes
app.router.get('/Observation',
  SMARTScopes.requireAnyScope([
    'patient/Observation.read',
    'user/Observation.read'
  ]),
  observationHandler
);

// Dynamic scope requirements
app.router.get('/Patient/:id',
  SMARTScopes.requireScopes((req) => {
    const patientId = req.params.id;
    return [`patient/Patient.read`];
  }),
  patientDetailHandler
);
```

## Configuration Options

### Router Configuration

```typescript
import { registerAuthRoutes } from "@atomic-fhir/auth";

registerAuthRoutes(app.router, {
  basePath: '/auth',              // Base path for auth endpoints
  enableStaticAssets: true,       // Serve login UI assets
  staticPath: '/auth/static'      // Path for static assets
});
```

### Security Middleware Configuration

```typescript
import { createAuthSecurityMiddleware } from "@atomic-fhir/auth";

const securityMiddleware = createAuthSecurityMiddleware({
  tokenHeader: 'authorization',   // Header to check for tokens
  skipPaths: ['/public'],        // Paths to skip authentication
  onError: (error, req) => {     // Custom error handling
    console.log('Auth error:', error);
  }
});

app.middleware.register(securityMiddleware);
```

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run specific test suites
bun test packages/core/src/__tests__/scopes.test.ts
bun test packages/auth/src/__tests__/oauth2-flows.test.ts

# Run with coverage
bun test --coverage
```

### Test Utilities

```typescript
import { SMARTScopes } from "@atomic-fhir/core";

// Create mock request with scopes
const mockRequest = new Request("http://test.com");
SMARTScopes.setSecurityContext(mockRequest, {
  scopes: ['patient/*.read', 'user/Observation.rs'],
  user: { id: 'test-user' }
});

// Test scope requirements
const hasScope = SMARTScopes.hasScope(mockRequest, 'patient/Patient.read');
expect(hasScope).toBe(true);
```

## Security Considerations

### Production Deployment

1. **HTTPS Only**: Always use HTTPS in production
2. **Secure Cookies**: Configure secure cookie settings
3. **Rate Limiting**: Implement rate limiting on auth endpoints
4. **Token Rotation**: Implement token rotation policies
5. **Audit Logging**: Enable comprehensive audit logging
6. **Secret Management**: Use secure secret storage

### Security Headers

```typescript
app.middleware.register((req, context) => {
  return {
    ...req,
    headers: {
      ...req.headers,
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Content-Security-Policy': "default-src 'self'"
    }
  };
});
```

### Password Security

```typescript
import bcrypt from 'bcrypt';

// Hash passwords with bcrypt
const hashedPassword = await bcrypt.hash(plainPassword, 12);

// Verify passwords
const isValid = await bcrypt.compare(plainPassword, hashedPassword);
```

## Troubleshooting

### Common Issues

**Q: Login page not loading**
A: Ensure static assets are enabled and the `/auth/static/*` route is registered.

**Q: Token validation failing**  
A: Check that the security middleware is registered and tokens are properly formatted.

**Q: Scope validation errors**
A: Verify scope strings match the SMART on FHIR grammar exactly.

**Q: PKCE validation failing**
A: Ensure code verifier matches the challenge and method used.

### Debug Mode

```typescript
// Enable debug logging
process.env.DEBUG = "atomic-auth:*";

// Or specific components
process.env.DEBUG = "atomic-auth:scopes,atomic-auth:oauth2";
```

### Logging

```typescript
import { createAuditEvent } from "@atomic-fhir/auth";

// Custom audit logging
const auditEvent = createAuditEvent({
  type: 'auth_success',
  userId: user.id,
  resource: 'Patient',
  operation: 'read',
  success: true
});

console.log('Audit:', auditEvent);
```

## API Reference

### Core Functions

- `SMARTScopes.parseSMARTScope(scope: string)`: Parse a single SMART scope
- `SMARTScopes.hasScope(request: Request, scope: string)`: Check if request has scope
- `SMARTScopes.requireScopes(scopes: string[])`: Middleware to require scopes
- `SMARTScopes.scopesToPermissions(scopes, resourceType, operation)`: Convert scopes to permissions

### Authentication Functions

- `registerAuthRoutes(router, config)`: Register auth endpoints
- `createAuthSecurityMiddleware()`: Create token validation middleware
- `seedAuthData(context, options)`: Seed authentication data
- `checkAndRunAutoSeeding(context)`: Auto-seed if needed

### Types

- `SecurityContext`: Request security context
- `AuthRouterConfig`: Router configuration options
- `SeedingOptions`: Seeding configuration
- `ParsedSMARTScope`: Parsed scope structure

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.