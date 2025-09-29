# Atomic EHR Framework

> A modern, hook-based FHIR R4 server framework for JavaScript/TypeScript built on Bun

A production-ready FHIR server framework that makes building healthcare applications simple, flexible, and powerful. Built from the ground up with a hook-based architecture that gives you complete control over the request lifecycle.

## 🚀 Features

- ⚡ **Hook-Based Architecture** - Inject custom logic at any point in the request lifecycle
- 🏥 **FHIR R4 Compliant** - Full REST API implementation with automatic validation
- 📦 **Package Management** - Load FHIR Implementation Guides dynamically
- 🚀 **Auto-Routing** - Dynamic route generation from FHIR packages
- ✅ **Built-in Validation** - Automatic resource validation using FHIRSchema
- 🔧 **Custom Operations** - Easy implementation of $match, $everything, etc.
- 💾 **Storage Adapters** - In-memory (default), SQLite, PostgreSQL support
- 📊 **Capability Statement** - Auto-generated metadata endpoint
- ⚡ **High Performance** - Built on Bun runtime for maximum speed
- 🛡️ **Type Safety** - Full TypeScript definitions included
- 📝 **Request Logging** - Comprehensive logging and debugging tools
- 🎯 **Flexible Configuration** - Control validation, error handling, and more

## Quick Start

### Installation

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install the framework
bun add @atomic-ehr/server
```

### Create Your First Server

```typescript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

await server.start();

console.log('🚀 FHIR Server running on http://localhost:3000');
```

That's it! Your server now supports:
- ✅ Full CRUD operations for all FHIR R4 resources
- ✅ Search with parameters
- ✅ Automatic validation
- ✅ Capability statement at `/metadata`

### Try it out

```bash
# Get server metadata
curl http://localhost:3000/metadata

# Create a patient
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"family": "Doe", "given": ["John"]}],
    "gender": "male"
  }'

# Search patients
curl http://localhost:3000/Patient

# Get a specific patient (use ID from create response)
curl http://localhost:3000/Patient/{id}
```

## Hook System

The framework's most powerful feature is its hook system. Hooks let you inject custom logic at any point in the request lifecycle.

### Hook Phases

1. **preRequest** - Before any request processing (auth, rate limiting)
2. **preHandler** - After routing, before handler (validation, transformation)
3. **onResponse** - After successful handling (logging, audit)
4. **onError** - When an error occurs (error logging)

### Example: Adding Hooks

```typescript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

// Add authentication hook
server.addHook({
  name: 'bearer-auth',
  phase: 'preRequest',
  priority: 95,
  handler: async (context) => {
    const token = context.headers.authorization;
    if (!token) {
      throw new FhirUnauthorizedError('Authentication required');
    }
    // Validate and add user to context
    context.user = await validateToken(token);
    return context;
  }
});

// Add automatic timestamping
server.addHook({
  name: 'auto-timestamp',
  phase: 'preHandler',
  resources: '*',
  priority: 70,
  handler: async (context) => {
    if (['create', 'update'].includes(context.operation)) {
      if (!context.body.meta) {
        context.body.meta = {};
      }
      context.body.meta.lastUpdated = new Date().toISOString();
    }
    return context;
  }
});

// Add audit logging
server.addHook({
  name: 'audit-logger',
  phase: 'onResponse',
  priority: 50,
  handler: async (context) => {
    if (['create', 'update', 'delete'].includes(context.operation)) {
      await auditLog.write({
        action: context.operation,
        resourceType: context.resourceType,
        userId: context.user?.id
      });
    }
    return context;
  }
});

await server.start();
```

## Package Management

### Modern Package Configuration

Atomic supports flexible package configuration with both NPM registry and direct URL downloads:

```javascript
const app = new Atomic({
  packages: [
    // Using NPM-style registry
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    },
    // Using direct URL download
    {
      package: 'hl7.fhir.us.core',
      version: '7.0.0',
      remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/7.0.0'
    }
  ]
});
```

### Auto-Registration of Resources

When loading packages like `hl7.fhir.r4.core`, Atomic automatically:
1. Identifies all 147 base resource definitions (Patient, Observation, etc.)
2. Registers them with full CRUD capabilities
3. Makes them immediately available via REST API
4. Reports their profiles in the metadata endpoint

```javascript
// This single configuration gives you ALL 147 FHIR R4 resources!
const app = new Atomic({
  packages: [
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    }
  ]
});

