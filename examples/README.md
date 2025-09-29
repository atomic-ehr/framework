# Atomic FHIR Server Examples

This directory contains comprehensive examples demonstrating different features and use cases of the Atomic FHIR Server framework.

## Examples Overview

### 01. Basic Server
**Path**: `01-basic-server/`
**Complexity**: ⭐ Beginner
**Time**: 5 minutes

The simplest possible FHIR server in just 10 lines of code.

**What you'll learn**:
- ✅ Minimal server setup
- ✅ Automatic FHIR R4 Core package loading
- ✅ Full CRUD operations out of the box
- ✅ Auto-generated capability statement

**Run it**:
```bash
cd 01-basic-server
bun server.js
```

**Test it**:
```bash
curl http://localhost:3000/metadata
curl http://localhost:3000/Patient
```

---

### 02. Server with Hooks
**Path**: `02-with-hooks/`
**Complexity**: ⭐⭐ Intermediate
**Time**: 10 minutes

Demonstrates how to add custom business logic using the hooks system.

**What you'll learn**:
- ✅ Adding lifecycle hooks
- ✅ Automatic timestamping
- ✅ Custom validation rules
- ✅ Audit logging
- ✅ Hook phases and priorities

**Run it**:
```bash
cd 02-with-hooks
bun server.js
```

**Test it**:
```bash
# Should fail - no family name
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","gender":"male"}'

# Should succeed
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","name":[{"family":"Doe","given":["John"]}]}'
```

---

### 03. Server with Authentication
**Path**: `03-with-auth/`
**Complexity**: ⭐⭐⭐ Advanced
**Time**: 15 minutes

Demonstrates JWT-based authentication and role-based authorization.

**What you'll learn**:
- ✅ Bearer token authentication
- ✅ Role-based access control
- ✅ Permission checking
- ✅ Audit logging with user info
- ✅ Security best practices

**Run it**:
```bash
cd 03-with-auth
bun server.js
```

**Test it**:
```bash
# No auth - should fail (401)
curl http://localhost:3000/Patient

# With admin token - should succeed
curl http://localhost:3000/Patient \
  -H "Authorization: Bearer admin-token-123"

# Create with readonly token - should fail (403)
curl -X POST http://localhost:3000/Patient \
  -H "Authorization: Bearer readonly-token-789" \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","name":[{"family":"Test"}]}'

# Create with doctor token - should succeed
curl -X POST http://localhost:3000/Patient \
  -H "Authorization: Bearer doctor-token-456" \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","name":[{"family":"Doe","given":["John"]}]}'
```

**Available Tokens**:
- `admin-token-123` - Admin (read, write, delete)
- `doctor-token-456` - Doctor (read, write)
- `readonly-token-789` - Viewer (read only)

---

### 04. Custom Operations
**Path**: `04-custom-operations/`
**Complexity**: ⭐⭐⭐ Advanced
**Time**: 15 minutes

Demonstrates how to implement custom FHIR operations beyond standard CRUD.

**What you'll learn**:
- ✅ Implementing custom operations
- ✅ URL pattern matching
- ✅ Operation parameters
- ✅ Taking over request handling
- ✅ Returning custom responses

**Custom Operations**:
- `GET /Patient/{id}/$summary` - Get patient summary bundle
- `POST /Patient/$validate` - Validate patient without saving
- `GET /$stats` - Get server statistics

**Run it**:
```bash
cd 04-custom-operations
bun server.js
```

**Test it**:
```bash
# Create a patient first
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","name":[{"family":"Doe","given":["John"]}]}'

# Get patient summary (use ID from above)
curl http://localhost:3000/Patient/{id}/\$summary

# Validate a patient
curl -X POST http://localhost:3000/Patient/\$validate \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","gender":"invalid"}'

# Get server stats
curl http://localhost:3000/\$stats
```

---

## Prerequisites

### Required Software
- **Bun** v1.0.0 or higher (recommended) OR **Node.js** v18+ with npm
- Basic understanding of FHIR R4 concepts

### Installation

Install Bun (if not already installed):
```bash
curl -fsSL https://bun.sh/install | bash
```

Install dependencies (from the framework root):
```bash
cd /path/to/framework
bun install
```

## Running Examples

Each example is self-contained and can be run independently:

```bash
# Navigate to the example directory
cd examples/01-basic-server

# Run the server
bun server.js

# The server will start on http://localhost:3000
```

## Common Testing Commands

All examples use port 3000 by default. Here are common testing commands:

### Get Server Metadata
```bash
curl http://localhost:3000/metadata
```

### Create a Patient
```bash
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"family": "Doe", "given": ["John"]}],
    "gender": "male",
    "birthDate": "1980-01-01"
  }'
```

### Search Patients
```bash
curl http://localhost:3000/Patient
curl http://localhost:3000/Patient?family=Doe
curl http://localhost:3000/Patient?gender=male
```

### Read a Patient
```bash
curl http://localhost:3000/Patient/{id}
```

### Update a Patient
```bash
curl -X PUT http://localhost:3000/Patient/{id} \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "id": "{id}",
    "name": [{"family": "Smith", "given": ["Jane"]}],
    "gender": "female"
  }'
```

### Delete a Patient
```bash
curl -X DELETE http://localhost:3000/Patient/{id}
```

## Learning Path

We recommend following the examples in order:

1. **Start with 01-basic-server** to understand the fundamentals
2. **Move to 02-with-hooks** to learn about custom business logic
3. **Try 03-with-auth** to add security to your server
4. **Explore 04-custom-operations** to extend beyond CRUD

## Example Structure

Each example follows this structure:

```
example-name/
├── server.js           # Main server implementation
├── README.md           # Example-specific documentation
└── package.json        # (optional) Example-specific dependencies
```

## Troubleshooting

### Port Already in Use
If you see "port 3000 already in use", either:
- Stop the previous example server (Ctrl+C)
- Change the port in the server configuration:
  ```javascript
  const server = new FhirServer({
    port: 3001,  // Use a different port
    // ...
  });
  ```

### Package Download Issues
If FHIR packages fail to download:
- Check your internet connection
- The packages will be cached in `~/.fhir/packages/` after first download
- You can manually download packages from https://packages.fhir.org/

### FHIR Validation Errors
If you see validation errors:
- Check that your resource structure matches FHIR R4 specification
- Ensure required fields are present
- Verify data types are correct (e.g., dates in YYYY-MM-DD format)

## Additional Resources

- **FHIR R4 Specification**: https://hl7.org/fhir/R4/
- **Framework Documentation**: `/docs/getting-started.md`
- **API Reference**: `/docs/api-reference.md`
- **FHIR Package Registry**: https://packages.fhir.org/

## Contributing Examples

Have an idea for a new example? Contributions are welcome!

Examples should:
- Be self-contained and runnable
- Include clear documentation
- Follow the existing example structure
- Demonstrate a specific feature or use case
- Include test commands in the README

## Next Steps

After completing these examples, you're ready to:

1. **Build your own FHIR server** - Start with the basic template and add features
2. **Explore advanced topics** - Check out the full documentation in `/docs/`
3. **Integrate with your systems** - Connect to databases, add authentication, implement custom operations
4. **Deploy to production** - Learn about deployment best practices

Happy coding! 🚀