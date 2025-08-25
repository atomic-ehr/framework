# Atomic FHIR Framework

A FHIR-native web framework for JavaScript/Bun that treats FHIR resources as first-class citizens. Instead of adapting traditional MVC patterns, Atomic uses FHIR's own concepts: StructureDefinitions for models, OperationDefinitions for business logic, and CapabilityStatements for API contracts.

## Features

- 🏥 **FHIR-Native**: Built specifically for FHIR, not adapted from generic frameworks
- 🚀 **Bun Powered**: Leverages Bun's speed and built-in SQLite support
- 🔍 **Auto-Discovery**: Automatically finds and registers resources, operations, middleware, and hooks
- 🪝 **Flexible Hooks**: Separated lifecycle hooks with global, resource-specific, or multi-resource targeting
- 📋 **Resource-Centric**: Define resources with configuration and capabilities
- 🔧 **Operations**: First-class support for FHIR operations ($match, $everything, etc.)
- 🛡️ **Middleware**: Flexible middleware for auth, audit, consent
- 💾 **Storage Adapters**: SQLite by default, extensible to PostgreSQL, MongoDB
- 🏗️ **Implementation Guides**: Modular extension system via FHIR IGs
- ✅ **Validation**: StructureDefinition-based validation with custom rules

## Quick Start

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Clone the repository
git clone <repository-url>
cd fhir-framework

# Install dependencies
bun install

# Run basic example
cd examples/basic-server
bun install
bun run dev
```

## Quick Start - Zero Configuration

Atomic automatically discovers and loads components by default. Create a FHIR server with minimal configuration:

```javascript
// src/server.js
import { Atomic } from '@atomic/framework';

const app = new Atomic({
  server: {
    name: 'My FHIR Server',
    port: 3000
  }
  // Autoload is enabled by default and looks in src/ folders!
});
app.start();

// index.js (entry point in root)
import './src/server.js';
```

**Important:** Atomic now uses `src/` folders by default for all components:
- `src/resources/` - FHIR resource definitions
- `src/operations/` - Custom FHIR operations
- `src/middleware/` - Express-style middleware
- `src/hooks/` - Lifecycle hooks
- `src/implementation-guides/` - Custom IGs

Just place your components in these folders and they're automatically registered:

```javascript
// src/resources/Patient.js
import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient'
  // All capabilities (create, read, update, delete, search, history) enabled by default!
});
```

```javascript
// src/hooks/timestamps.js
import { defineHook } from '@atomic/framework';

export default defineHook({
  name: 'add-timestamps',
  type: 'beforeCreate',
  resources: '*',  // Apply to all resources
  async handler(resource) {
    resource.meta = { lastUpdated: new Date().toISOString() };
    return resource;
  }
});
```

```javascript
// src/operations/match.js
import { defineOperation } from '@atomic/framework';

export default defineOperation({
  name: 'match',
  resource: 'Patient',
  type: 'type',
  async handler(params, context) {
    // Automatically discovered and registered!
    return { resourceType: 'Bundle', entry: [] };
  }
});
```

```javascript
// src/middleware/audit.js
import { defineMiddleware } from '@atomic/framework';

export default defineMiddleware({
  name: 'audit',
  async before(req, context) {
    // Automatically discovered and applied!
    console.log(`${req.method} ${req.url}`);
  }
});
```

## Hooks System

Hooks provide lifecycle event handling separated from resource definitions:

### Global Hooks (Apply to All Resources)
```javascript
import { defineHook } from '@atomic/framework';

export default defineHook({
  name: 'global-validation',
  type: 'beforeCreate',
  resources: '*',  // Applies to all resources
  priority: 10,    // Higher priority executes first
  async handler(resource, context) {
    // Add validation logic
    return resource;
  }
});
```

### Resource-Specific Hooks
```javascript
export default defineHook({
  name: 'patient-mrn',
  type: 'beforeCreate',
  resources: 'Patient',  // Only for Patient resources
  async handler(resource, context) {
    // Add MRN if not present
    return resource;
  }
});
```

### Multi-Resource Hooks
```javascript
export default defineHook({
  name: 'clinical-audit',
  type: 'afterCreate',
  resources: ['Observation', 'Condition', 'Procedure'],
  async handler(resource, context) {
    // Audit clinical resources
    console.log(`Clinical resource created: ${resource.resourceType}/${resource.id}`);
  }
});
```

### Hook Types
- `beforeCreate` / `afterCreate`
- `beforeUpdate` / `afterUpdate`
- `beforeDelete` / `afterDelete`
- `beforeValidate` / `afterValidate`
- `beforeRead` / `afterRead`
- `beforeSearch` / `afterSearch`

## Configuration Options

### Disabling Auto-Discovery

If you prefer manual registration:

```javascript
import { Atomic, defineResource, defineOperation } from '@atomic/framework';

const app = new Atomic({
  server: { name: 'My FHIR Server' },
  autoload: false,  // Disable auto-discovery
  packages: false   // Disable package loading
});

// Manually register components
app.registerResource('Patient', PatientResource);
app.registerOperation(matchOperation);
app.use(auditMiddleware);

