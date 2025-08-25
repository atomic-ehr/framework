# Manual Registration FHIR Server Example

This example demonstrates how to manually register components without using auto-discovery.

## Features

- **Manual Registration**: Explicitly register resources, operations, and middleware
- **No Auto-Discovery**: Autoload is disabled
- **No Package Loading**: Package loading is disabled
- **Full Control**: Complete control over what gets registered

## Project Structure

```
manual-server/
├── index.js           # Entry point
├── src/               # Source code directory
│   └── server.js      # Server with manual registration
└── package.json       # Project dependencies
```

## Getting Started

```bash
# Install dependencies
bun install

# Start the server
bun run dev
```

The server will start at http://localhost:3005

## How It Works

This server demonstrates explicit component registration:

1. **Autoload Disabled**: `autoload: false` prevents automatic discovery
2. **Package Loading Disabled**: `packages: false` prevents package loading
3. **Manual Registration**: Components are explicitly registered using:
   - `app.registerResource('Patient', PatientResource)`
   - `app.registerOperation(pingOperation)`
   - `app.use(loggingMiddleware)`

## Example Requests

### Create a Patient

```bash
curl -X POST http://localhost:3005/Patient \
  -H "Content-Type: application/json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"family": "Test"}]
  }'
```

### Ping the Server

```bash
curl -X POST http://localhost:3005/$ping
```

## Key Differences

Unlike the auto-discovery examples:

1. **No filesystem scanning**: The framework doesn't look for files in conventional folders
2. **Explicit imports**: All components must be imported in server.js
3. **Manual registration**: Each component must be registered explicitly
4. **No hooks folder**: Hooks are defined inline or manually registered
5. **Faster startup**: No filesystem scanning overhead
6. **Predictable behavior**: Only what you register is available

## When to Use Manual Registration

Choose manual registration when:

- You want full control over registration order
- You're building a minimal API with few endpoints
- You need faster startup times
- You prefer explicit over implicit behavior
- You're integrating with existing systems

## Notes

- All components are defined in the main server.js file
- This approach is closer to traditional Express.js patterns
- Good for understanding how the framework works internally
- Can be combined with partial auto-discovery if needed