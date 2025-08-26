# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Atomic is a FHIR-native web framework for JavaScript/Bun that treats FHIR resources as first-class citizens. Instead of adapting traditional MVC patterns, it uses FHIR's own concepts: StructureDefinitions for models, OperationDefinitions for business logic, and CapabilityStatements for API contracts.

## Project Structure

### Framework Structure
```
fhir-framework/
├── src/
│   ├── core/                  # Core framework components
│   │   ├── atomic.js          # Main framework class
│   │   ├── router.js          # HTTP routing
│   │   ├── resource-registry.js
│   │   ├── operation-registry.js
│   │   ├── middleware-manager.js
│   │   ├── hooks-manager.js   # Hooks system
│   │   ├── filesystem-loader.js  # Auto-discovery
│   │   ├── package-manager.js    # FHIR IG packages
│   │   └── validator.js
│   └── storage/               # Storage adapters
│       ├── storage-manager.js
│       └── sqlite-adapter.js
├── examples/                  # Example servers
│   ├── minimal-server/        # 3-line server
│   ├── basic-server/          # Basic CRUD
│   ├── custom-handlers-server/ # Custom resource handlers
│   ├── r4-core-server/        # Auto-download R4 Core package (NEW!)
│   ├── us-core-server/        # US Core IG
│   ├── package-aware-server/  # Using packages
│   └── manual-server/         # Without autoload
├── docs/                      # Documentation
├── tests/                     # Test suite
└── cli.js                     # CLI tool
```

### User Project Structure (IMPORTANT)

When creating a new Atomic FHIR server, use this structure:

```
my-fhir-server/
├── index.js                   # Entry point (imports ./src/server.js)
├── src/                       # All source code goes in src/
│   ├── server.js              # Server configuration
│   ├── resources/             # FHIR resource definitions
│   │   ├── Patient.js
│   │   └── Observation.js
│   ├── operations/            # Custom FHIR operations
│   │   ├── match.js           # $match operation
│   │   └── everything.js      # $everything operation
│   ├── middleware/            # Express-style middleware
│   │   ├── auth.js
│   │   └── audit.js
│   ├── hooks/                 # Lifecycle hooks
│   │   ├── timestamps.js      # Add timestamps to all resources
│   │   └── validation.js      # Custom validation
│   └── implementation-guides/ # Custom IGs (optional)
├── packages/                  # FHIR IG packages (NPM tarballs)
│   └── hl7.fhir.us.core.tgz
├── tests/                     # Test files
├── package.json
└── README.md
```

**Key Points:**
- All application code MUST go in the `src/` directory
- The `index.js` file in root is just an entry point that imports `./src/server.js`
- Autoload automatically discovers components from `src/` subfolders
- Packages go in root-level `packages/` directory

## Development Commands

```bash
# Run tests
bun test

# Run linter
bun run lint

# Run prettier
bun run format

# Create new project
bun run cli.js new <project-name>

# Generate components
bun run cli.js generate resource <ResourceType>
bun run cli.js generate operation <operation-name>
```

## Key Highlights:

### 1. Auto-Discovery by Default (IMPORTANT)

**⚠️ CRITICAL: Autoload now uses `src/` folders by default!**

Atomic automatically discovers and loads components from the `src/` directory:
- Resources from `./src/resources/`
- Operations from `./src/operations/`
- Middleware from `./src/middleware/`
- Hooks from `./src/hooks/`
- Implementation Guides from `./src/implementation-guides/`
- FHIR IG packages from `./packages/` (root level)

**Default Configuration (as of latest update):**
```javascript
// This is the DEFAULT - no need to specify unless overriding
autoload: {
  enabled: true,  // Enabled by default
  paths: {
    resources: 'src/resources',
    operations: 'src/operations',
    middleware: 'src/middleware',
    hooks: 'src/hooks',
    implementationGuides: 'src/implementation-guides'
  }
}
```

