# Atomic FHIR Framework

A FHIR-native web framework for JavaScript/Bun that treats FHIR resources as first-class citizens. Instead of adapting traditional MVC patterns, Atomic uses FHIR's own concepts: StructureDefinitions for models, OperationDefinitions for business logic, and CapabilityStatements for API contracts.

## 🚀 Features

- 🏥 **FHIR-Native**: Built specifically for FHIR, not adapted from generic frameworks
- ⚡ **Bun Powered**: Leverages Bun's speed and built-in SQLite support
- 📦 **Monorepo Architecture**: Modular packages with `@atomic-fhir/core`
- 🔍 **Auto-Discovery**: Automatically finds and registers resources, operations, and hooks
- 🪝 **Flexible Hooks**: Lifecycle hooks with global, resource-specific, or multi-resource targeting
- 📋 **Full FHIR Capabilities**: Support for all FHIR interaction types (read, vread, update, patch, delete, history, search, etc.)
- 🎯 **Custom Handlers**: Override any CRUD operation with custom business logic
- 📚 **Package Management**: Auto-download and load FHIR IG packages from official registries
- 🔧 **Operations**: First-class support for FHIR operations ($match, $everything, etc.)
- 💾 **Storage Adapters**: SQLite by default, extensible to PostgreSQL, MongoDB
- ✨ **TypeScript Support**: Full TypeScript definitions for excellent IDE experience
- 🏗️ **Auto-Registration**: Automatically registers base resources from loaded packages
- 📊 **Supported Profiles**: Metadata endpoint reports all supported profiles per resource

## Quick Start

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Clone the repository
git clone <repository-url>
cd fhir-framework

# Install dependencies
bun install

# Run an example server
cd examples/minimal-server
bun run dev
```

## Installation (NPM Package)

```bash
bun add @atomic-fhir/core
# or
npm install @atomic-fhir/core
```

## Quick Start - Zero Configuration

```javascript
// src/server.js
import { Atomic } from '@atomic-fhir/core';

const app = new Atomic({
  server: {
    name: 'My FHIR Server',
    port: 3000
  }
  // Autoload is enabled by default!
});

await app.start();
```

Atomic automatically discovers components from `src/` folders:
- `src/resources/` - FHIR resource definitions
- `src/operations/` - Custom FHIR operations
- `src/middleware/` - Express-style middleware
- `src/hooks/` - Lifecycle hooks

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import { 
  Atomic, 
  defineResource,
  type AtomicConfig,
  type ResourceDefinition,
  type HandlerContext 
} from '@atomic-fhir/core';

const config: AtomicConfig = {
  server: {
    name: 'TypeScript FHIR Server',
    port: 3000,
    fhirVersion: '4.0.1'
  },
  packages: [
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    }
  ]
};

const patientResource: ResourceDefinition = defineResource({
  resourceType: 'Patient',
  capabilities: {
    read: true,
    vread: true,
    update: true,
    'update-conditional': true,
    patch: true,
    'search-type': true
  },
  handlers: {
    async create(req, context: HandlerContext) {
      // Full type safety and IntelliSense
      const patient = await req.json();
      return {
        status: 201,
        body: patient
      };
    }
  }
});
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

## Project Structure

### Framework Structure (Monorepo)
```
fhir-framework/
├── packages/
│   └── core/                    # @atomic-fhir/core package
│       ├── src/
│       │   ├── index.js         # Main exports
│       │   ├── index.d.ts       # TypeScript definitions
│       │   ├── core/            # Framework core
│       │   └── storage/         # Storage adapters
│       └── package.json
├── examples/                    # Example servers
│   ├── minimal-server/
│   ├── r4-core-server/
│   ├── typescript-test/
│   └── ...
└── package.json                 # Root with workspaces
```

### User Project Structure
```
my-fhir-server/
├── src/
│   ├── server.js               # Server configuration
│   ├── resources/              # FHIR resources
│   │   └── Patient.js
│   ├── operations/             # FHIR operations
│   │   └── match.js
│   ├── hooks/                  # Lifecycle hooks
│   │   └── timestamps.js
│   └── middleware/             # HTTP middleware
│       └── auth.js
├── packages/                   # FHIR IG packages (.tgz files)
└── package.json
```

## Examples

### Minimal Server (3 lines!)
```bash
cd examples/minimal-server
bun run dev
```

### R4 Core Server
Full FHIR R4 server with all 147 resources:
```bash
cd examples/r4-core-server
bun run dev
```

### TypeScript Example
Full TypeScript support with type safety:
```bash
cd examples/typescript-test
bun run dev
```

### Custom Handlers Server
Advanced business logic and custom handlers:
```bash
cd examples/custom-handlers-server
bun run dev
```

## Operations

Define FHIR operations with full parameter support:

```javascript
export default defineOperation({
  name: 'match',
  resource: 'Patient',
  type: true,
  instance: false,
  parameters: {
    input: [
      {
        name: 'resource',
        min: 1,
        max: '1',
        type: 'Patient'
      }
    ],
    output: [
      {
        name: 'return',
        min: 1,
        max: '1',
        type: 'Bundle'
      }
    ]
  },
  async handler(params, context) {
    // Implementation
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: []
    };
  }
});
```

## Storage Adapters

Pluggable storage with SQLite default:

```javascript
const app = new Atomic({
  storage: {
    adapter: 'sqlite',  // or 'postgresql', 'mongodb'
    config: {
      database: './fhir.db'
    }
  }
});
```

## CLI Tool

```bash
# Create new project
bun cli.js new my-fhir-server

# Generate resources
bun cli.js generate resource Patient

# Generate operations
bun cli.js generate operation match
```

## Configuration Options

```javascript
const app = new Atomic({
  server: {
    name: 'My FHIR Server',
    port: 3000,
    fhirVersion: '4.0.1'
  },
  
  // Package management
  packages: [
    { package: 'hl7.fhir.r4.core', version: '4.0.1', npmRegistry: 'https://get-ig.org' }
  ],
  
  // Auto-discovery (enabled by default)
  autoload: {
    enabled: true,
    paths: {
      resources: 'src/resources',
      operations: 'src/operations',
      hooks: 'src/hooks',
      middleware: 'src/middleware'
    }
  },
  
  // Storage configuration
  storage: {
    adapter: 'sqlite',
    config: {
      database: ':memory:'
    }
  },
  
  // Validation
  validation: {
    strict: true
  }
});
```

## Design Philosophy

Atomic represents a paradigm shift in FHIR application development:

- **Models → StructureDefinitions**: Use FHIR's native schema system
- **Controllers → OperationDefinitions**: Business logic as FHIR operations
- **Routes → CapabilityStatements**: API contracts using FHIR's own format
- **Plugins → Implementation Guides**: Extensions through standard FHIR IGs

This approach ensures your FHIR server is not just compliant, but natively speaks the language of healthcare interoperability.

## Contributing

Contributions are welcome! Please see [CLAUDE.md](CLAUDE.md) for development guidelines.

## License

MIT