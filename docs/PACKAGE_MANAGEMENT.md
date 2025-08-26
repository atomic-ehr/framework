# FHIR Package Management

Atomic Framework provides seamless integration with the FHIR package ecosystem, allowing automatic download and loading of Implementation Guide packages.

## Overview

FHIR packages are standardized distributions of FHIR resources (profiles, value sets, code systems, etc.) that define implementation requirements. The Atomic Framework can automatically:

- Download packages from official registries
- Cache packages locally
- Load and index all contained resources
- Make profiles available for validation
- Provide runtime access to value sets and code systems

## Configuration

### Basic Setup

Package management is **enabled by default** in Atomic Framework. To use packages, specify which ones to download:

```javascript
import { Atomic } from '@atomic/framework';

const app = new Atomic({
  packages: {
    list: [                                  // Packages to download
      'hl7.fhir.r4.core@4.0.1',
      'hl7.fhir.us.core@5.0.1'
    ]
    // No need to set enabled: true - it's the default!
    // path defaults to 'packages'
    // defaultRegistry defaults to 'https://get-ig.org'
  }
});
```

**Note**: Package management is enabled by default, but no packages are downloaded unless you specify them in the `list` array. The framework will also load any existing packages found in the `packages/` directory.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable package management (enabled by default) |
| `path` | string | `'packages'` | Directory to store downloaded packages |
| `list` | string[] | `[]` | List of packages to download |
| `defaultRegistry` | string | `'https://get-ig.org'` | Default package registry URL |

## Package Specification

### Version Syntax

Packages are specified using npm-style syntax:

```javascript
// Specific version
'hl7.fhir.r4.core@4.0.1'

// Latest version (if no version specified)
'hl7.fhir.r4.core'

// Version ranges (future support)
'hl7.fhir.us.core@^5.0.0'
```

### Common Packages

#### Core Specifications
```javascript
'hl7.fhir.r4.core@4.0.1'        // FHIR R4 Core definitions
'hl7.fhir.r4b.core@4.3.0'       // FHIR R4B Core definitions
'hl7.fhir.r5.core@5.0.0'        // FHIR R5 Core definitions
```

#### Regional Profiles
```javascript
'hl7.fhir.us.core@5.0.1'        // US Core Implementation Guide
'hl7.fhir.ca.baseline@1.0.0'    // Canadian Baseline
'hl7.fhir.au.base@4.1.0'        // Australian Base Profiles
'hl7.fhir.uk.core@1.0.0'        // UK Core
```

#### Clinical Specifications
```javascript
'hl7.fhir.uv.ips@1.0.0'         // International Patient Summary
'hl7.fhir.uv.sdc@3.0.0'         // Structured Data Capture
'hl7.fhir.uv.genomics-reporting@2.0.0'  // Genomics Reporting
```

#### Infrastructure
```javascript
'hl7.fhir.uv.subscriptions-backport@1.0.0'  // Subscriptions R4 Backport
'hl7.fhir.uv.bulkdata@2.0.0'    // Bulk Data Access
'hl7.fhir.uv.smart-app-launch@2.0.0'  // SMART App Launch
```

## How It Works

### Download Process

1. **Server Start**: When the server starts, it checks the configured package list
2. **Cache Check**: For each package, checks if it already exists in the `packages/` directory
3. **Registry Query**: If not cached, queries the registry for package metadata
4. **Download**: Downloads the package tarball (`.tgz` file)
5. **Storage**: Saves the tarball to the `packages/` directory

### Loading Process

1. **Discovery**: Scans the `packages/` directory for `.tgz` files
2. **Extraction**: Reads package contents without full extraction
3. **Indexing**: Indexes all FHIR resources by type and canonical URL
4. **Registration**: Registers profiles with the validator
5. **Auto-Registration**: Automatically registers base resource definitions
6. **Availability**: Makes resources available for runtime access

### Auto-Registration of Base Resources (NEW!)

When packages are loaded, Atomic automatically identifies and registers base FHIR resource definitions (StructureDefinitions with `derivation: specialization`). This means:

- **No manual resource definitions needed**: When you load `hl7.fhir.r4.core`, all R4 resources (Patient, Observation, etc.) are automatically available
- **Full CRUD capabilities**: All auto-registered resources have create, read, update, delete, search, and history operations enabled
- **Search parameters included**: Package-defined search parameters are automatically configured
- **User definitions take precedence**: If you define a resource in `src/resources/`, it overrides the auto-registered version

Example: With just the R4 Core package, your server instantly supports all 140+ FHIR resources:

```javascript
const app = new Atomic({
  packages: {
    list: ['hl7.fhir.r4.core@4.0.1']
  }
  // No need to define Patient, Observation, etc. - they're auto-registered!
});
```

### Resource Types Loaded

- **StructureDefinition**: Resource and data type profiles
- **ValueSet**: Terminology value sets
- **CodeSystem**: Code system definitions
- **SearchParameter**: Custom search parameters
- **OperationDefinition**: Custom operations
- **ConceptMap**: Terminology mappings
- **NamingSystem**: Identifier systems
- **CapabilityStatement**: Server capabilities
- **CompartmentDefinition**: Resource compartments

## API Usage

### Accessing Package Resources

```javascript
// In your server code
const app = new Atomic({ /* config */ });
await app.start();

// Access loaded profiles
const patientProfile = app.packageManager.getProfile(
  'http://hl7.org/fhir/StructureDefinition/Patient'
);

// Access value sets
const genderValueSet = app.packageManager.getValueSet(
  'http://hl7.org/fhir/ValueSet/administrative-gender'
);

// Access code systems
const loincCodeSystem = app.packageManager.getCodeSystem(
  'http://loinc.org'
);

// Get all resources of a type
const allProfiles = app.packageManager.getResourcesByType('StructureDefinition');
```