**Example Usage:**
```javascript
// Minimal configuration - uses all defaults
const app = new Atomic({
  server: {
    name: 'My FHIR Server',
    port: 3000
  }
  // Autoload is enabled and uses src/ folders automatically!
});

// To disable autoload
const app = new Atomic({
  autoload: false  // Completely disable autoload
});

// To customize paths
const app = new Atomic({
  autoload: {
    paths: {
      resources: 'custom/resources',  // Override specific paths
      // Other paths still use defaults
    }
  }
});
```

No configuration needed - just place files in the src/ folders!

### 2. FHIR-Native Design Philosophy

The framework maps traditional web framework concepts to FHIR:
- Models → StructureDefinition (resource schemas)
- Controllers → OperationDefinition (business logic)
- Routes → CapabilityStatement (API surface)
- Plugins → Implementation Guides (modular extensions)

**Resource Capabilities:** All CRUD operations (create, read, update, delete, search, history) are enabled by default for all resources. You can override specific capabilities if needed.

### 3. Core Features

- Resource-centric architecture with lifecycle hooks
- Operation definitions for custom business logic
- Middleware system for cross-cutting concerns (auth, audit, consent)
- FHIR IG Package Manager for loading standard packages
- Built-in FHIR validation using StructureDefinitions
- Multiple storage adapters (SQLite default, PostgreSQL, etc.)

### 4. Developer Experience

- Zero configuration - autoload enabled by default
- Convention over configuration approach
- Comprehensive CLI tool for scaffolding and management
- Familiar patterns from popular frameworks
- TypeScript-first with Bun runtime optimization

### 5. Enterprise Features

  - Subscription support
  - Bulk Data operations
  - SMART on FHIR integration
  - GraphQL interface (optional)
  - Horizontal scaling capabilities

## Framework Architecture Patterns

### Request Pipeline

Atomic follows the standard modern framework request pipeline:

```text
Request → Middleware Stack → Router → Handler → Storage → Response
         ↓                    ↓         ↓         ↓
    Auth/CORS/Log      Route Match  Resource   SQLite
                                    Operation   PostgreSQL
                                        ↓
                                    Hooks Pipeline
                                   (before/after)
```

### Core Patterns Implementation

#### 1. **Middleware Pattern**
- **Location**: `src/core/middleware-manager.js`
- **Pattern**: Chain of Responsibility with before/after phases
- **Usage**: Authentication, audit logging, CORS, consent checking
```javascript
defineMiddleware({
  name: 'audit',
  async before(req) { /* log request */ },
  async after(res) { /* log response */ }
})
```

#### 2. **Router Pattern**
- **Location**: `src/core/router.js`
- **Pattern**: Pattern matching with parameter extraction
- **Features**: RESTful routes, FHIR operations ($match, $validate)
```javascript
// Automatically handles:
GET    /:resourceType        → search
POST   /:resourceType        → create
GET    /:resourceType/:id    → read
PUT    /:resourceType/:id    → update
DELETE /:resourceType/:id    → delete
POST   /:resourceType/$op    → custom operations
```

#### 3. **Resource Definition**

Resources are defined with all capabilities enabled by default:

```javascript
// All CRUD operations enabled by default
export default defineResource({
  resourceType: 'Patient'
});

// Disable specific capabilities
export default defineResource({
  resourceType: 'ReadOnlyResource',
  capabilities: {
    create: false,
    update: false,
    delete: false
    // read, search, history remain true
  }
});

// Custom handlers for complete control (NEW!)
export default defineResource({
  resourceType: 'Patient',
  handlers: {
    // Override any CRUD operation with custom logic
    async create(req, context) {
      const { storage, hooks, validator, config } = context;
      const patient = await req.json();
      
      // Custom business logic here
      // - Generate identifiers
      // - Apply business rules
      // - Integrate with external systems
      
      return {
        status: 201,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: created  // JS objects are auto-converted to JSON
      };
    },
    
    async read(id, req, context) { /* custom read */ },
    async update(id, req, context) { /* custom update */ },
    async delete(id, req, context) { /* custom delete */ },
    async search(req, context) { /* custom search */ }
  }
});
```

