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
├── index.js           # Entry point
├── src/               # Source code directory
│   ├── server.js      # Server configuration
│   ├── resources/     # Resource definitions
│   │   ├── Patient.js
│   │   └── Observation.js
│   ├── operations/    # Custom operations
│   │   └── match.js   # Patient matching operation
│   ├── middleware/    # Middleware
│   │   └── audit.js   # Audit logging
│   └── hooks/         # Lifecycle hooks
│       ├── patient-hooks.js     # Patient-specific hooks
│       └── observation-hooks.js # Observation-specific hooks
└── package.json       # Project dependencies
```

## Key Concepts Demonstrated

1. **Resource Definitions**: Clean resource definitions without inline hooks
2. **Separated Hooks**: Lifecycle hooks in dedicated folder for better organization
3. **Custom Operations**: Implementation of FHIR operations like $match
4. **Middleware**: Cross-cutting concerns like audit logging
5. **Validation**: Custom validators for business rules
6. **Search Parameters**: Custom search capabilities