### Using in Validation

Loaded profiles are automatically available for validation:

```javascript
const app = new Atomic({
  packages: {
    list: ['hl7.fhir.us.core@5.0.1']
  },
  validation: {
    strict: true  // Enable strict validation
  }
});

// Resources will be validated against US Core profiles automatically
```

## Manual Package Management

### Download Manually

If automatic download fails or you prefer manual control:

#### Using npm
```bash
# Use the FHIR registry
npm install --registry https://fs.get-ig.org/pkgs hl7.fhir.r4.core

# Move to packages directory
mv node_modules/hl7.fhir.r4.core/*.tgz packages/
```

#### Using curl
```bash
# Download directly
curl -o packages/hl7.fhir.r4.core.tgz \
  https://packages.fhir.org/hl7.fhir.r4.core/4.0.1
```

#### Using wget
```bash
wget -P packages/ \
  https://packages.fhir.org/hl7.fhir.r4.core/4.0.1/package.tgz
```

### Package Structure

A valid FHIR package contains:
```
package.tgz
├── package/
│   ├── package.json          # Package metadata
│   ├── StructureDefinition-*.json
│   ├── ValueSet-*.json
│   ├── CodeSystem-*.json
│   └── ...other FHIR resources
```

## Troubleshooting

### Package Download Issues

**Problem**: Package download fails
```
❌ Failed to download package hl7.fhir.r4.core: Failed to fetch package metadata: 404
```

**Solutions**:
1. Check internet connectivity
2. Verify package name and version exist
3. Try alternative registry: `https://packages.fhir.org`
4. Download manually and place in `packages/` directory

### Package Loading Issues

**Problem**: Package not loading
```
Error loading package: Invalid package structure
```

**Solutions**:
1. Verify `.tgz` file is not corrupted
2. Check package contains `package.json`
3. Ensure package contains valid FHIR JSON resources
4. Check file permissions on `packages/` directory

### Network Proxy Issues

If behind a corporate proxy:

```javascript
// Set proxy environment variables before starting
process.env.HTTP_PROXY = 'http://proxy.example.com:8080';
process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';
```

### Cache Management

To force re-download of packages:

```bash
# Remove cached package
rm packages/hl7.fhir.r4.core.tgz

# Restart server - package will be re-downloaded
bun run dev
```

## Best Practices

### 1. Version Pinning

Always specify exact versions for production:
```javascript
packages: {
  list: [
    'hl7.fhir.r4.core@4.0.1',  // Good - exact version
    // 'hl7.fhir.r4.core'       // Avoid - may change
  ]
}
```

### 2. Offline Development

For offline development, download packages once and commit to version control:
```bash
# Download packages
bun run dev  # Downloads packages on first run

# Commit packages directory
git add packages/
git commit -m "Add FHIR packages for offline development"
```

### 3. Package Selection

Only include packages you need:
- Start with core package for your FHIR version
- Add regional profiles if applicable
- Add clinical IGs as needed

### 4. Testing

Test with packages in development:
```javascript
// development.js
packages: {
  list: [
    'hl7.fhir.r4.core@4.0.1',
    'my.custom.ig@dev'  // Development version
  ]
}

// production.js
packages: {
  list: [
    'hl7.fhir.r4.core@4.0.1',
    'my.custom.ig@1.0.0'  // Stable version
  ]
}
```

## Advanced Topics

### Custom Registry

To use a custom package registry:

```javascript
packages: {
  defaultRegistry: 'https://my-registry.example.com',
  list: ['my.custom.package@1.0.0']
}
```

### Package Development

To use local packages during development:

1. Create package structure:
```bash
my-package/
├── package.json
└── StructureDefinition-MyProfile.json
```

2. Create tarball:
```bash
tar -czf my-package.tgz -C my-package .
```

3. Place in packages directory:
```bash
cp my-package.tgz packages/
```

### Performance Considerations

- **Initial Load**: First server start may be slower due to package download
- **Caching**: Subsequent starts use cached packages (fast)
- **Memory**: Large packages increase memory usage
- **Indexing**: More packages = longer indexing time

### Security Considerations

- **Package Integrity**: Verify package checksums when possible
- **Registry Security**: Use HTTPS registries only
- **Version Control**: Pin versions to avoid unexpected changes
- **Review Changes**: Review package updates before upgrading

## Examples

### Minimal R4 Server
```javascript
const app = new Atomic({
  packages: {
    list: ['hl7.fhir.r4.core@4.0.1']
  }
});
```

### US Core Compliant Server
```javascript
const app = new Atomic({
  packages: {
    list: [
      'hl7.fhir.r4.core@4.0.1',
      'hl7.fhir.us.core@5.0.1'
    ]
  }
});
```

### Multi-Region Server
```javascript
const app = new Atomic({
  packages: {
    list: [
      'hl7.fhir.r4.core@4.0.1',
      'hl7.fhir.us.core@5.0.1',
      'hl7.fhir.ca.baseline@1.0.0',
      'hl7.fhir.au.base@4.1.0'
    ]
  }
});
```

## Conclusion

The Atomic Framework's package management system provides seamless integration with the FHIR ecosystem, enabling developers to quickly build compliant FHIR servers with automatic access to standard profiles, value sets, and other conformance resources.