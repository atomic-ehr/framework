# Basic FHIR Server Example

This example demonstrates a basic FHIR server using the Atomic framework.

## Features

- Patient and Observation resources with lifecycle hooks
- Patient $match operation for fuzzy matching
- Audit logging middleware
- SQLite storage

## Getting Started

```bash
# Install dependencies
bun install

# Start the server
bun run dev
```

The server will start at http://localhost:3000

## Example Requests

### Create a Patient

```bash
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/json" \
  -d '{
    "resourceType": "Patient",
    "name": [{
      "family": "Smith",
      "given": ["John"]
    }],
    "birthDate": "1980-01-01",
    "gender": "male"
  }'
```

### Search Patients

```bash
curl http://localhost:3000/Patient
```

### Match Patients

```bash
curl -X POST http://localhost:3000/Patient/\$match \
  -H "Content-Type: application/json" \
  -d '{
    "resource": {
      "resourceType": "Patient",
      "name": [{
        "family": "Smith"
      }]
    },
    "onlyCertainMatches": false
  }'
```

### Create an Observation

```bash
curl -X POST http://localhost:3000/Observation \
  -H "Content-Type: application/json" \
  -d '{
    "resourceType": "Observation",
    "status": "final",
    "code": {
      "coding": [{
        "system": "http://loinc.org",
        "code": "2339-0",
        "display": "Glucose"
      }]
    },
    "subject": {
      "reference": "Patient/[patient-id]"
    },
    "valueQuantity": {
      "value": 95,
      "unit": "mg/dL"
    }
  }'
```

## Project Structure

```
basic-server/
├── server.js           # Main server configuration
├── resources/         # Resource definitions
│   ├── Patient.js    # Patient resource with hooks
│   └── Observation.js # Observation resource with hooks
├── operations/        # Custom operations
│   └── match.js      # Patient matching operation
└── middleware/        # Middleware
    └── audit.js      # Audit logging middleware
```

## Key Concepts Demonstrated

1. **Resource Hooks**: Lifecycle hooks for validation and side effects
2. **Custom Operations**: Implementation of FHIR operations like $match
3. **Middleware**: Cross-cutting concerns like audit logging
4. **Validation**: Custom validators for business rules
5. **Search Parameters**: Custom search capabilities