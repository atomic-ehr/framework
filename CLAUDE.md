# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Atomic is a FHIR-native web framework for JavaScript/Bun that treats FHIR resources as first-class citizens. Instead of adapting traditional MVC patterns, it uses FHIR's own concepts: StructureDefinitions for models, OperationDefinitions for business logic, and CapabilityStatements for API contracts.

## Current Project Structure

### Monorepo Structure
```
fhir-framework/
├── packages/
│   └── core/                          # @atomic-fhir/core package
│       ├── src/
│       │   ├── index.js              # Main exports
│       │   ├── index.d.ts            # TypeScript definitions
│       │   ├── core/                 # Core framework components
│       │   │   ├── atomic.js         # Main framework class
│       │   │   ├── router.js         # HTTP routing
│       │   │   ├── resource-registry.js
│       │   │   ├── operation-registry.js
│       │   │   ├── hooks-manager.js  # Hooks system
│       │   │   ├── filesystem-loader.js # Auto-discovery
│       │   │   ├── package-manager.js   # FHIR IG packages
│       │   │   ├── capability-statement.js # Metadata endpoint
│       │   │   ├── validator.js
│       │   │   ├── resource.js       # Resource definition helper
│       │   │   ├── operation.js      # Operation definition helper
│       │   │   ├── define-hook.js    # Hook definition helper
│       │   │   └── middleware.js     # Middleware definition helper
│       │   └── storage/              # Storage adapters
│       │       ├── storage-manager.js
│       │       ├── adapter.js        # Base adapter class
│       │       └── sqlite-adapter.js
│       ├── package.json              # Package configuration
│       ├── tsconfig.json             # TypeScript configuration
│       └── README.md
├── examples/                         # Example servers
│   ├── minimal-server/              # Simplest server (3 lines)
│   ├── basic-server/               # Basic CRUD operations
│   ├── custom-handlers-server/     # Custom business logic
│   ├── r4-core-server/            # Full R4 Core with packages
│   ├── us-core-server/            # US Core IG implementation
│   ├── us-core-server-v8/         # US Core v8 with direct URL
│   ├── typescript-test/            # TypeScript example
│   ├── package-aware-server/      # Package management demo
│   └── manual-server/              # Without autoload
├── docs/                           # Documentation
├── tests/                          # Test suite
├── cli.js                          # CLI tool
├── package.json                    # Root package with workspaces
├── lerna.json                      # Monorepo management
├── README.md                       # Main documentation
└── CLAUDE.md                       # This file
```

### User Project Structure (IMPORTANT)

When creating a new Atomic FHIR server, use this structure:

```
my-fhir-server/
├── src/                           # All source code goes in src/
│   ├── server.js                 # Server configuration
│   ├── resources/                # FHIR resource definitions
│   │   ├── Patient.js
│   │   └── Observation.js
│   ├── operations/               # Custom FHIR operations
│   │   ├── match.js             # $match operation
│   │   └── everything.js        # $everything operation
│   ├── middleware/               # Express-style middleware
│   │   ├── auth.js
│   │   └── audit.js
│   └── hooks/                    # Lifecycle hooks
│       ├── timestamps.js         # Add timestamps to all resources
│       └── validation.js         # Custom validation
├── packages/                     # FHIR IG packages (.tgz files)
│   ├── hl7.fhir.r4.core.tgz
│   └── hl7.fhir.us.core.tgz
├── package.json
└── README.md
```

**Key Points:**
- All application code MUST go in the `src/` directory
- Autoload automatically discovers components from `src/` subfolders
- Packages go in root-level `packages/` directory as .tgz files

## Development Commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run linter
bun run lint

# Run prettier
bun run format

# Run examples
cd examples/minimal-server
bun run dev

# Create new project with CLI
bun run cli.js new <project-name>

