# Minimal FHIR Server Example

This example demonstrates the simplest possible FHIR server. Atomic's auto-discovery is enabled by default!

## Features

- **Zero Configuration**: Autoload is enabled by default
- **Auto-Discovery**: Resources, operations, middleware, hooks, and packages are automatically found
- **Convention over Configuration**: Just follow the folder structure

## Project Structure

```
minimal-server/
├── index.js           # Entry point
├── src/               # Source code directory
│   ├── server.js      # Server configuration
│   ├── resources/     # Auto-discovered resources
│   │   ├── Patient.js
│   │   └── Observation.js    
│   ├── operations/    # Auto-discovered operations
│   │   └── ping.js       
│   ├── middleware/    # Auto-discovered middleware
│   │   └── logger.js
│   └── hooks/         # Auto-discovered lifecycle hooks
│       ├── timestamps.js         # Add timestamps to all resources
│       ├── audit.js              # Audit logging for all changes
│       ├── patient-validation.js # Patient-specific validation
│       └── observation-defaults.js # Observation defaults
├── tests/             # Test files
│   ├── unit/         # Unit tests
│   └── integration/  # Integration tests
├── packages/          # FHIR IG packages (optional)
└── package.json       # Project dependencies
```

## How It Works

Autoload is **enabled by default**, so the framework automatically:

1. **Resources**: Loads any file in `src/resources/` that exports `defineResource()`
2. **Operations**: Loads any file in `src/operations/` that exports `defineOperation()`
3. **Middleware**: Loads any file in `src/middleware/` that exports `defineMiddleware()`
4. **Hooks**: Loads any file in `src/hooks/` that exports `defineHook()` or hook arrays
5. **Packages**: Loads any FHIR IG packages from `packages/` directory

## Getting Started

```bash
# Install dependencies
bun install

# Start the server
bun run dev
```

The server will start at http://localhost:3002

## Test It

```bash
# Create a patient
curl -X POST http://localhost:3002/Patient \
  -H "Content-Type: application/json" \
  -d '{"resourceType": "Patient", "name": [{"family": "Test"}]}'

# Ping the server
curl -X POST http://localhost:3002/\$ping

# Check server metadata
curl http://localhost:3002/metadata
```

## Adding More Features

Just create files in the appropriate folders:

### Add a new resource
Create `src/resources/Observation.js`:
```javascript
export default defineResource({
  resourceType: 'Observation',
  // ... configuration
});
```

### Add a new operation
Create `src/operations/custom.js`:
```javascript
export default defineOperation({
  name: 'custom',
  // ... configuration
});
```

### Add new middleware
Create `src/middleware/auth.js`:
```javascript
export default defineMiddleware({
  name: 'auth',
  // ... configuration
});
```

### Add new hooks
Create `src/hooks/validation.js`:
```javascript
export default defineHook({
  name: 'validation',
  type: 'beforeCreate',
  resources: '*',
  // ... configuration
});
```

That's it! The framework handles the rest.