# Authenticated FHIR Server Example

This example demonstrates how to build a fully authenticated FHIR server with comprehensive authentication, authorization, and audit logging using the `@atomic-fhir/auth` package. The server includes full R4 Core FHIR resource support with working authentication middleware.

## Features

- **Full R4 Core FHIR Support**: All R4 Core resources (Patient, Observation, Practitioner, etc.)
- **Multiple Authentication Strategies**: Basic Auth and Bearer Token authentication ✅ 
- **Role-Based Access Control (RBAC)**: Different user roles with specific permissions ✅ 
- **FHIR Resource Permissions**: Fine-grained permissions per resource type and operation ✅
- **Audit Logging**: Complete audit trail of all authentication and resource access ✅
- **Session Management**: Secure session handling with configurable options ✅

## Current Status

✅ **Fully Working**: Complete authenticated FHIR server with middleware integration

## Quick Start

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Start the server**:
   ```bash
   bun run dev
   ```

3. **Test authentication**:
   ```bash
   # Basic Auth
   curl -u admin:secret123 http://localhost:3004/Patient
   
   # Bearer Token
   curl -H "Authorization: Bearer admin-token-123" http://localhost:3004/Patient
   
   # Public endpoints (no auth required)
   curl http://localhost:3004/metadata
   ```

## Authentication Methods

### Basic Authentication

The server supports Basic Auth with the following predefined users:

| Username | Password   | Role         | Permissions |
|----------|------------|--------------|-------------|
| `admin`  | `secret123` | admin        | Full access to all resources |
| `doctor` | `doctor123` | practitioner | Patient, Observation, Practitioner access |
| `nurse`  | `nurse123`  | nurse        | Limited Patient and Observation access |

**Example:**
```bash
curl -u doctor:doctor123 \
  -H "Content-Type: application/fhir+json" \
  http://localhost:3003/Patient
```

### Bearer Token Authentication

The server also supports Bearer Token authentication:

| Token             | User      | Permissions |
|-------------------|-----------|-------------|
| `admin-token-123` | admin     | Full access to all resources |
| `api-key-456`     | api-user  | Read-only Patient and Observation access |

**Example:**
```bash
curl -H "Authorization: Bearer api-key-456" \
  http://localhost:3003/Patient
```

## User Roles and Permissions

### Admin Role
- **Resources**: All (`*`)
- **Operations**: create, read, update, delete, search
- **Conditions**: None (full access)

### Practitioner Role
- **Resources**: Patient, Observation, Practitioner, Organization
- **Operations**: create, read, update, search
- **Conditions**: Must be associated with the practitioner

### Nurse Role
- **Resources**: Patient, Observation
- **Operations**: read, search, create
- **Conditions**: Must be performer of the resource

### API Role
- **Resources**: Patient, Observation
- **Operations**: read, search only
- **Conditions**: None

## API Endpoints

### Public Endpoints (No Authentication Required)
- `GET /metadata` - Server capabilities
- `GET /health` - Health check

### Protected Endpoints (Authentication Required)
- `POST /Patient` - Create patient
- `GET /Patient` - Search patients
- `GET /Patient/{id}` - Read specific patient
- `PUT /Patient/{id}` - Update patient
- `DELETE /Patient/{id}` - Delete patient
- All R4 Core resources: `/Observation`, `/Practitioner`, `/Organization`, etc.
- Full CRUD operations on all resources based on user permissions

## Testing Different Permissions

### Create a Patient (Admin only)
```bash
curl -u admin:secret123 \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{
      "given": ["John"],
      "family": "Doe"
    }]
  }' \
  http://localhost:3003/Patient
```

### Search Patients (All authenticated users)
```bash
# As doctor
curl -u doctor:doctor123 http://localhost:3003/Patient

# As nurse (limited view)
curl -u nurse:nurse123 http://localhost:3003/Patient

# As API user (read-only)
curl -H "Authorization: Bearer api-key-456" http://localhost:3003/Patient
```

### Try Unauthorized Access
```bash
# This will fail - nurse cannot delete
curl -u nurse:nurse123 -X DELETE http://localhost:3003/Patient/123

# This will fail - API user cannot create
curl -H "Authorization: Bearer api-key-456" \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType": "Patient"}' \
  http://localhost:3003/Patient
```

## Audit Logging

The server logs all authentication attempts and resource access:

- **Authentication Events**: Login attempts, success/failure
- **Authorization Events**: Permission checks, access denials
- **Resource Events**: CRUD operations with user context
- **Security Events**: Suspicious activities, rate limiting

Example audit log entry:
```
[2024-09-05T10:30:00.000Z] info: User doctor authenticated successfully - Strategy: basic-auth, User: doctor-001
[2024-09-05T10:30:01.000Z] info: Resource access granted - User: doctor-001, Resource: Patient, Operation: read
```

## Configuration

### Authentication Strategies
You can configure additional authentication strategies or modify existing ones in `src/server.ts`:

```typescript
const authManager = new AuthManager({
  strategies: [
    new BasicAuthStrategy({
      name: 'basic-auth',
      users: {
        // Add your users here
      }
    }),
    new BearerTokenStrategy({
      name: 'bearer-token',
      tokens: {
        // Add your tokens here
      }
    })
  ],
  sessionConfig: {
    enabled: true,
    secret: 'your-secret-key',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});
```

### Permissions
Modify role templates in the `FHIRPermissionManager` configuration:

```typescript
const permissionManager = new FHIRPermissionManager({
  roleTemplates: {
    customRole: {
      resourceTypes: ['Patient', 'Observation'],
      operations: ['read', 'search'],
      conditions: [
        {
          field: 'subject.reference',
          operator: 'equals',
          value: 'Patient/{{user.patientId}}'
        }
      ]
    }
  }
});
```

### Audit Configuration
Configure audit backends and settings:

```typescript
const auditManager = new AuditManager({
  enabled: true,
  backends: [
    new ConsoleAuditBackend(),
    // Add FileAuditBackend, DatabaseAuditBackend, etc.
  ],
  config: {
    includeRequestHeaders: true,
    sanitizeFields: ['password', 'token'],
    retentionDays: 90
  }
});
```

## Error Handling

The server returns appropriate HTTP status codes and FHIR-compliant error responses:

### 401 Unauthorized
```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "login",
    "diagnostics": "Authentication required"
  }]
}
```

### 403 Forbidden
```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "forbidden",
    "diagnostics": "Insufficient permissions for this operation"
  }]
}
```

## Security Considerations

1. **Change Default Credentials**: Update default usernames and passwords
2. **Use HTTPS**: Enable SSL/TLS in production
3. **Secure Session Keys**: Use strong, random session secrets
4. **Token Management**: Implement token rotation and expiration
5. **Rate Limiting**: Add rate limiting middleware
6. **Input Validation**: Validate all FHIR resources
7. **Audit Retention**: Configure appropriate log retention policies

## Next Steps

- Integrate with external identity providers (OAuth2, SAML)
- Implement JWT token-based authentication
- Add SMART on FHIR support
- Set up database-backed user management
- Configure advanced audit backends (database, webhook)
- Add custom permission conditions based on your use case