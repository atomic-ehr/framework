# @atomic-ehr/packages

> Package loader and management for FHIR packages in the Atomic EHR framework

## Overview

`@atomic-ehr/packages` provides functionality for discovering, downloading, loading, and managing FHIR Implementation Guide (IG) packages. It handles the complete lifecycle of FHIR packages from remote registries to in-memory availability.

## Features

- ✅ **Package Discovery** - Find packages in npm-style registries
- ✅ **Automatic Download** - Download packages from registries or direct URLs
- ✅ **Local Caching** - Cache downloaded packages for offline use
- ✅ **Version Management** - Handle multiple versions of the same package
- ✅ **Dependency Resolution** - Automatically load package dependencies
- ✅ **Format Support** - Support for .tgz and .zip package formats
- ✅ **Progress Tracking** - Monitor download and extraction progress
- ✅ **Error Recovery** - Robust error handling and retry logic

## Installation

```bash
bun add @atomic-ehr/packages
```

## Quick Start

```typescript
import { PackageLoader } from '@atomic-ehr/packages';

const loader = new PackageLoader({
  cacheDir: '~/.fhir/packages'
});

// Load a package
const pkg = await loader.load('hl7.fhir.r4.core', '4.0.1');

// Access package contents
const patientDefinition = pkg.getResource('StructureDefinition', 'Patient');
console.log('Patient URL:', patientDefinition.url);

// List all resources
const resources = pkg.getAllResources();
console.log(`Package contains ${resources.length} resources`);
```

## Package Sources

### NPM-style Registry

```typescript
const pkg = await loader.load('hl7.fhir.r4.core', '4.0.1', {
  registry: 'https://packages.fhir.org'
});
```

### Direct URL

```typescript
const pkg = await loader.load('hl7.fhir.us.core', '7.0.0', {
  url: 'https://packages.fhir.org/hl7.fhir.us.core/7.0.0'
});
```

### Local File

```typescript
const pkg = await loader.load('custom.package', '1.0.0', {
  path: './packages/custom.package-1.0.0.tgz'
});
```

## API Reference

### PackageLoader

Main class for package management.

#### Constructor

```typescript
constructor(options?: PackageLoaderOptions)
```

**Options:**
```typescript
interface PackageLoaderOptions {
  cacheDir?: string;           // Cache directory (default: '~/.fhir/packages')
  registry?: string;           // Default registry URL
  timeout?: number;            // Download timeout in ms (default: 60000)
  retries?: number;            // Number of retries on failure (default: 3)
  validateChecksum?: boolean;  // Validate package checksums (default: true)
}
```

#### Methods

##### load()

Load a FHIR package.

```typescript
async load(
  name: string,
  version: string,
  options?: LoadOptions
): Promise<Package>
```

**Load Options:**
```typescript
interface LoadOptions {
  registry?: string;      // Registry URL
  url?: string;          // Direct download URL
  path?: string;         // Local file path
  force?: boolean;       // Force re-download even if cached
}
```

**Example:**
```typescript
// From registry
const pkg1 = await loader.load('hl7.fhir.r4.core', '4.0.1');

// From URL
const pkg2 = await loader.load('hl7.fhir.us.core', '7.0.0', {
  url: 'https://packages.fhir.org/hl7.fhir.us.core/7.0.0'
});

// From local file
const pkg3 = await loader.load('custom.package', '1.0.0', {
  path: './my-package.tgz'
});

// Force refresh
const pkg4 = await loader.load('hl7.fhir.r4.core', '4.0.1', {
  force: true
});
```

##### isLoaded()

Check if a package is already loaded.

```typescript
isLoaded(name: string, version: string): boolean
```

##### getLoaded()

Get a loaded package.

```typescript
getLoaded(name: string, version: string): Package | undefined
```

##### unload()

Unload a package from memory.

```typescript
unload(name: string, version: string): void
```

##### clearCache()

Clear the local package cache.

```typescript
async clearCache(): Promise<void>
```

### Package

Represents a loaded FHIR package.

#### Properties

```typescript
interface Package {
  name: string;              // Package name
  version: string;           // Package version
  type: string;              // Package type (e.g., 'fhir.core')
  description?: string;      // Package description
  fhirVersion?: string;      // FHIR version (e.g., '4.0.1')
  dependencies?: Record<string, string>;  // Package dependencies
}
```

#### Methods

##### getResource()

Get a resource from the package by type and ID.

```typescript
getResource(resourceType: string, id: string): any | undefined
```

**Example:**
```typescript
const patient = pkg.getResource('StructureDefinition', 'Patient');
const nameParam = pkg.getResource('SearchParameter', 'Patient-name');
```

##### getResourcesByType()

Get all resources of a specific type.

```typescript
getResourcesByType(resourceType: string): any[]
```

**Example:**
```typescript
const allStructures = pkg.getResourcesByType('StructureDefinition');
const allSearchParams = pkg.getResourcesByType('SearchParameter');
const allValueSets = pkg.getResourcesByType('ValueSet');
```

##### getAllResources()

Get all resources in the package.

```typescript
getAllResources(): any[]
```

##### hasResource()

Check if a resource exists in the package.

```typescript
hasResource(resourceType: string, id: string): boolean
```

##### getManifest()

Get the package manifest (package.json).

```typescript
getManifest(): PackageManifest
```

## Package Format

FHIR packages follow the NPM package format:

```
package-name-version.tgz
├── package/
│   ├── package.json          # Package manifest
│   ├── StructureDefinition-Patient.json
│   ├── StructureDefinition-Observation.json
│   ├── SearchParameter-Patient-name.json
│   ├── ValueSet-administrative-gender.json
│   └── ... (other resources)
```

### package.json Structure

```json
{
  "name": "hl7.fhir.r4.core",
  "version": "4.0.1",
  "type": "fhir.core",
  "description": "FHIR R4 Core",
  "fhirVersions": ["4.0.1"],
  "dependencies": {},
  "canonical": "http://hl7.org/fhir"
}
```

## Caching

Packages are cached locally to avoid re-downloading:

### Cache Structure

```
~/.fhir/packages/
├── hl7.fhir.r4.core#4.0.1/
│   ├── package.json
│   └── ... (resources)
├── hl7.fhir.us.core#7.0.0/
│   ├── package.json
│   └── ... (resources)
└── custom.package#1.0.0/
    ├── package.json
    └── ... (resources)
```

### Cache Management

```typescript
// Clear all cached packages
await loader.clearCache();

// Force reload a package
await loader.load('hl7.fhir.r4.core', '4.0.1', { force: true });

// Check cache directory
const cacheDir = loader.getCacheDir();
console.log('Packages cached in:', cacheDir);
```

## Dependency Management

The loader automatically resolves and loads package dependencies:

```typescript
// Load US Core (which depends on R4 Core)
const usCore = await loader.load('hl7.fhir.us.core', '7.0.0');

// R4 Core is automatically loaded as a dependency
const r4Core = loader.getLoaded('hl7.fhir.r4.core', '4.0.1');
console.log('Dependency loaded:', r4Core !== undefined);
```

## Progress Tracking

Monitor download and extraction progress:

```typescript
const loader = new PackageLoader({
  onProgress: (event) => {
    console.log(`${event.phase}: ${event.percent}%`);
  }
});

await loader.load('hl7.fhir.r4.core', '4.0.1');
// Output:
// downloading: 25%
// downloading: 50%
// downloading: 75%
// downloading: 100%
// extracting: 50%
// extracting: 100%
```

## Error Handling

The loader provides comprehensive error handling:

```typescript
try {
  await loader.load('non-existent-package', '1.0.0');
} catch (error) {
  if (error instanceof PackageNotFoundError) {
    console.error('Package not found');
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else if (error instanceof InvalidPackageError) {
    console.error('Invalid package format');
  }
}
```

### Error Types

- `PackageNotFoundError` - Package doesn't exist in registry
- `NetworkError` - Network failure during download
- `InvalidPackageError` - Package format is invalid
- `ChecksumError` - Package checksum validation failed
- `DependencyError` - Failed to resolve dependencies

## Advanced Usage

### Custom Registry

```typescript
const loader = new PackageLoader({
  registry: 'https://my-custom-registry.com/packages',
  cacheDir: './local-cache'
});
```

### Authentication

```typescript
const loader = new PackageLoader({
  registry: 'https://private-registry.com/packages',
  auth: {
    token: process.env.REGISTRY_TOKEN
  }
});
```

### Parallel Loading

```typescript
// Load multiple packages in parallel
const packages = await Promise.all([
  loader.load('hl7.fhir.r4.core', '4.0.1'),
  loader.load('hl7.fhir.us.core', '7.0.0'),
  loader.load('hl7.fhir.us.mcode', '3.0.0')
]);

console.log(`Loaded ${packages.length} packages`);
```

### Package Inspection

```typescript
const pkg = await loader.load('hl7.fhir.r4.core', '4.0.1');

// Get package info
console.log('Name:', pkg.name);
console.log('Version:', pkg.version);
console.log('FHIR Version:', pkg.fhirVersion);

// Count resources by type
const structures = pkg.getResourcesByType('StructureDefinition');
const searchParams = pkg.getResourcesByType('SearchParameter');
const valueSets = pkg.getResourcesByType('ValueSet');

console.log(`${structures.length} StructureDefinitions`);
console.log(`${searchParams.length} SearchParameters`);
console.log(`${valueSets.length} ValueSets`);
```

## Integration with Framework

### In Server Configuration

```typescript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: [
    'hl7.fhir.r4.core#4.0.1',
    'hl7.fhir.us.core#7.0.0'
  ]
});
```

The server automatically uses the package loader to:
1. Download packages if not cached
2. Load resource definitions
3. Generate routes for all resource types
4. Create capability statement

### In Custom Code

```typescript
import { PackageLoader } from '@atomic-ehr/packages';

const loader = new PackageLoader();
const pkg = await loader.load('hl7.fhir.r4.core', '4.0.1');

// Get all patient search parameters
const searchParams = pkg.getResourcesByType('SearchParameter')
  .filter(p => p.base.includes('Patient'));

console.log('Patient search parameters:');
searchParams.forEach(param => {
  console.log(`  ${param.name} (${param.type}): ${param.description}`);
});
```

## Performance Considerations

- **Lazy Loading** - Resources are indexed but not parsed until accessed
- **Caching** - Downloaded packages are cached to avoid re-downloads
- **Parallel Loading** - Multiple packages can load simultaneously
- **Memory Management** - Unused packages can be unloaded

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run dev

# Type checking
bun run typecheck

# Tests
bun test

# Clean
bun run clean
```

## Contributing

This package is part of the Atomic EHR framework. See the main repository for contribution guidelines.

## License

MIT © Atomic EHR Team