// Instantly available:
// GET/POST /Patient
// GET/POST /Observation
// GET/POST /Encounter
// ... and all 144 other R4 resources!
```

## Resource Capabilities

Full support for all FHIR interaction types:

```javascript
export default defineResource({
  resourceType: 'Patient',
  capabilities: {
    // Instance level operations
    read: true,                          // GET [base]/[type]/[id]
    vread: true,                         // GET [base]/[type]/[id]/_history/[vid]
    update: true,                        // PUT [base]/[type]/[id]
    'update-conditional': false,        // PUT [base]/[type]?[search]
    patch: false,                        // PATCH [base]/[type]/[id]
    'patch-conditional': false,          // PATCH [base]/[type]?[search]
    delete: true,                        // DELETE [base]/[type]/[id]
    'delete-conditional-single': false, // DELETE [base]/[type]?[search]
    'delete-conditional-multiple': false,
    'delete-history': false,             // DELETE [base]/[type]/[id]/_history
    'delete-history-version': false,     // DELETE [base]/[type]/[id]/_history/[vid]
    'history-instance': true,            // GET [base]/[type]/[id]/_history
    
    // Type level operations
    'history-type': true,                // GET [base]/[type]/_history
    create: true,                        // POST [base]/[type]
    'create-conditional': false,         // POST with If-None-Exist
    'search-type': true                  // GET [base]/[type]
  }
});
```

## Hooks System

Flexible lifecycle hooks with priority-based execution:

```javascript
import { defineHook } from '@atomic-fhir/core';

// Global hook for all resources
export default defineHook({
  name: 'add-timestamps',
  type: 'beforeCreate',
  resources: '*',
  priority: 10,
  async handler(resource, context) {
    resource.meta = { lastUpdated: new Date().toISOString() };
    return resource;
  }
});

// Resource-specific hook
export default defineHook({
  name: 'patient-validation',
  type: 'beforeCreate',
  resources: 'Patient',
  async handler(resource, context) {
    // Custom validation
    return resource;
  }
});

