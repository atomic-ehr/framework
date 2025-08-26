# Custom Resource Handlers Example

This example demonstrates how to implement custom handlers for FHIR resource CRUD operations in the Atomic Framework.

## Features

### 🎯 Custom Resource Handlers

Each resource can define custom implementations for any CRUD operation:
- **create** - Custom resource creation logic
- **read** - Custom retrieval with additional processing
- **update** - Custom update logic with business rules
- **delete** - Custom deletion with validation
- **search** - Custom search with aggregation and statistics

### 📦 Resources with Custom Logic

#### Patient Resource
- **Custom Create**: Automatically generates Medical Record Numbers (MRN)
- **Custom Read**: Adds audit logging and access tracking
- **Custom Update**: Preserves MRN and maintains version history
- **Custom Search**: Includes search statistics and performance metrics

#### Observation Resource
- **Custom Create**: Auto-interprets vital signs (blood pressure)
- **Custom Search**: Supports aggregation with `_aggregate=true` parameter

#### Encounter Resource
- **Custom Create**: Enforces business rules (no overlapping active encounters)
- **Custom Update**: Manages status transitions and period tracking
- **Custom Delete**: Prevents deletion of active encounters

## Running the Example

```bash
# Install dependencies
bun install

# Start the server
bun run dev

# Or without watch mode
bun start
```

Server runs on http://localhost:3000

## API Examples

### Create a Patient with Auto-Generated MRN

```bash
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{
      "family": "Smith",
      "given": ["John"]
    }],
    "gender": "male",
    "birthDate": "1990-01-01"
  }'
```

Response includes automatically generated MRN:
```json
{
  "resourceType": "Patient",
  "id": "generated-id",
  "identifier": [{
    "system": "http://hospital.example.org/mrn",
    "value": "MRN-1234567890-ABC123XYZ",
    "use": "official",
    "type": {
      "coding": [{
        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
        "code": "MR",
        "display": "Medical record number"
      }]
    }
  }],
  ...
}
```

### Create an Observation with Auto-Interpretation

```bash
curl -X POST http://localhost:3000/Observation \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Observation",
    "status": "final",
    "code": {
      "coding": [{
        "system": "http://loinc.org",
        "code": "85354-9",
        "display": "Blood pressure panel"
      }]
    },
    "component": [
      {
        "code": {
          "coding": [{
            "system": "http://loinc.org",
            "code": "8480-6",
            "display": "Systolic blood pressure"
          }]
        },
        "valueQuantity": {
          "value": 145,
          "unit": "mmHg"
        }
      },
      {
        "code": {
          "coding": [{
            "system": "http://loinc.org",
            "code": "8462-4",
            "display": "Diastolic blood pressure"
          }]
        },
        "valueQuantity": {
          "value": 95,
          "unit": "mmHg"
        }
      }
    ]
  }'
```

Response includes automatic interpretation:
```json
{
  "resourceType": "Observation",
  "interpretation": [{
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
      "code": "H",
      "display": "High"
    }],
    "text": "Hypertension detected"
  }],
  ...
}
```

### Search with Aggregation

```bash
# Search observations with aggregation statistics
curl "http://localhost:3000/Observation?_aggregate=true"
```

Response includes statistics in extension:
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "extension": [{
    "url": "http://example.org/observation-statistics",
    "valueString": "{
      \"totalObservations\": 10,
      \"uniquePatients\": 5,
      \"observationTypes\": 3,
      \"typeBreakdown\": {
        \"Blood pressure panel\": 4,
        \"Heart rate\": 3,
        \"Temperature\": 3
      },
      \"dateRange\": {
        \"earliest\": \"2024-01-01T00:00:00Z\",
        \"latest\": \"2024-12-25T12:00:00Z\"
      }
    }"
  }],
  ...
}
```

### Create an Encounter with Business Rules

```bash
curl -X POST http://localhost:3000/Encounter \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Encounter",
    "status": "in-progress",
    "class": {
      "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      "code": "IMP",
      "display": "inpatient encounter"
    },
    "subject": {
      "reference": "Patient/123"
    }
  }'
```

If the patient already has an active encounter, you'll get:
```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "conflict",
    "details": {
      "text": "Patient already has an active encounter (ID: existing-encounter-id)"
    }
  }]
}
```

## Implementation Details

### Handler Structure

Custom handlers receive:
1. **Request data** - `req` for create/search, `id` and `req` for read/update/delete
2. **Context object** with:
   - `storage` - Database operations
   - `hooks` - Lifecycle hooks manager
   - `validator` - FHIR validator
   - `config` - Server configuration

### Handler Response

Handlers must return an object with:
- `status` - HTTP status code
- `headers` - Response headers (optional)
- `body` - Response body (JavaScript object or string - objects are automatically converted to JSON)

### Example Handler

```javascript
export default defineResource({
  resourceType: 'Patient',
  handlers: {
    async create(req, context) {
      const { storage, hooks, config } = context;
      const patient = await req.json();
      
      // Custom logic here
      
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${config.server.url}/Patient/${created.id}`
        },
        body: created  // Auto-converted to JSON
      };
    }
  }
});
```

## Benefits of Custom Handlers

1. **Business Logic Integration** - Embed domain-specific rules directly in resource handlers
2. **Data Enrichment** - Auto-generate identifiers, add metadata, calculate derived values
3. **Validation** - Implement complex validation beyond FHIR structural requirements
4. **Audit & Compliance** - Add logging, tracking, and audit trails
5. **Performance Optimization** - Customize queries, add caching, aggregate data
6. **Legacy System Integration** - Transform data, call external APIs, maintain compatibility

## Notes

- Custom handlers completely replace the default implementation
- You can mix resources with custom handlers and those using defaults
- Hooks still work with custom handlers if you call them explicitly
- Custom handlers have full control over the response format