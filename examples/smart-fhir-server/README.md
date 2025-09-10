# SMART on FHIR Server Example

This example demonstrates a complete FHIR server with SMART on FHIR authentication, OAuth2 authorization flows, and scope-based access control using the Atomic FHIR framework.

## Features

- 🔐 OAuth2 Authorization Code Flow with PKCE support
- 🎯 SMART on FHIR scope validation
- 👥 Multi-user authentication with role-based access
- 🖥️ Responsive login UI with error handling
- 🌱 Automatic seeding of users and clients
- 📊 Comprehensive audit logging
- ⚡ Production-ready security practices

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Start the Server

```bash
bun run dev
```

The server will start at `http://localhost:3008` with:
- FHIR endpoints at `http://localhost:3008/`
- Authentication at `http://localhost:3008/auth/`
- Login UI at `http://localhost:3008/auth/static/login.html`

### 3. Test Authentication Flow

#### Option A: Using a Web Browser

1. Navigate to the authorization URL:
```
http://localhost:3008/auth/authorize?response_type=code&client_id=demo-public-client&redirect_uri=http://localhost:3000/callback&scope=patient/*.read&state=abc123
```

2. Login with default credentials:
   - **Admin**: username `admin`, password `admin123`
   - **Doctor**: username `doctor`, password `doctor123`

3. You'll be redirected to the callback URL with an authorization code

#### Option B: Using cURL

1. Get authorization code (will redirect to login page):
```bash
curl -i "http://localhost:3008/auth/authorize?response_type=code&client_id=demo-public-client&redirect_uri=http://localhost:3000/callback&scope=patient/*.read&state=abc123"
```

2. Login via the web interface or use the login API:
```bash
curl -X POST http://localhost:3008/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123", 
    "session_id": "SESSION_ID_FROM_STEP_1"
  }'
```

3. Exchange authorization code for access token:
```bash
curl -X POST http://localhost:3008/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=YOUR_CODE&redirect_uri=http://localhost:3000/callback&client_id=demo-public-client"
```

4. Use access token to access FHIR data:
```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     http://localhost:3008/Patient
```

## Default Users and Clients

### Users

| Username | Password | Roles | Scopes |
|----------|----------|-------|--------|
| `admin` | `admin123` | admin, practitioner | `system/*.*`, `user/*.*`, `patient/*.*` |
| `doctor` | `doctor123` | practitioner | `user/Patient.read`, `user/Observation.read`, `patient/*.read` |

### Clients

| Client ID | Type | Secret | Redirect URIs | Scopes |
|-----------|------|--------|---------------|--------|
| `demo-public-client` | public | none | `http://localhost:3000/callback`, `http://localhost:8080/callback` | `patient/*.read`, `user/Patient.read`, `launch/patient`, `offline_access` |
| `demo-confidential-client` | confidential | `demo-secret-123` | `https://app.example.com/auth/callback` | `system/*.*`, `user/*.*`, `patient/*.*`, `offline_access` |

## SMART on FHIR Scopes

The server supports the complete SMART on FHIR scope grammar:

### Patient Scopes
```
patient/*.read          # Read all patient data
patient/Patient.read    # Read patient demographics only
patient/Observation.rs  # Read and search patient observations
```

### User Scopes  
```
user/*.read            # Read all data user has access to
user/Patient.read      # Read patients user can access
user/Observation.write # Write observations on user's behalf
```

### System Scopes
```
system/*.read          # System-level read access
system/Patient.*       # Full patient access (no user context)
system/*.*            # Full system access
```

### Launch Context
```
launch/patient         # Request patient context at launch
launch/encounter       # Request encounter context
launch/location        # Request location context
```

### Special Scopes
```
offline_access         # Request refresh token
online_access          # Session-based access  
fhirUser              # Get user identity information
```

## API Endpoints

### FHIR Endpoints (Protected)

All FHIR endpoints require appropriate scopes:

```bash
# Patient resources - requires patient/*.read, user/Patient.read, or system/Patient.read
GET /Patient
GET /Patient/:id
POST /Patient        # Requires write scopes

# Observation resources  
GET /Observation
GET /Observation/:id
POST /Observation

# System operations - requires system scopes
GET /Patient/$validate
GET /admin/users
```

### Authentication Endpoints

```bash
# OAuth2 authorization endpoint
GET /auth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=URI&scope=SCOPES&state=STATE

# Token endpoint
POST /auth/token
Content-Type: application/x-www-form-urlencoded
Body: grant_type=authorization_code&code=CODE&redirect_uri=URI&client_id=CLIENT_ID

# SMART configuration
GET /.well-known/smart-configuration

# Login UI
GET /auth/static/login.html
```