app.start(3000);
```

### Custom Paths

Customize where components are loaded from:

```javascript
const app = new Atomic({
  autoload: {
    paths: {
      resources: 'src/resources',
      operations: 'src/operations',
      middleware: 'src/middleware',
      hooks: 'src/hooks'  // Custom hooks path
    }
  },
  packages: {
    path: 'fhir-packages'
  }
});
```

## Project Structure

Atomic follows a convention-over-configuration approach with organized source code:

```text
my-fhir-server/
├── server.js              # Main server configuration
├── src/                   # Source code directory
│   ├── resources/        # FHIR resource definitions
│   │   ├── Patient.js
│   │   └── Observation.js
│   ├── operations/       # FHIR operations ($match, $validate, etc.)
│   │   ├── match.js
│   │   └── export.js
│   ├── middleware/       # HTTP middleware (auth, cors, logging)
│   │   ├── auth.js
│   │   └── audit.js
│   └── hooks/            # Lifecycle hooks (validation, timestamps)
│       ├── timestamps.js
│       ├── validation.js
│       └── audit.js
├── tests/                # Test files
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── e2e/            # End-to-end tests
├── packages/             # FHIR IG packages
│   ├── us-core/
│   └── my-profiles.tgz
└── package.json          # Dependencies and scripts
```

## Examples

### Minimal Server
The simplest possible FHIR server using auto-discovery - just 5 lines of code!

```bash
cd examples/minimal-server
bun run dev
```

### Basic Server
A simple FHIR server with Patient and Observation resources, patient matching, and audit logging.

```bash
cd examples/basic-server
bun run dev
```

### US Core Server
A US Core Implementation Guide compliant server with:
- US Core profiled resources
- SMART on FHIR authentication
- Consent-based access control
- Bulk data export
- Patient $everything operation

```bash
cd examples/us-core-server
bun run dev
```

## Core Concepts

### Auto-Discovery Convention (Default)
By default, Atomic automatically discovers components from the `src/` directory:

```
my-fhir-server/
├── index.js               # Entry point (imports ./src/server.js)
├── src/                   # All source code in src/
│   ├── server.js          # Main server configuration
│   ├── resources/         # Auto-loaded resources
│   │   ├── Patient.js     # export default defineResource()
│   │   └── Observation.js   
│   ├── operations/        # Auto-loaded operations
│   │   ├── match.js       # export default defineOperation()
│   │   └── export.js        
│   ├── middleware/        # Auto-loaded middleware
│   │   ├── auth.js        # export default defineMiddleware()
│   │   └── audit.js         
│   └── hooks/             # Auto-loaded hooks
│       ├── timestamps.js  # export default defineHook()
│       └── validation.js
└── packages/              # Auto-loaded FHIR IG packages
    ├── us.core/           # Unpacked package
    └── ips.tgz            # Compressed package
```

### Configuration

The framework uses sensible defaults that work for most cases:

```javascript
// Default configuration (you don't need to specify this)
const app = new Atomic({
  server: {
    port: 3000,
    name: 'Atomic FHIR Server'
  },
  autoload: {
    enabled: true,  // Enabled by default
    paths: {
      resources: 'src/resources',
      operations: 'src/operations', 
      middleware: 'src/middleware',
      hooks: 'src/hooks',
      implementationGuides: 'src/implementation-guides'
    }
  },
  packages: {
    enabled: true,  // Enabled by default
    path: 'packages'
  }
});

// Disable autoload for manual registration
const app = new Atomic({
  autoload: false
});

// Custom paths
const app = new Atomic({
  autoload: {
    paths: {
      resources: 'custom/resources'
      // Other paths remain default
    }
  }
});
```

### Resources

Resources are defined with all CRUD capabilities enabled by default:

```javascript
// src/resources/Patient.js
export default defineResource({
  resourceType: 'Patient',
  
  // All capabilities (create, read, update, delete, search, history) enabled by default!
  // Override specific capabilities if needed:
  // capabilities: { delete: false },
  
  // Custom search parameters
  searches: {
    'mrn': { type: 'token', path: 'identifier' }
  }
});
```

### Operations
FHIR operations are first-class citizens:

```javascript
// operations/match.js
export default defineOperation({
  name: 'match',
  resource: 'Patient', // or null for system-level
  type: 'type', // 'type' | 'instance' | 'system'
  parameters: {
    input: [...],
    output: [...]
  },
  async handler(params, context) {
    // Implementation
  }
});
```

### Middleware
Cross-cutting concerns are handled through middleware:

```javascript
// middleware/audit.js
export default defineMiddleware({
  name: 'audit',
  scope: {
    resources: ['Patient', 'Observation'],
    operations: ['read', 'create']
  },
  async before(req, context) {},
  async after(response, context) {}
});
```

### Storage Adapters
Pluggable storage layer with SQLite by default:

```javascript
class CustomAdapter extends StorageAdapter {
  async create(resourceType, resource) {}
  async read(resourceType, id) {}
  async update(resourceType, id, resource) {}
  async delete(resourceType, id) {}
  async search(resourceType, params) {}
}
```

## CLI Tool

```bash
# Create new project
bun cli.js new my-fhir-server

# Generate resources
bun cli.js generate resource Patient
bun cli.js generate resource Observation

# Generate operations
bun cli.js generate operation Patient/$match
bun cli.js generate operation $export
```

## Roadmap

- [x] Core framework structure
- [x] Resource definition system
- [x] Operation handling
- [x] Middleware system
- [x] SQLite storage adapter
- [x] Basic validation
- [x] CLI tool
- [x] Example applications
- [ ] PostgreSQL adapter
- [ ] MongoDB adapter
- [ ] Subscription support
- [ ] GraphQL interface
- [ ] Full StructureDefinition validation
- [ ] Implementation Guide loader
- [ ] Cloud deployment tools

## Design Philosophy

Atomic represents a paradigm shift in FHIR application development:

- **Models → StructureDefinitions**: Use FHIR's native schema system
- **Controllers → OperationDefinitions**: Business logic as FHIR operations
- **Routes → CapabilityStatements**: API contracts using FHIR's own format
- **Plugins → Implementation Guides**: Extensions through standard FHIR IGs

This approach ensures that your FHIR server is not just compliant, but natively speaks the language of healthcare interoperability.

## Contributing

Contributions are welcome! Please read the [Design Document](DESIGN.md) to understand the architecture and design decisions.

## License

MIT