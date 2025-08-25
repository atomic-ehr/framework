# Package-Aware FHIR Server Example

This example demonstrates how to use FHIR Implementation Guide packages with the Atomic framework.

## Features

- **Package Loading**: Automatically loads FHIR IG packages from the `packages/` directory
- **Resource Registry**: Access loaded StructureDefinitions, OperationDefinitions, ValueSets, and CodeSystems
- **Validation**: Use loaded profiles for resource validation
- **Terminology**: Expand ValueSets using loaded CodeSystems
- **Operation References**: Reference loaded OperationDefinitions in custom operations

## Project Structure

```
package-aware-server/
├── index.js              # Entry point
├── src/                  # Source code directory
│   ├── server.js         # Server configuration with package settings
│   └── operations/       # Custom operations using packages
│       ├── validate.js   # Validation using loaded profiles
│       └── expand.js     # ValueSet expansion
├── packages/             # FHIR IG packages
│   └── sample.core/      # Sample package
│       ├── package.json
│       ├── StructureDefinition-SamplePatient.json
│       ├── OperationDefinition-patient-everything.json
│       ├── ValueSet-sample-conditions.json
│       └── CodeSystem-sample-conditions.json
└── package.json          # Project dependencies
```

## Getting Started

```bash
# Install dependencies
bun install

# Start the server
bun run dev
```

The server will start at http://localhost:3004

## Example Requests

### Validate Resource Against Profile

```bash
curl -X POST http://localhost:3004/\$validate \
  -H "Content-Type: application/json" \
  -d '{
    "resource": {
      "resourceType": "Patient",
      "name": [{"family": "Test"}]
    },
    "profile": "http://example.org/fhir/StructureDefinition/sample-patient"
  }'
```

### Expand ValueSet

```bash
curl -X POST http://localhost:3004/ValueSet/\$expand \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://example.org/fhir/ValueSet/sample-conditions"
  }'
```

### Filter ValueSet Expansion

```bash
curl -X POST http://localhost:3004/ValueSet/\$expand \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://example.org/fhir/ValueSet/sample-conditions",
    "filter": "diabetes"
  }'
```

## How It Works

### 1. Package Loading

On server startup, the PackageManager:
- Scans the `packages/` directory
- Loads all `package.json` files
- Discovers and loads all FHIR resources (JSON files)
- Builds registries for different resource types

### 2. Resource Access

In operations, access loaded resources via the package manager:

```javascript
// Get a StructureDefinition
const profile = app.packageManager.getProfile(profileUrl);

// Get an OperationDefinition
const opDef = app.packageManager.getOperation('validate');

// Get a ValueSet
const valueSet = app.packageManager.getValueSet(url);

// Get a CodeSystem
const codeSystem = app.packageManager.getCodeSystem(systemUrl);

// Get all profiles for a resource type
const patientProfiles = app.packageManager.getProfilesForResource('Patient');
```

### 3. Validation

The package manager provides validation against loaded profiles:

```javascript
const result = await app.packageManager.validateAgainstProfile(resource, profileUrl);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

## Adding Packages

### From NPM Registry

Download FHIR packages from the NPM registry:

```bash
# Download US Core
npm pack hl7.fhir.us.core@5.0.1
mv hl7.fhir.us.core-5.0.1.tgz packages/

# Download IPS
npm pack hl7.fhir.uv.ips@1.0.0
mv hl7.fhir.uv.ips-1.0.0.tgz packages/
```

### Custom Packages

Create your own package:

1. Create a directory in `packages/`
2. Add a `package.json` with package metadata
3. Add FHIR resource JSON files
4. Restart the server

### Package Structure

```
packages/my.custom.ig/
├── package.json
├── StructureDefinition-*.json
├── OperationDefinition-*.json
├── ValueSet-*.json
├── CodeSystem-*.json
└── SearchParameter-*.json
```

## Package Manager API

The PackageManager provides these methods:

- `getProfile(url)` - Get a StructureDefinition by URL
- `getOperation(urlOrCode)` - Get an OperationDefinition
- `getValueSet(url)` - Get a ValueSet
- `getCodeSystem(url)` - Get a CodeSystem
- `getSearchParameter(urlOrCode)` - Get a SearchParameter
- `getCanonicalResource(url)` - Get any canonical resource
- `getResourcesByType(type)` - Get all resources of a type
- `getOperationsForResource(type)` - Get operations for a resource
- `getProfilesForResource(type)` - Get profiles for a resource
- `validateAgainstProfile(resource, profileUrl)` - Validate a resource

## Benefits

1. **Reusability**: Use standard FHIR IGs without reimplementation
2. **Validation**: Automatic profile-based validation
3. **Terminology**: Built-in terminology services
4. **Documentation**: OperationDefinitions document available operations
5. **Interoperability**: Use the same IGs as other FHIR servers

## Notes

- Packages are loaded once at server startup
- Large packages may increase startup time
- Package resources are read-only
- Dependencies between packages are tracked but not auto-installed