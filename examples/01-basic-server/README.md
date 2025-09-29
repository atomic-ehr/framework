# Example 1: Basic FHIR Server

The simplest possible FHIR server in just 10 lines of code.

## What This Example Shows

- ✅ Minimal server setup
- ✅ Automatic FHIR R4 Core package loading
- ✅ Full CRUD operations out of the box
- ✅ Auto-generated capability statement

## Running

```bash
cd examples/01-basic-server
bun server.js
```

## Testing

```bash
# Get capability statement
curl http://localhost:3000/metadata

# Create a patient
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"family": "Doe", "given": ["John"]}],
    "gender": "male"
  }'

# Search patients
curl http://localhost:3000/Patient

# Read a patient (use ID from create response)
curl http://localhost:3000/Patient/{id}
```

## What's Happening

1. Server loads `hl7.fhir.r4.core` package
2. Dynamic routes are generated for all resource types
3. In-memory storage is used by default
4. Validation is automatically enabled
5. Capability statement is generated at `/metadata`