#### 4. **Hooks/Lifecycle Events**

- **Location**: `hooks/` directory (separated from resources)
- **Pattern**: Lifecycle callbacks with flexible mounting
- **Features**:
  - Global hooks (apply to all resources)
  - Resource-specific hooks
  - Priority-based execution order
  - Error handling options

- **Available Hooks**:
  - `beforeCreate` / `afterCreate`
  - `beforeUpdate` / `afterUpdate`
  - `beforeDelete` / `afterDelete`
  - `beforeValidate` / `afterValidate`
  - `beforeRead` / `afterRead`
  - `beforeSearch` / `afterSearch`

```javascript
// hooks/timestamps.js
import { defineHook } from '@atomic/framework';

export default defineHook({
  name: 'add-timestamps',
  type: 'beforeCreate',
  resources: '*',  // Apply to all resources
  priority: 10,    // Higher priority executes first
  async handler(resource, context) {
    resource.meta = resource.meta || {};
    resource.meta.lastUpdated = new Date().toISOString();
    return resource;
  }
});

// Resource-specific hook
export default defineHook({
  name: 'patient-mrn',
  type: 'beforeCreate',
  resources: 'Patient',  // Only for Patient resources
  async handler(resource, context) {
    // Add MRN logic
    return resource;
  }
});

// Multiple resources
export default defineHook({
  name: 'clinical-validation',
  type: 'beforeCreate',
  resources: ['Observation', 'Condition', 'Procedure'],
  async handler(resource, context) {
    // Validate clinical resources
    return resource;
  }
});
```

#### 4. **Storage/ORM Pattern**
- **Location**: `src/storage/`
- **Pattern**: Adapter pattern with pluggable backends
- **Default**: SQLite with JSON support
- **Operations**: CRUD + search with FHIR query parameters

#### 5. **Auto-Discovery Pattern**
- **Location**: `src/core/filesystem-loader.js`
- **Pattern**: Convention over configuration
- **Conventions**:
  - `resources/*.js` → Resource definitions
  - `operations/*.js` → Operation handlers
  - `middleware/*.js` → Middleware functions
  - `hooks/*.js` → Lifecycle hooks
  - `packages/` → FHIR IG packages

### Configuration

Server configuration follows a hierarchical pattern with source code organized in `src/`:

```javascript
const app = new Atomic({
  server: {
    name: 'My FHIR Server',
    port: 3000,              // Port now in config, not start()
    url: 'http://localhost:3000',
    fhirVersion: '4.0.1'
  },
  storage: {
    adapter: 'sqlite',       // or 'postgresql', 'mongodb'
    config: { /* adapter specific */ }
  },
  validation: {
    strict: true,            // Enforce FHIR validation
    profiles: []             // Additional profiles
  },
  autoload: {
    enabled: true,           // Default true
    paths: {
      resources: 'src/resources',
      operations: 'src/operations',
      middleware: 'src/middleware',
      hooks: 'src/hooks'
    }
  },
  packages: {
    enabled: true,           // Default true
    path: 'packages',        // Where packages are stored
    list: [                  // Packages to auto-download (NEW!)
      'hl7.fhir.r4.core@4.0.1',
      'hl7.fhir.us.core@5.0.1'
    ],
    defaultRegistry: 'https://get-ig.org'  // Package registry
  }
});
```

### FHIR-Specific Adaptations

Traditional framework concepts mapped to FHIR:

| Traditional | Atomic/FHIR | Purpose |
|------------|-------------|---------|
| Model | StructureDefinition | Resource schemas |
| Controller | OperationDefinition | Business logic |
| Route | CapabilityStatement | API surface |
| Plugin | Implementation Guide | Modular extensions |
| Migration | Profiles | Schema evolution |
| Validation | FHIRPath | Business rules |

## Testing Strategy

```bash
# Unit tests for components
bun test src/core/*.test.js

# Integration tests for examples
bun test examples/*/tests/*.test.js

# E2E tests with actual HTTP requests
bun test tests/e2e/*.test.js
```

