# Package Management in Atomic FHIR Framework

This document explains how the Atomic FHIR framework handles FHIR Implementation Guide (IG) packages, including automatic downloading, loading, and integration with the server.

## Overview

The Atomic framework includes a comprehensive package management system that can:
- Automatically download FHIR IG packages from registries
- Load and index FHIR conformance resources
- Auto-register base resource definitions from loaded packages
- Make profiles available for validation
- Report supported profiles in the metadata endpoint

## Configuration

### Basic Configuration

Packages can be configured in two ways:

#### 1. NPM Registry Mode
Uses an NPM-compatible registry API (like get-ig.org):

```javascript
import { Atomic } from '@atomic-fhir/core';

const app = new Atomic({
  packages: [
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    }
  ]
});
```

#### 2. Direct URL Mode
Downloads directly from a specified URL:

```javascript
const app = new Atomic({
  packages: [
    {
      package: 'hl7.fhir.us.core',
      version: '7.0.0',
      remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/7.0.0'
    }
  ]
});
```

### Mixed Configuration

You can mix both modes in the same configuration:

```javascript
const app = new Atomic({
  packages: [
    // Using NPM registry
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    },
    // Using direct URL
    {
      package: 'hl7.fhir.us.core',
      version: '7.0.0',
      remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/7.0.0'
    }
  ]
});



## How It Works

### 1. Package Download Process

When the server starts:
1. Checks the `packages/` directory for existing `.tgz` files
2. Downloads missing packages based on configuration
3. For NPM registry mode:
   - Fetches metadata from registry API
   - Downloads the tarball from the URL in metadata
4. For direct URL mode:
   - Downloads directly from the specified URL
5. Saves packages as `.tgz` files in the `packages/` directory

### 2. Package Loading

After downloading, the PackageManager:
1. Extracts the `.tgz` file in memory
2. Parses the `package.json` for metadata
3. Indexes all FHIR conformance resources:
   - StructureDefinitions (profiles and extensions)
   - ValueSets
   - CodeSystems
   - SearchParameters
   - OperationDefinitions

### 3. Auto-Registration of Base Resources

When loading core packages (like `hl7.fhir.r4.core`), the framework automatically:
1. Identifies all base resource definitions (Patient, Observation, etc.)
2. Registers them as resources with full CRUD capabilities
3. Makes them immediately available via REST API

Example:
```javascript
// Loading R4 Core automatically registers all 147 base resources
const app = new Atomic({
  packages: [
    { 
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      npmRegistry: 'https://get-ig.org'
    }
  ]
});

// All resources are now available:
// GET/POST /Patient
// GET/POST /Observation
// GET/POST /Encounter
// ... and all other R4 resources
```

## Package Contents

### What's in a FHIR Package?

A typical FHIR package contains:

```
package.tgz/
├── package.json          # Package metadata
├── package/
│   ├── StructureDefinition-*.json   # Resource profiles
│   ├── ValueSet-*.json              # Value sets
│   ├── CodeSystem-*.json            # Code systems
│   ├── SearchParameter-*.json       # Custom search params
│   └── OperationDefinition-*.json   # Custom operations
└── other-info.json       # Package manifest
```

### Resource Profiles

Profiles define constraints on base resources. The framework:
- Loads all profiles from packages
- Makes them available to the validator
- Reports them in the metadata endpoint

Example metadata output:
```json
{
  "resourceType": "CapabilityStatement",
  "rest": [{
    "resource": [{
      "type": "Patient",
      "supportedProfile": [
        "http://hl7.org/fhir/StructureDefinition/Patient",
        "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
      ]
    }]
  }]
}
```

## Common Packages

### Core Specifications

```javascript
packages: [
  // FHIR R4 Core - Base specification
  { 
    package: 'hl7.fhir.r4.core',
    version: '4.0.1',
    npmRegistry: 'https://get-ig.org'
  },
  
  // FHIR R4B Core
  { 
    package: 'hl7.fhir.r4b.core',
    version: '4.3.0',
    npmRegistry: 'https://get-ig.org'
  },
  
  // FHIR R5 Core
  { 
    package: 'hl7.fhir.r5.core',
    version: '5.0.0',
    npmRegistry: 'https://get-ig.org'
  }
]
```

### Regional Profiles

```javascript
packages: [
  // US Core
  { 
    package: 'hl7.fhir.us.core',
    version: '7.0.0',
    remoteUrl: 'https://packages2.fhir.org/packages/hl7.fhir.us.core/7.0.0'
  },
  
  // Canadian Baseline
  { 
    package: 'hl7.fhir.ca.baseline',
    version: '1.0.0',
    npmRegistry: 'https://get-ig.org'
  },
  
  // Australian Base
  { 
    package: 'hl7.fhir.au.base',
    version: '4.1.0',
    npmRegistry: 'https://get-ig.org'
  }
]
```

### Domain-Specific IGs

```javascript
packages: [
  // International Patient Summary
  { 
    package: 'hl7.fhir.uv.ips',
    version: '1.0.0',
    npmRegistry: 'https://get-ig.org'
  },
  
  // Structured Data Capture
  { 
    package: 'hl7.fhir.uv.sdc',
    version: '3.0.0',
    npmRegistry: 'https://get-ig.org'
  },
  
  // Subscriptions Backport
  { 
    package: 'hl7.fhir.uv.subscriptions-backport',
    version: '1.0.0',
    npmRegistry: 'https://get-ig.org'
  }
]
```

## API Reference

### PackageManager Class

The PackageManager provides methods to interact with loaded packages:

```javascript
// Get all profiles for a resource type
const profiles = app.packageManager.getProfilesForResource('Patient');
// Returns: ['http://hl7.org/fhir/StructureDefinition/Patient', ...]

