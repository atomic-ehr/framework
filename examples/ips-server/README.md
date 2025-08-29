# IPS Server Example

Example FHIR server demonstrating the International Patient Summary (IPS) module system.

## Features

- **IPS Module**: Automatically loads IPS Implementation Guide
- **$summary Operation**: Generate IPS documents for patients
- **IPS Composition**: Enhanced Composition resource with IPS profile
- **Validation Hooks**: IPS-specific validation for compositions

## Running the Server

```bash
# Install dependencies
bun install

# Start the server
bun run dev
```

Server will start at http://localhost:3010

## Module System Architecture

The IPS module demonstrates how modules work in Atomic FHIR:

1. **Module Structure**: Modules follow the same structure as regular Atomic projects
2. **Module Manifest**: `module.json` describes dependencies and capabilities
3. **Auto-loading**: Module components are automatically discovered and registered
4. **Package Dependencies**: Modules can declare FHIR IG dependencies
5. **Lifecycle Hooks**: Modules can hook into server startup/shutdown

## Testing the IPS Module

1. Create a patient:
```bash
curl -X POST http://localhost:3010/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"family": "Smith", "given": ["John"]}],
    "birthDate": "1980-01-01"
  }'
```

2. Generate IPS summary:
```bash
curl http://localhost:3010/Patient/[id]/$summary
```

## Module Configuration

The module accepts configuration through the server config:

```typescript
modules: [
  {
    name: '@atomic-fhir/module-ips',
    config: {
      includeNarrative: false,
      sectionFilters: {
        medications: true,
        allergies: true,
        // ... other sections
      }
    }
  }
]
```