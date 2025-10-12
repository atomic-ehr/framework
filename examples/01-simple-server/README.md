# Example 1: Simple FHIR Server

The absolute minimum code to run a fully-functional FHIR R4 server.

## What's Included

This example demonstrates:
- ✅ Full FHIR R4 REST API
- ✅ Automatic resource validation
- ✅ Metadata endpoint (`/metadata`)
- ✅ All CRUD operations (Create, Read, Update, Delete)
- ✅ Search support
- ✅ In-memory storage (default)

## Running the Example

```bash
cd examples/01-simple-server
bun install
bun run dev
```

## Making Requests

### 1. Get Server Capabilities
```bash
curl http://localhost:3000/metadata
```

### 2. Create a Patient
```bash
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"family": "Doe", "given": ["John"]}],
    "gender": "male",
    "birthDate": "1990-01-01"
  }'
```

### 3. Search Patients
```bash
curl http://localhost:3000/Patient
```

### 4. Get Specific Patient
```bash
# Use the ID from the create response
curl http://localhost:3000/Patient/{id}
```

### 5. Update a Patient
```bash
curl -X PUT http://localhost:3000/Patient/{id} \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "id": "{id}",
    "name": [{"family": "Doe", "given": ["Jane"]}],
    "gender": "female"
  }'
```

## Code Overview

```typescript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'], // Load FHIR R4 resources
});

await server.start();
```

That's it! You now have a complete FHIR server.

## What Happens Automatically

1. **Resource Loading** - FHIR R4 Core resources are loaded from the package
2. **Route Registration** - REST endpoints created for all resources
3. **Validation** - Resources validated against FHIR schemas
4. **Storage** - In-memory storage configured by default
5. **Metadata** - `/metadata` endpoint auto-generated

## Next Steps

See [Example 2: Extending the Framework](../02-extending-framework) to learn how to:
- Add custom plugins
- Extend the type system
- Add decorators
- Create custom hooks
- Augment contexts