## Development

### Custom Resources

Add custom FHIR resources in `src/resources/`:

```typescript
// src/resources/CustomResource.ts
import { defineResource } from "@atomic-fhir/core";

export default defineResource({
  resourceType: 'CustomResource',
  capabilities: {
    read: true,
    create: true,
    search: true
  },
  // Custom handlers, hooks, etc.
});
```

### Custom Middleware

Add middleware in `src/middleware/`:

```typescript
// src/middleware/custom-auth.ts
import { defineMiddleware, SMARTScopes } from "@atomic-fhir/core";

export default defineMiddleware({
  name: "custom-auth",
  before: async (req, context) => {
    // Custom authentication logic
    const token = extractCustomToken(req);
    if (token) {
      SMARTScopes.setSecurityContext(req, {
        scopes: token.scopes,
        user: { id: token.userId }
      });
    }
    return req;
  }
});
```

### Custom Hooks

Add hooks in `src/hooks/`:

```typescript  
// src/hooks/audit-access.ts
import { defineHook } from "@atomic-fhir/core";

export default defineHook({
  name: "audit-access", 
  type: "afterRead",
  resources: "*",
  handler: async (resource, context) => {
    const security = context.security;
    console.log(`Access: ${security?.user?.id} read ${resource.resourceType}/${resource.id}`);
  }
});
```

### Seeding Custom Data

Create custom seed data:

```bash
# Force re-seed with fresh data
bun run dev --force-seed

# Validate seed data without applying
bun run dev --validate-seeds
```

## Testing

```bash
# Run unit tests
bun test

# Test with coverage
bun test --coverage

# Type checking
bun run typecheck
```

### Test OAuth2 Flow

```javascript
// Test authorization code flow
const authUrl = "http://localhost:3008/auth/authorize?response_type=code&client_id=demo-public-client&redirect_uri=http://localhost:3000/callback&scope=patient/*.read";

// Login and get code, then exchange for token
const tokenResponse = await fetch("http://localhost:3008/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=authorization_code&code=YOUR_CODE&redirect_uri=http://localhost:3000/callback&client_id=demo-public-client"
});

const { access_token } = await tokenResponse.json();

// Use token to access FHIR data
const patientResponse = await fetch("http://localhost:3008/Patient", {
  headers: { "Authorization": `Bearer ${access_token}` }
});
```

## Production Deployment

### Security Configuration

1. **Use HTTPS**: Configure TLS certificates
2. **Secure Secrets**: Use environment variables for secrets
3. **Database Security**: Use secure database connections
4. **Rate Limiting**: Implement rate limiting on auth endpoints
5. **Audit Logging**: Configure comprehensive audit trails

### Environment Variables

```bash
# Production database
DATABASE_URL=postgresql://user:pass@host:5432/fhir_db

# Security settings  
JWT_SECRET=your-secure-jwt-secret
BCRYPT_ROUNDS=12

# Server configuration
SERVER_PORT=443
SERVER_HOST=your-domain.com
SERVER_HTTPS=true

# OAuth2 settings
AUTH_TOKEN_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=2592000
```

### Docker Deployment

```dockerfile
FROM oven/bun:latest

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
```

## Troubleshooting

### Common Issues

**Q: Login page returns 404**  
A: Ensure static assets are enabled in router configuration

**Q: Token validation fails**  
A: Check that security middleware is registered before protected routes

**Q: Scopes not working**  
A: Verify scope strings exactly match SMART on FHIR grammar

**Q: PKCE validation errors**  
A: Ensure code_verifier matches the challenge method used

### Debug Logging

Enable debug logging:

```bash
DEBUG=atomic-auth:* bun run dev
```

### Health Checks

```bash
# Server health
curl http://localhost:3008/metadata

# Auth configuration  
curl http://localhost:3008/.well-known/smart-configuration

# Database connectivity
curl http://localhost:3008/Patient?_count=0
```

## Next Steps

- Explore the [Authentication Module Documentation](../../docs/auth/README.md)
- Check out other [Atomic FHIR Examples](../)
- Read the [SMART on FHIR Specification](http://hl7.org/fhir/smart-app-launch/)
- Learn about [OAuth 2.0](https://oauth.net/2/)

## License

MIT License - see [LICENSE](../../LICENSE) for details.