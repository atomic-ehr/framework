# Minimal FHIR Server Example

This example demonstrates the simplest possible FHIR server using Atomic's auto-discovery feature.

## Features

- **Zero Configuration**: Just create files in the right folders
- **Auto-Discovery**: Resources, operations, and middleware are automatically found and registered
- **Convention over Configuration**: Follow the folder structure and everything works

## Project Structure

```
minimal-server/
├── server.js           # Just 3 lines of configuration!
├── resources/         # Auto-discovered resources
│   └── Patient.js    
├── operations/        # Auto-discovered operations
│   └── ping.js       
└── middleware/        # Auto-discovered middleware
    └── logger.js     
```

## How It Works

1. **Resources**: Any file in `resources/` that exports a `defineResource()` is automatically registered
2. **Operations**: Any file in `operations/` that exports a `defineOperation()` is automatically registered
3. **Middleware**: Any file in `middleware/` that exports a `defineMiddleware()` is automatically applied

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
Create `resources/Observation.js`:
```javascript
export default defineResource({
  resourceType: 'Observation',
  // ... configuration
});
```

### Add a new operation
Create `operations/custom.js`:
```javascript
export default defineOperation({
  name: 'custom',
  // ... configuration
});
```

### Add new middleware
Create `middleware/auth.js`:
```javascript
export default defineMiddleware({
  name: 'auth',
  // ... configuration
});
```

That's it! The framework handles the rest.