# Generate components
bun run cli.js generate resource <ResourceType>
bun run cli.js generate operation <operation-name>
```

## Key Framework Features

### 1. Package Management (Current Implementation)

**Modern Configuration Format:**
```javascript
const app = new Atomic({
  packages: [
    // NPM registry style
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    },
    // Direct URL download
    {
      package: 'hl7.fhir.us.core',
      version: '7.0.0',
      remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/7.0.0'
    }
  ]
});
```

**Auto-Registration:** When loading R4 Core, all base resources are automatically registered with full CRUD capabilities.

### 2. Resource Capabilities (Full FHIR Support)

All FHIR interaction types are supported:
```javascript
defineResource({
  resourceType: 'Patient',
  capabilities: {
    // Instance level
    read: true,                          // GET [base]/[type]/[id]
    vread: true,                         // GET [base]/[type]/[id]/_history/[vid]
    update: true,                        // PUT [base]/[type]/[id]
    'update-conditional': false,        // PUT [base]/[type]?[search]
    patch: false,                        // PATCH [base]/[type]/[id]
    'patch-conditional': false,          // PATCH [base]/[type]?[search]
    delete: true,                        // DELETE [base]/[type]/[id]
    'delete-conditional-single': false,
    'delete-conditional-multiple': false,
    'delete-history': false,
    'delete-history-version': false,
    'history-instance': true,
    
    // Type level
    'history-type': true,                // GET [base]/[type]/_history
    create: true,                        // POST [base]/[type]
    'create-conditional': false,         // POST with If-None-Exist
    'search-type': true                  // GET [base]/[type]
  }
});
```

### 3. TypeScript Support

Full TypeScript definitions are available in `packages/core/src/index.d.ts`:
- `AtomicConfig` - Server configuration
- `ResourceDefinition` - Resource definition with capabilities
- `OperationDefinition` - Operation with parameters
- `HookDefinition` - Hook with type and resources
- `HandlerContext` - Context passed to handlers
- `HandlerResponse` - Response from custom handlers

### 4. Metadata Endpoint

The `/metadata` endpoint reports:
- All registered resources with their capabilities
- Supported profiles (base + constraint profiles)
- Available operations
- Server information

Example:
```json
{
  "type": "Patient",
  "supportedProfile": [
    "http://hl7.org/fhir/StructureDefinition/Patient",
    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
  ],
  "interaction": [
    { "code": "read" },
    { "code": "vread" },
    { "code": "update" },
    { "code": "create" },
    { "code": "search-type" }
  ]
}
```

### 5. Hooks System

Hooks are separated from resources for reusability:
```javascript
defineHook({
  name: 'hook-name',
  type: 'beforeCreate',  // Hook type
  resources: '*',         // '*' for all, 'Patient', or ['Patient', 'Practitioner']
  priority: 10,          // Execution order (higher = first)
  async handler(resource, context) {
    return resource;  // Return modified resource for 'before' hooks
  }
});
```

Available hook types:
- `beforeCreate` / `afterCreate`
- `beforeUpdate` / `afterUpdate`
- `beforeDelete` / `afterDelete`
- `beforeRead` / `afterRead`
- `beforeSearch` / `afterSearch`
- `beforeValidate` / `afterValidate`

### 6. Custom Resource Handlers

Override any CRUD operation:
```javascript
defineResource({
  resourceType: 'Patient',
  handlers: {
    async create(req, context) {
      const { storage, hooks, validator, config, packageManager } = context;
      // Custom business logic
      return {
        status: 201,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: resource  // Auto-converted to JSON
      };
    }
  }
});
```

### 7. Auto-Discovery

**Default Configuration:**
```javascript
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

The framework automatically discovers and loads components from these directories.

## Framework Architecture Patterns

### Request Pipeline
```text
Request → Router → Handler → Storage → Response
           ↓         ↓         ↓
      Route Match  Resource  SQLite
                   Operation
                      ↓
                  Hooks Pipeline
                 (before/after)
```

### Core Classes

1. **Atomic** (`atomic.js`) - Main framework class
   - Manages configuration
   - Coordinates all components
   - Handles server startup

2. **PackageManager** (`package-manager.js`)
   - Downloads packages from registries or URLs
   - Loads and indexes FHIR resources
   - Provides profile lookup for metadata

3. **CapabilityStatement** (`capability-statement.js`)
   - Generates metadata endpoint
   - Reports resource capabilities
   - Lists supported profiles