// Multi-resource hook
export default defineHook({
  name: 'clinical-audit',
  type: 'afterCreate',
  resources: ['Observation', 'Condition', 'Procedure'],
  async handler(resource, context) {
    console.log(`Clinical resource created: ${resource.resourceType}/${resource.id}`);
  }
});
```

### Available Hook Types
- `beforeCreate` / `afterCreate`
- `beforeUpdate` / `afterUpdate`
- `beforeDelete` / `afterDelete`
- `beforeRead` / `afterRead`
- `beforeSearch` / `afterSearch`
- `beforeValidate` / `afterValidate`

## Custom Resource Handlers

Override any CRUD operation with custom business logic:

```javascript
export default defineResource({
  resourceType: 'Patient',
  
  handlers: {
    async create(req, context) {
      const { storage, hooks, validator, config } = context;
      const patient = await req.json();
      
      // Generate Medical Record Number
      const mrn = `MRN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      patient.identifier = patient.identifier || [];
      patient.identifier.push({
        system: 'http://hospital.example.org/mrn',
        value: mrn
      });
      
      const created = await storage.create('Patient', patient);
      
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `/Patient/${created.id}`
        },
        body: created  // Auto-converted to JSON
      };
    }
  }
});
```

## Metadata Endpoint with Profiles

The `/metadata` endpoint automatically reports supported profiles for each resource:

```json
{
  "resourceType": "CapabilityStatement",
  "rest": [{
    "resource": [{
      "type": "Patient",
      "supportedProfile": [
        "http://hl7.org/fhir/StructureDefinition/Patient",
        "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
      ],
      "interaction": [
        { "code": "read" },
        { "code": "vread" },
        { "code": "update" },
        { "code": "delete" },
        { "code": "history-instance" },
        { "code": "create" },
        { "code": "search-type" }
      ]
    }]
  }]
}
```

## Examples

The framework includes comprehensive examples demonstrating different features:

- **[01-basic-server](examples/01-basic-server)** - Minimal FHIR server setup
- **[02-with-hooks](examples/02-with-hooks)** - Custom business logic with hooks
- **[03-with-auth](examples/03-with-auth)** - Authentication and authorization
- **[04-custom-operations](examples/04-custom-operations)** - Implementing custom operations

Each example is fully documented and runnable:

```bash
cd examples/01-basic-server
bun server.js
```

## Documentation

Comprehensive documentation is available in the `/docs` directory:

- **[Getting Started](docs/getting-started.md)** - 15-minute tutorial to build your first server
- **[API Reference](docs/api-reference.md)** - Complete API documentation
- **[Hook System](docs/hook-system.md)** - In-depth guide to hooks
- **[Configuration](docs/configuration.md)** - All configuration options explained
- **[Examples README](examples/README.md)** - Guide to all examples

## Architecture

### Framework Structure

```
framework/
├── packages/
│   ├── server/                    # @atomic-ehr/server - HTTP server
│   ├── fhir-bridge/               # @atomic-ehr/fhir-bridge - FHIR integration
│   ├── validation-bridge/         # @atomic-ehr/validation-bridge - Validation
│   └── packages/                  # @atomic-ehr/packages - Package management
├── examples/                      # Example applications
│   ├── 01-basic-server/
│   ├── 02-with-hooks/
│   ├── 03-with-auth/
│   └── 04-custom-operations/
├── docs/                          # Documentation
│   ├── getting-started.md
│   ├── api-reference.md
│   ├── hook-system.md
│   └── configuration.md
└── README.md
```

### Request Flow

```
Request
  ↓
[preRequest hooks]          ← Auth, rate limiting
  ↓
Router (URL parsing)
  ↓
[preHandler hooks]          ← Validation, transformation
  ↓
Handler (CRUD operation)
  ↓
[onResponse hooks]          ← Audit, logging
  ↓
Response

If error occurs at any point:
  ↓
[onError hooks]             ← Error logging, custom responses
  ↓
Error Response
```

## Packages

The framework is split into focused packages:

### @atomic-ehr/server

The main server package providing the HTTP server and hook system.

**[Read the docs →](packages/server/README.md)**

### @atomic-ehr/fhir-bridge

Bridge package integrating FHIR canonical-manager and fhirschema.

**[Read the docs →](packages/fhir-bridge/README.md)**

### @atomic-ehr/validation-bridge

Validation integration using FHIRSchema.

**[Read the docs →](packages/validation-bridge/README.md)**

### @atomic-ehr/packages

Package loader and management for FHIR Implementation Guides.

**[Read the docs →](packages/packages/README.md)**

## Custom Operations

Implement custom FHIR operations using hooks:

```typescript
server.addHook({
  name: 'patient-summary',
  phase: 'preHandler',
  priority: 100,
  handler: async (context) => {
    const match = context.url.match(/^\/Patient\/([^/]+)\/\$summary/);
    if (match && context.method === 'GET') {
      const patientId = match[1];
      const storage = server.getStorage();
      const patient = await storage.read('Patient', patientId);

      context.setResponse({
        statusCode: 200,
        responseBody: {
          resourceType: 'Bundle',
          type: 'collection',
          entry: [{ resource: patient.resource }]
        }
      });

      context.takeOver();
    }
    return context;
  }
});
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type checking
cd packages/server
bun run typecheck

# Build
bun run build

# Run linter
bun run lint

# Format code
bun run format
```

## Production Deployment

### Environment Variables

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fhir
DB_USER=fhir_user
DB_PASSWORD=your_password
TLS_ENABLED=true
TLS_CERT=/path/to/cert.pem
TLS_KEY=/path/to/key.pem
```

### Docker

```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --production

COPY . .

EXPOSE 3000

CMD ["bun", "server.js"]
```

## Design Philosophy

The Atomic EHR Framework is built on these principles:

- **Hook-First Architecture** - Everything is extensible through hooks
- **FHIR-Native** - Built specifically for FHIR, not adapted from generic frameworks
- **Developer Experience** - Simple, intuitive APIs with excellent TypeScript support
- **Production Ready** - Built for real-world healthcare applications
- **Performance** - Leverages Bun for maximum speed

## Contributing

Contributions are welcome! See [CLAUDE.md](CLAUDE.md) for development guidelines.

## License

MIT © Atomic EHR Team

---

**Built with ❤️ for healthcare developers**