// Get a specific profile
const profile = app.packageManager.getProfile('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');

// Get a value set
const valueSet = app.packageManager.getValueSet('http://hl7.org/fhir/ValueSet/observation-status');

// Get a code system
const codeSystem = app.packageManager.getCodeSystem('http://loinc.org');

// Get base resource definitions
const baseResources = app.packageManager.getBaseResourceDefinitions();
// Returns: Map of resourceType -> StructureDefinition
```

## File System Structure

Packages are stored in the following structure:

```
my-fhir-server/
├── packages/                           # Package storage
│   ├── hl7.fhir.r4.core-4.0.1.tgz    # Downloaded packages
│   ├── hl7.fhir.us.core-7.0.0.tgz
│   └── ...
└── src/
    └── server.js                       # Server configuration
```


## Troubleshooting

### Package Download Fails

**Symptoms:**
- Error message: "Failed to download package"
- Server fails to start

**Solutions:**
1. Check network connectivity
2. Verify the package name and version exist
3. Try using a different download mode (npmRegistry vs remoteUrl)
4. Download manually and place in `packages/` directory

### Package Not Loading

**Symptoms:**
- Package downloads but resources aren't available
- Profiles not showing in metadata

**Solutions:**
1. Check the package `.tgz` file isn't corrupted
2. Verify the package contains expected FHIR resources
3. Check console logs for parsing errors
4. Ensure package.json exists in the tarball

### Profiles Not Validating

**Symptoms:**
- Resources pass validation despite profile constraints
- Validator not recognizing profiles

**Solutions:**
1. Ensure the package containing the profile is loaded
2. Check that validation.strict is enabled
3. Verify the profile URL matches exactly
4. Check profile dependencies are also loaded

## Manual Package Management

If automatic downloading isn't suitable, you can manually manage packages:

1. Download the package `.tgz` file
2. Place it in the `packages/` directory
3. Name it as: `{package-name}-{version}.tgz`
4. The framework will load it on startup

Example:
```bash
# Download package manually
curl -L https://packages2.fhir.org/packages/hl7.fhir.r4.core/4.0.1 \
  -o packages/hl7.fhir.r4.core-4.0.1.tgz

# Start server - package will be loaded
bun run dev
```

## Performance Considerations

### Caching

- Packages are downloaded once and cached as `.tgz` files
- Extracted content is loaded into memory on startup
- No re-download on server restart unless package is deleted

### Memory Usage

- Large packages (like R4 Core) can use significant memory
- Consider loading only necessary packages
- Profile validation adds overhead

### Startup Time

- First start with package downloads may be slow
- Subsequent starts are faster (packages cached)
- Loading many packages increases startup time

## Best Practices

1. **Version Pinning**: Always specify exact versions for reproducibility
2. **Minimal Packages**: Only load packages you actually need
3. **Registry Choice**: Use get-ig.org for official HL7 packages
4. **Testing**: Test with packages in development before production
5. **Documentation**: Document which profiles your server supports
6. **Validation**: Enable strict validation when using profiles

## Future Enhancements

Planned improvements to package management:

- Package dependency resolution
- Incremental loading for faster startup
- Package validation and integrity checks
- Support for custom package registries
- Package update notifications
- CLI commands for package management