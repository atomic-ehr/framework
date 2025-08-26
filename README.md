# Atomic FHIR Framework

A FHIR-native web framework for JavaScript/Bun that treats FHIR resources as first-class citizens. Instead of adapting traditional MVC patterns, Atomic uses FHIR's own concepts: StructureDefinitions for models, OperationDefinitions for business logic, and CapabilityStatements for API contracts.

## Features

- 🏥 **FHIR-Native**: Built specifically for FHIR, not adapted from generic frameworks
- 🚀 **Bun Powered**: Leverages Bun's speed and built-in SQLite support
- 🔍 **Auto-Discovery**: Automatically finds and registers resources, operations, middleware, and hooks
- 🪝 **Flexible Hooks**: Separated lifecycle hooks with global, resource-specific, or multi-resource targeting
- 📋 **Resource-Centric**: Define resources with configuration and capabilities
- 🎯 **Custom Handlers**: Override any CRUD operation with custom business logic
- 📦 **Package Management**: Auto-download FHIR packages from official registry (NEW!)
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

## Package Management (NEW!)

The framework can automatically download and load FHIR Implementation Guide packages from official registries. Package management is **enabled by default** - just specify which packages you want.

### Quick Start

```javascript
const app = new Atomic({
  packages: {
    list: [
      'hl7.fhir.r4.core@4.0.1',     // FHIR R4 Core
      'hl7.fhir.us.core@5.0.1',     // US Core  
      'hl7.fhir.uv.ips@1.0.0'       // International Patient Summary
    ]
    // enabled: true by default
    // path: 'packages' by default
    // defaultRegistry: 'https://get-ig.org' by default
  }
});
```

### Key Features

- **🚀 Automatic Download**: Packages are downloaded on first server start
- **📌 Version Control**: Specify exact versions for reproducibility
- **🌐 Official Registry**: Uses the FHIR package registry at get-ig.org
- **💾 Local Cache**: Downloaded packages are cached in `packages/` directory
- **✨ Zero Setup**: No manual download or configuration required
- **🔄 Smart Caching**: Only downloads if not already present
- **🎯 Auto-Registration**: Base resources from packages are automatically registered (NEW!)

### Auto-Registration of Resources (NEW!)

When you load packages like `hl7.fhir.r4.core`, Atomic automatically:
1. Identifies all base resource definitions (Patient, Observation, etc.)
2. Registers them as fully-functional resources with all CRUD operations
3. Configures their search parameters from the package
4. Makes them immediately available via REST API

This means with just one package, your server instantly supports all FHIR resources:

```javascript
// This single configuration gives you ALL 140+ R4 resources!
const app = new Atomic({
  packages: {
    list: ['hl7.fhir.r4.core@4.0.1']
  }
});

// Now you can immediately use:
// GET/POST /Patient
// GET/POST /Observation
// GET/POST /Encounter
// ... and all other R4 resources!
```

### What's Included in Packages

Each FHIR package can contain:
- **StructureDefinitions**: Resource and data type profiles for validation
- **ValueSets**: Coded value sets for terminology binding
- **CodeSystems**: Code system definitions
- **SearchParameters**: Custom search parameter definitions
- **OperationDefinitions**: Custom operation definitions
- **ConceptMaps**: Mappings between code systems
- **NamingSystem**: Identifier system definitions

### Common Use Cases

```javascript
// Basic FHIR server with R4 Core
packages: {
  list: ['hl7.fhir.r4.core@4.0.1']
}

// US-based healthcare application
packages: {
  list: [
    'hl7.fhir.r4.core@4.0.1',
    'hl7.fhir.us.core@5.0.1',
    'hl7.fhir.us.davinci-deqm@3.0.0'
  ]
}

// International Patient Summary
packages: {
  list: [
    'hl7.fhir.r4.core@4.0.1',
    'hl7.fhir.uv.ips@1.0.0'
  ]
}
```

### How It Works

1. **Server Start**: Framework checks if packages need downloading
2. **Registry Query**: Fetches package metadata from registry
3. **Download**: Downloads `.tgz` files to `packages/` directory
4. **Loading**: Extracts and indexes all FHIR resources
5. **Validation**: Makes profiles available for resource validation

### Manual Package Management

If you prefer manual control:

```bash
# Download manually using npm
npm install --registry https://fs.get-ig.org/pkgs hl7.fhir.r4.core

# Move to packages directory
mv node_modules/hl7.fhir.r4.core/*.tgz packages/

# Or download from packages.fhir.org
curl -o packages/hl7.fhir.r4.core.tgz \
  https://packages.fhir.org/hl7.fhir.r4.core/4.0.1
```

### Troubleshooting

**Package download fails?**
- Check internet connectivity
- Verify package name and version
- Check if registry is accessible: https://get-ig.org
- Try manual download as fallback

**Package not loading?**
- Check `packages/` directory for `.tgz` files
- Verify file isn't corrupted
- Check console logs for errors
- Ensure package contains valid FHIR resources

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

### Custom Handlers Server
Demonstrates custom resource handlers with business logic, auto-generated identifiers, and complex validation rules.

```bash
cd examples/custom-handlers-server
bun run dev
```

Features:
- Patient resource with auto-generated MRN
- Observation with automatic vital sign interpretation
- Encounter with business rule enforcement
- Custom search with aggregation statistics

### R4 Core Server (NEW!)
FHIR R4 Core server with automatic package download from registry.

```bash
cd examples/r4-core-server
bun run dev
```

Features:
- Automatic download of `hl7.fhir.r4.core` package
- Full R4 Core validation
- No manual package setup required
- Uses official FHIR package registry

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

### Custom Resource Handlers (NEW!)

Override any CRUD operation with custom business logic:

```javascript
// src/resources/Patient.js
export default defineResource({
  resourceType: 'Patient',
  
  handlers: {
    // Custom create with MRN generation
    async create(req, context) {
      const { storage, hooks, config } = context;
      const patient = await req.json();
      
      // Generate Medical Record Number
      const mrn = `MRN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      patient.identifier = patient.identifier || [];
      patient.identifier.push({
        system: 'http://hospital.example.org/mrn',
        value: mrn,
        use: 'official'
      });
      
      // Store and return
      const created = await storage.create('Patient', patient);
      
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${config.server.url}/Patient/${created.id}`
        },
        body: created  // Auto-converted to JSON
      };
    },
    
    // Also available: read, update, delete, search
  }
});
```

Custom handlers are perfect for:
- Enforcing business rules
- Integrating with external systems
- Auto-generating identifiers
- Custom validation logic
- Performance optimizations

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