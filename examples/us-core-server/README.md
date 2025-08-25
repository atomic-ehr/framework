# US Core FHIR Server Example

This example demonstrates a US Core Implementation Guide compliant FHIR server using the Atomic framework.

## Features

- **US Core Profiles**: Patient, Observation, and Practitioner resources with US Core validation
- **SMART on FHIR**: OAuth2-based authentication with scope-based access control
- **Consent Management**: Consent-based data access filtering
- **Bulk Data Export**: FHIR Bulk Data Access ($export) operation
- **Patient Everything**: $everything operation for complete patient records
- **Advanced Validation**: NPI validation, US address/phone formats, critical value detection

## Getting Started

```bash
# Install dependencies
bun install

# Start the server
bun run dev
```

The server will start at http://localhost:3001

## Authentication

This server implements SMART on FHIR authentication. You'll need to include a Bearer token in your requests:

```bash
# Example token (for demo purposes)
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwic2NvcGUiOiJwYXRpZW50L1BhdGllbnQucmVhZCBwYXRpZW50L09ic2VydmF0aW9uLnJlYWQiLCJwYXRpZW50IjoiUGF0aWVudC8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.signature"

# Use in requests
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/Patient
```

## Example Requests

### Create a US Core Patient

```bash
curl -X POST http://localhost:3001/Patient \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "resourceType": "Patient",
    "identifier": [{
      "system": "http://hospital.example.org/mrn",
      "value": "12345"
    }],
    "name": [{
      "use": "official",
      "family": "Johnson",
      "given": ["Robert", "James"]
    }],
    "gender": "male",
    "birthDate": "1970-05-15",
    "address": [{
      "use": "home",
      "line": ["123 Main St"],
      "city": "Boston",
      "state": "MA",
      "postalCode": "02101",
      "country": "US"
    }],
    "telecom": [{
      "system": "phone",
      "value": "617-555-1234",
      "use": "home"
    }]
  }'
```

### Create a US Core Practitioner with NPI

```bash
curl -X POST http://localhost:3001/Practitioner \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "resourceType": "Practitioner",
    "identifier": [{
      "system": "http://hl7.org/fhir/sid/us-npi",
      "value": "1234567893"
    }],
    "name": [{
      "family": "Smith",
      "given": ["Jane"],
      "prefix": ["Dr."]
    }],
    "qualification": [{
      "code": {
        "coding": [{
          "system": "http://terminology.hl7.org/CodeSystem/v2-0360",
          "code": "MD",
          "display": "Doctor of Medicine"
        }]
      }
    }]
  }'
```

### Create a Vital Signs Observation

```bash
curl -X POST http://localhost:3001/Observation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "resourceType": "Observation",
    "status": "final",
    "category": [{
      "coding": [{
        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
        "code": "vital-signs",
        "display": "Vital Signs"
      }]
    }],
    "code": {
      "coding": [{
        "system": "http://loinc.org",
        "code": "8867-4",
        "display": "Heart rate"
      }]
    },
    "subject": {
      "reference": "Patient/[patient-id]"
    },
    "valueQuantity": {
      "value": 72,
      "unit": "beats/minute",
      "system": "http://unitsofmeasure.org",
      "code": "/min"
    }
  }'
```

### Get Patient Everything

```bash
curl -X POST "http://localhost:3001/Patient/[patient-id]/\$everything" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "_type": ["Observation", "Condition"],
    "_count": 50
  }'
```

### Start Bulk Export

```bash
curl -X POST "http://localhost:3001/\$export" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -d '{
    "_type": "Patient,Observation",
    "_since": "2024-01-01T00:00:00Z"
  }'
```

## US Core Compliance Features

### Patient Profile
- Required: identifier, name, gender
- Must Support: birthDate, address, telecom, race, ethnicity
- Validates US address formats (state codes, ZIP codes)
- Validates US phone number formats
- Auto-generates MRN if not provided

### Observation Profile  
- Required: status, category, code, subject
- Automatic vital signs category detection
- Critical value detection and alerting
- LOINC code validation

### Practitioner Profile
- Required: identifier, name
- NPI validation with checksum
- Specialty tracking

## Security Features

### SMART on FHIR
- Bearer token authentication
- Scope-based access control
- Patient context support
- Practitioner context support

### Consent Management
- Patient self-access always allowed
- Practitioner access based on treatment relationship
- Search result filtering based on consent
- Granular resource-level access control

## Project Structure

```
us-core-server/
├── index.js                  # Entry point
├── src/                      # Source code directory
│   ├── server.js             # Server configuration with US Core settings
│   ├── resources/            # US Core profiled resources
│   │   ├── USCorePatient.js     # Patient resource definition
│   │   ├── USCoreObservation.js # Observation resource definition
│   │   └── USCorePractitioner.js # Practitioner resource definition
│   ├── hooks/                # Lifecycle hooks for US Core validation
│   │   ├── patient-validation.js    # Patient US Core validation
│   │   ├── observation-vitals.js    # Vital signs and critical values
│   │   └── practitioner-npi.js      # NPI validation hooks
│   ├── operations/           # FHIR operations
│   │   ├── everything.js     # Patient $everything
│   │   └── export.js         # Bulk data $export
│   └── middleware/           # Security middleware
│       ├── smart-auth.js     # SMART on FHIR authentication
│       └── consent.js        # Consent-based access control
└── package.json              # Project dependencies
```

## Testing Compliance

The server includes various US Core compliance checks:

1. **Required fields** are validated on resource creation
2. **Must Support** elements are tracked and validated
3. **US-specific formats** (NPI, phone, address) are validated
4. **Critical values** trigger alerts for vital signs
5. **SMART scopes** control resource access

## Notes

- This is a demonstration server with simplified authentication
- In production, integrate with a real OAuth2/OIDC provider
- Consent management should query actual Consent resources
- Bulk export should write to actual file storage (S3, etc.)