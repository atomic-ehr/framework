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
    path: 'packages'
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
