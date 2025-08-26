# FHIR R4 Core Server Example

This example demonstrates automatic FHIR package management with the Atomic Framework.

## Features

- **Automatic Package Download**: Downloads `hl7.fhir.r4.core` package from the registry on first run
- **R4 Core Validation**: All resources are validated against FHIR R4 Core profiles
- **Package Registry**: Uses the official FHIR package registry at https://get-ig.org
- **No Manual Setup**: Packages are automatically downloaded and loaded

## Configuration

The server is configured to automatically download FHIR packages:

```javascript
packages: {
  enabled: true,
  path: 'packages',
  list: [
    'hl7.fhir.r4.core@4.0.1'  // FHIR R4 Core definitions
  ],
  defaultRegistry: 'https://get-ig.org'
}
```

## Running the Server

```bash
# Install dependencies
bun install

# Start the server (packages will be downloaded automatically)
bun run dev
```

On first run, you'll see:
```
📦 Downloading 1 FHIR packages from https://get-ig.org...
  📥 Downloading hl7.fhir.r4.core@4.0.1...
    → Fetching metadata from https://fs.get-ig.org/pkgs/hl7.fhir.r4.core
    → Downloading from [tarball URL]
    ✅ Downloaded hl7.fhir.r4.core@4.0.1 (2048.00 KB)

📦 Loading FHIR IG packages...
  📦 Found compressed package: hl7.fhir.r4.core.tgz
  📦 Loading compressed package: hl7.fhir.r4.core
    📋 Package: hl7.fhir.r4.core v4.0.1
    ✓ Loaded 600+ resources

✅ Loaded 1 packages with 600+ canonical resources

📊 Package Summary:
  • Profiles: 140
  • Operations: 25
  • ValueSets: 250
  • CodeSystems: 50
  • SearchParameters: 150
```

## What's Included

The `hl7.fhir.r4.core` package includes:

### StructureDefinitions
- All base FHIR R4 resource definitions
- Data type definitions
- Extension definitions

### ValueSets
- Administrative value sets (gender, marital status, etc.)
- Clinical value sets (observation categories, condition codes, etc.)
- Terminology bindings

### CodeSystems
- FHIR-defined code systems
- Administrative codes
- Clinical codes

### SearchParameters
- Standard search parameters for all resources
- Custom search parameter definitions

### OperationDefinitions
- Standard FHIR operations ($validate, $expand, etc.)

## API Examples

### Create a Patient

The patient will be validated against the R4 Core Patient profile:

```bash
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "identifier": [{
      "system": "http://example.org/mrn",
      "value": "12345"
    }],
    "name": [{
      "use": "official",
      "family": "Smith",
      "given": ["John", "Jacob"]
    }],
    "gender": "male",
    "birthDate": "1970-01-01",
    "address": [{
      "use": "home",
      "line": ["123 Main St"],
      "city": "Anytown",
      "state": "CA",
      "postalCode": "12345",
      "country": "USA"
    }]
  }'
```

### Create an Observation

Validated against R4 Core Observation profile:

```bash
curl -X POST http://localhost:3000/Observation \
  -H "Content-Type: application/fhir+json" \
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
        "code": "85354-9",
        "display": "Blood pressure panel"
      }]
    },
    "subject": {
      "reference": "Patient/123"
    },
    "effectiveDateTime": "2024-01-01T10:00:00Z",
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
          "value": 120,
          "unit": "mmHg",
          "system": "http://unitsofmeasure.org",
          "code": "mm[Hg]"
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
          "value": 80,
          "unit": "mmHg",
          "system": "http://unitsofmeasure.org",
          "code": "mm[Hg]"
        }
      }
    ]
  }'
```

## Package Management

### Adding More Packages

To add more FHIR packages, update the server configuration:

```javascript
packages: {
  list: [
    'hl7.fhir.r4.core@4.0.1',
    'hl7.fhir.us.core@5.0.1',  // US Core
    'hl7.fhir.uv.ips@1.0.0'    // International Patient Summary
  ]
}
```

### Manual Package Installation

You can also manually download packages:

```bash
# Using npm (packages are npm-compatible)
npm install --registry https://fs.get-ig.org/pkgs hl7.fhir.r4.core

# Move to packages directory
mv node_modules/hl7.fhir.r4.core/hl7.fhir.r4.core-4.0.1.tgz packages/
```

### Package Cache

Downloaded packages are cached in the `packages/` directory. To update packages:

1. Delete the `.tgz` file from `packages/`
2. Restart the server
3. The package will be re-downloaded

## Benefits

1. **Zero Configuration**: No manual package download or setup required
2. **Automatic Validation**: Resources validated against official FHIR profiles
3. **Complete Definitions**: Access to all FHIR R4 resources, value sets, and code systems
4. **Version Control**: Specify exact package versions for reproducibility
5. **Registry Integration**: Direct access to the official FHIR package registry

## Troubleshooting

### Package Download Fails

If package download fails, check:
- Internet connectivity
- Registry URL is accessible: https://get-ig.org
- Package name is correct (use format: `package.name@version`)

### Alternative Download

If the automatic download fails, you can:
1. Download manually from https://packages.fhir.org
2. Place the `.tgz` file in the `packages/` directory
3. Restart the server

## Next Steps

- Add more FHIR packages (US Core, IPS, etc.)
- Implement custom validation rules
- Add profile-specific handlers
- Create resources that conform to specific profiles