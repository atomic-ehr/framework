# Atomic FHIR Framework

A FHIR-native web framework for JavaScript/Bun that treats FHIR resources as first-class citizens. Instead of adapting traditional MVC patterns, Atomic uses FHIR's own concepts: StructureDefinitions for models, OperationDefinitions for business logic, and CapabilityStatements for API contracts.

## Features

- 🏥 **FHIR-Native**: Built specifically for FHIR, not adapted from generic frameworks
- 🚀 **Bun Powered**: Leverages Bun's speed and built-in SQLite support
- 🔍 **Auto-Discovery**: Automatically finds and registers resources, operations, and middleware
- 📋 **Resource-Centric**: Define resources with lifecycle hooks and validators
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

With Atomic's auto-discovery, you can create a FHIR server with just a few lines:

```javascript
// server.js
import { Atomic } from '@atomic/framework';

const app = new Atomic({
  server: { name: 'My FHIR Server' }
});

app.start(3000);  // That's it!
```

Then just create your components in the conventional folders:

```javascript
// resources/Patient.js
import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient',
  hooks: {
    beforeCreate: async (resource) => {
      // Automatically discovered and registered!
      return resource;
    }
  }
});
```

```javascript
// operations/match.js
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
// middleware/audit.js
import { defineMiddleware } from '@atomic/framework';

export default defineMiddleware({
  name: 'audit',
  async before(req, context) {
    // Automatically discovered and applied!
    console.log(`${req.method} ${req.url}`);
  }
});
```

## Manual Configuration (Optional)

If you prefer explicit registration or need more control:

```javascript
import { Atomic, defineResource, defineOperation } from '@atomic/framework';

const app = new Atomic({
  server: { name: 'My FHIR Server' },
  autoload: { enabled: false }  // Disable auto-discovery
});

// Manually register components
app.registerResource('Patient', PatientResource);
app.registerOperation(matchOperation);
app.use(auditMiddleware);

app.start(3000);
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

### Auto-Discovery Convention
Atomic automatically discovers and registers components based on folder structure:

```
my-fhir-server/
├── server.js              # Main server file
├── resources/            # Auto-discovered resources
│   ├── Patient.js       # Exports defineResource()
│   └── Observation.js   
├── operations/           # Auto-discovered operations
│   ├── match.js         # Exports defineOperation()
│   └── export.js        
└── middleware/           # Auto-discovered middleware
    ├── auth.js          # Exports defineMiddleware()
    └── audit.js         
```

### Resources
Resources are defined using FHIR StructureDefinitions with lifecycle hooks:

```javascript
// resources/Patient.js
export default defineResource({
  resourceType: 'Patient',
  hooks: {
    beforeCreate: async (resource, context) => {},
    afterCreate: async (resource, context) => {},
    beforeUpdate: async (resource, previous, context) => {},
    afterUpdate: async (resource, previous, context) => {},
    beforeDelete: async (resource, context) => {},
    afterDelete: async (resource, context) => {}
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