## Performance Considerations

1. **Bun Runtime**: Native SQLite, fast startup, built-in TypeScript
2. **JSON Operations**: Direct JSON storage in SQLite
3. **Lazy Loading**: Packages loaded on-demand
4. **Connection Pooling**: Built into storage adapters
5. **Caching**: Resource and operation definition caching

## Security Best Practices

1. **SMART on FHIR**: OAuth2/OIDC integration
2. **Consent Management**: Resource-level access control
3. **Audit Logging**: FHIR AuditEvent resources
4. **Input Validation**: StructureDefinition-based
5. **Rate Limiting**: Middleware-based throttling

## Custom Resource Handlers (NEW!)

### Overview

Custom handlers allow complete control over CRUD operations for any resource type. Instead of using the default storage-based implementation, you can implement business logic, integrate with external systems, or enforce complex rules.

### Handler Signature

Each handler receives:
- **Request parameters**: The incoming request (and ID for read/update/delete)
- **Context object**: Access to framework components

**Note**: The `body` field in the response can be a JavaScript object - it will be automatically converted to JSON.

```javascript
export default defineResource({
  resourceType: 'Patient',
  handlers: {
    // Create handler
    async create(req, context) {
      const { storage, hooks, validator, config } = context;
      // Return { status, headers?, body }
      // body can be JS object or string
    },
    
    // Read handler
    async read(id, req, context) {
      // Return { status, headers?, body }
    },
    
    // Update handler  
    async update(id, req, context) {
      // Return { status, headers?, body }
    },
    
    // Delete handler
    async delete(id, req, context) {
      // Return { status, headers?, body }
    },
    
    // Search handler
    async search(req, context) {
      // Return { status, headers?, body }
    }
  }
});
```

### Use Cases

1. **Business Rule Enforcement**
   - Validate complex business logic
   - Prevent invalid state transitions
   - Enforce organizational policies

2. **Data Enrichment**
   - Auto-generate identifiers (MRN, encounter IDs)
   - Calculate derived values
   - Add metadata and audit information

3. **External System Integration**
   - Call legacy APIs
   - Synchronize with external databases
   - Transform data formats

4. **Performance Optimization**
   - Implement custom caching
   - Aggregate data for analytics
   - Optimize search queries

### Example: Patient with MRN Generation

```javascript
export default defineResource({
  resourceType: 'Patient',
  handlers: {
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
      
      // Still use hooks if desired
      const processed = await hooks.executeBeforeCreate('Patient', patient, { req, storage });
      
      // Store using standard storage
      const created = await storage.create('Patient', processed);
      
      // After hooks
      await hooks.executeAfterCreate('Patient', created, { req, storage });
      
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${config.server.url}/Patient/${created.id}`
        },
        body: created  // Auto-converted to JSON
      };
    }
  }
});
```

### Integration with Hooks

Custom handlers can still use the hooks system:
- Call `hooks.executeBeforeCreate()`, `hooks.executeAfterCreate()`, etc.
- Allows mixing custom logic with reusable hooks
- Maintains consistency across resources

### Best Practices

1. **Return proper HTTP responses** - Include status, headers, and body
2. **Handle errors gracefully** - Return OperationOutcome for FHIR errors
3. **Maintain FHIR compliance** - Follow FHIR REST API specifications
4. **Document custom behavior** - Make non-standard behavior clear
5. **Consider reusability** - Extract common logic into hooks when possible

## FHIR Package Management (NEW!)

### Automatic Package Download

The framework can automatically download FHIR Implementation Guide packages from registries:

```javascript
const app = new Atomic({
  packages: {
    enabled: true,
    path: 'packages',
    list: [
      'hl7.fhir.r4.core@4.0.1',     // FHIR R4 Core
      'hl7.fhir.us.core@5.0.1',     // US Core
      'hl7.fhir.uv.ips@1.0.0'       // International Patient Summary
    ],
    defaultRegistry: 'https://get-ig.org'
  }
});
```

### How It Works

1. **On Server Start**: Checks if packages need to be downloaded
2. **Registry API**: Uses npm-style registry API (compatible with get-ig.org)
3. **Download**: Fetches `.tgz` packages to `packages/` directory
4. **Loading**: Extracts and indexes all FHIR resources
5. **Validation**: Makes profiles available to the validator

### Package Contents

Downloaded packages include:
- **StructureDefinitions**: Resource and data type definitions
- **ValueSets**: Terminology value sets for validation
- **CodeSystems**: Code system definitions
- **SearchParameters**: Custom search parameters
- **OperationDefinitions**: Custom operations

### Registry Support

Default registry: `https://get-ig.org`