4. **Router** (`router.js`)
   - Handles HTTP routing
   - Maps FHIR REST endpoints
   - Executes operations

5. **HooksManager** (`hooks-manager.js`)
   - Manages lifecycle hooks
   - Priority-based execution
   - Resource-specific filtering

6. **FilesystemLoader** (`filesystem-loader.js`)
   - Auto-discovers components
   - Loads from configured paths
   - Handles dynamic imports

7. **StorageManager** (`storage-manager.js`)
   - Abstracts storage operations
   - Uses adapter pattern
   - Default SQLite implementation

## Important Implementation Notes

### 1. Middleware System
The middleware system is defined but NOT fully implemented:
- `defineMiddleware()` function exists
- `registerMiddleware()` method is optional/not implemented
- Middleware auto-discovery may not work

### 2. Path Resolution
The framework automatically adjusts paths for servers in `src/`:
- If server is in `src/server.js`, basePath is adjusted up one level
- This ensures autoload paths work correctly

### 3. Package Loading
Packages are loaded in this order:
1. Check if .tgz file exists in `packages/` directory
2. Download from registry or URL if not present
3. Extract and index all FHIR resources
4. Register base resources automatically

### 4. Resource Registration
Resources from packages are registered with:
- Full CRUD capabilities by default
- Search parameters from the package
- No custom handlers (use local resources for custom logic)

### 5. Profile Reporting
The metadata endpoint reports profiles in order:
1. Base resource definition (e.g., `http://hl7.org/fhir/StructureDefinition/Patient`)
2. Constraint profiles from all loaded packages

## Testing Strategy

```bash
# Unit tests for core components
bun test packages/core/src/**/*.test.js

# Integration tests for examples
bun test examples/*/tests/*.test.js

# Type checking
cd examples/typescript-test
bun run typecheck
```

## Performance Considerations

1. **Bun Runtime**: Native SQLite, fast startup, built-in TypeScript
2. **Package Caching**: Downloaded packages are cached locally
3. **Lazy Loading**: Resources loaded on demand
4. **Direct JSON Storage**: SQLite with JSON columns

## Security Best Practices

1. **Input Validation**: Use StructureDefinition-based validation
2. **Authentication**: Implement via middleware (not built-in)
3. **Audit Logging**: Use hooks for audit trail
4. **Rate Limiting**: Implement via middleware

## Common Patterns

### Adding a New Resource
1. Create file in `src/resources/ResourceName.js`
2. Export default `defineResource({ resourceType: 'ResourceName' })`
3. Resource is auto-discovered and registered

### Adding a Hook
1. Create file in `src/hooks/hook-name.js`
2. Export default `defineHook({ name, type, resources, handler })`
3. Hook is auto-discovered and registered

### Adding an Operation
1. Create file in `src/operations/operation-name.js`
2. Export default `defineOperation({ name, resource, handler })`
3. Operation is auto-discovered and registered

## Troubleshooting

**Package download fails:**
- Check network connectivity
- Verify package name and version exist
- Try direct URL instead of registry

**Auto-discovery not working:**
- Ensure files are in correct `src/` subdirectories
- Check file exports default function
- Verify autoload is enabled in config

**TypeScript errors:**
- Run `bun install` to get latest types
- Check imports from `@atomic-fhir/core`
- Verify TypeScript version >= 5.0

## Future Roadmap

Planned features (not yet implemented):
- [ ] Full middleware system
- [ ] PostgreSQL and MongoDB adapters
- [ ] Subscription support
- [ ] Bulk data operations
- [ ] GraphQL interface
- [ ] Full StructureDefinition validation
- [ ] SMART on FHIR authentication

## Contributing Guidelines

1. **Code Style**: Use Prettier for formatting
2. **Testing**: Add tests for new features
3. **Documentation**: Update docs for API changes
4. **TypeScript**: Keep type definitions updated
5. **Examples**: Add examples for new features

## Important Reminders

- DO NOT create files unless necessary
- ALWAYS prefer editing existing files
- NEVER create documentation unless requested
- Keep responses concise and focused
- Test changes before committing