The framework converts this to the npm-compatible endpoint:
- Metadata: `https://fs.get-ig.org/pkgs/{package-name}`
- Download: Via tarball URL from metadata

### Benefits

1. **Zero Manual Setup**: No need to manually download packages
2. **Version Control**: Specify exact versions for reproducibility
3. **Automatic Updates**: Just change version in config
4. **Official Registry**: Uses the official FHIR package registry
5. **Cached Locally**: Downloaded once, reused across restarts

### Important Notes

- **First Run**: Packages are downloaded on the first server start
- **Cache Location**: Downloaded packages are stored as `.tgz` files in the `packages/` directory
- **Version Syntax**: Use npm-style version syntax (e.g., `package@1.0.0`)
- **Network Requirements**: Requires internet access to download packages initially
- **Fallback**: If the primary registry fails, the framework tries alternative endpoints

### Common Packages

```javascript
// Commonly used FHIR packages
packages: {
  list: [
    // Core specifications
    'hl7.fhir.r4.core@4.0.1',        // FHIR R4 Core
    'hl7.fhir.r4b.core@4.3.0',       // FHIR R4B Core
    'hl7.fhir.r5.core@5.0.0',        // FHIR R5 Core
    
    // Regional profiles
    'hl7.fhir.us.core@5.0.1',        // US Core
    'hl7.fhir.ca.baseline@1.0.0',    // Canadian Baseline
    'hl7.fhir.au.base@4.1.0',        // Australian Base
    
    // International specifications
    'hl7.fhir.uv.ips@1.0.0',         // International Patient Summary
    'hl7.fhir.uv.sdc@3.0.0',         // Structured Data Capture
    'hl7.fhir.uv.subscriptions-backport@1.0.0'  // Subscriptions
  ]
}
```

### Troubleshooting

**Package download fails:**
- Check network connectivity
- Verify package name and version exist
- Try downloading manually and placing in `packages/` directory

**Package not loading:**
- Ensure the `.tgz` file is not corrupted
- Check console logs for specific error messages
- Verify package structure (should contain `package.json` and FHIR resources)

## Hooks System Architecture

### Hook Definition

Hooks are defined separately from resources for better reusability:

```javascript
import { defineHook } from '@atomic/framework';

export default defineHook({
  name: 'hook-name',
  type: 'beforeCreate',  // Hook type
  resources: '*',         // '*' for all, 'Patient', or ['Patient', 'Practitioner']
  priority: 10,          // Execution order (higher = first)
  ignoreErrors: false,   // Continue on error?
  async handler(resource, context) {
    // Hook logic
    return resource;  // Return modified resource for 'before' hooks
  }
});
```

### Hook Execution Flow

1. Global hooks execute first (resources: '*')
2. Resource-specific hooks execute next
3. Hooks execute in priority order (highest first)
4. 'before' hooks can modify the resource
5. 'after' hooks are for side effects

### Context Object

All hooks receive a context object with:
- `req`: The HTTP request object
- `storage`: Storage manager instance
- Additional custom context data

## Conclusion

The framework leverages Bun's performance characteristics while providing a Rails-like developer experience specifically tailored for FHIR applications. The extensibility through Implementation Guides ensures it can adapt to various healthcare standards and regional requirements.
