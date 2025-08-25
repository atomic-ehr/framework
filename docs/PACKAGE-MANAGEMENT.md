# FHIR IG Package Management

The Atomic framework includes a built-in FHIR Implementation Guide (IG) package manager that loads and manages FHIR packages, making their canonical resources available throughout your application.

## Overview

The Package Manager provides:
- Automatic discovery and loading of FHIR packages
- Registry of canonical resources (StructureDefinitions, OperationDefinitions, ValueSets, CodeSystems)
- API to access and use loaded resources
- Integration with validation and terminology services
- Support for both unpacked directories and `.tgz` archives

## Configuration

Enable package loading in your server configuration:

```javascript
const app = new Atomic({
  packages: {
    enabled: true,           // Enable package loading
    path: 'packages'        // Directory containing packages
  }
});
```

## Package Structure

Packages should follow the standard FHIR package structure:

```
packages/
├── my.package.id/
│   ├── package.json        # Package metadata
│   ├── StructureDefinition-*.json
│   ├── OperationDefinition-*.json
│   ├── ValueSet-*.json
│   ├── CodeSystem-*.json
│   └── SearchParameter-*.json
└── another.package.tgz     # Compressed package
```

### package.json Format

```json
{
  "name": "my.package.id",
  "version": "1.0.0",
  "canonical": "http://example.org/fhir/my-package",
  "dependencies": {
    "hl7.fhir.r4.core": "4.0.1"
  }
}
```

## Loading Packages

Packages are loaded automatically when the server starts:

```javascript
app.start().then(() => {
  console.log('Loaded packages:', app.packageManager.packages);
});
```

### Supported Formats

1. **Unpacked Directories**: Place extracted packages in the packages folder
2. **Compressed Archives**: `.tgz` files are automatically extracted and loaded
3. **NPM Packages**: Download from NPM registry and place in packages folder

## Accessing Loaded Resources

### In Custom Operations

```javascript
import { defineOperation } from '@atomic/framework';

export default defineOperation({
  name: 'custom',
  async handler(params, context) {
    const app = this; // Atomic instance
    
    // Get a specific profile
    const profile = app.packageManager.getProfile(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'
    );
    
    // Get an operation definition
    const opDef = app.packageManager.getOperation('match');
    
    // Get a value set
    const valueSet = app.packageManager.getValueSet(
      'http://hl7.org/fhir/ValueSet/languages'
    );
    
    // Use the loaded resources
    if (profile) {
      console.log(`Using profile: ${profile.name}`);
    }
  }
});
```

### In Resource Hooks

```javascript
import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient',
  hooks: {
    beforeCreate: async (resource, context) => {
      const app = context.app;
      
      // Get all available profiles for Patient
      const profiles = app.packageManager.getProfilesForResource('Patient');
      
      // Validate against a specific profile
      const profileUrl = 'http://example.org/fhir/StructureDefinition/my-patient';
      const result = await app.packageManager.validateAgainstProfile(
        resource, 
        profileUrl
      );
      
      if (!result.valid) {
        throw new Error(`Validation failed: ${result.errors.join(', ')}`);
      }
      
      return resource;
    }
  }
});
```

## Package Manager API

### Core Methods

#### `getProfile(url: string): StructureDefinition`
Get a StructureDefinition by its canonical URL.

```javascript
const profile = packageManager.getProfile(
  'http://hl7.org/fhir/StructureDefinition/Patient'
);
```

#### `getOperation(urlOrCode: string): OperationDefinition`
Get an OperationDefinition by URL or code.

```javascript
// By URL
const op1 = packageManager.getOperation(
  'http://hl7.org/fhir/OperationDefinition/Patient-match'
);

// By code
const op2 = packageManager.getOperation('match');
const op3 = packageManager.getOperation('$match');
```

#### `getValueSet(url: string): ValueSet`
Get a ValueSet by its canonical URL.

```javascript
const vs = packageManager.getValueSet(
  'http://hl7.org/fhir/ValueSet/administrative-gender'
);
```

#### `getCodeSystem(url: string): CodeSystem`
Get a CodeSystem by its canonical URL.

```javascript
const cs = packageManager.getCodeSystem(
  'http://hl7.org/fhir/administrative-gender'
);
```

### Query Methods

#### `getResourcesByType(type: string): Resource[]`
Get all resources of a specific type.

```javascript
const allProfiles = packageManager.getResourcesByType('StructureDefinition');
const allValueSets = packageManager.getResourcesByType('ValueSet');
```

#### `getProfilesForResource(resourceType: string): StructureDefinition[]`
Get all profiles that constrain a specific resource type.

```javascript
const patientProfiles = packageManager.getProfilesForResource('Patient');
// Returns all StructureDefinitions with type='Patient'
```

#### `getOperationsForResource(resourceType: string): OperationDefinition[]`
Get all operations that apply to a resource type.

```javascript
const patientOps = packageManager.getOperationsForResource('Patient');
// Returns operations with resource=['Patient'] or system=true
```

### Validation Methods

#### `validateAgainstProfile(resource, profileUrl): ValidationResult`
Validate a resource against a loaded profile.

```javascript
const result = await packageManager.validateAgainstProfile(
  patientResource,
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'
);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### Package Information

#### `getDependencies(packageId: string): object`
Get package dependencies.

```javascript
const deps = packageManager.getDependencies('hl7.fhir.us.core');
// Returns: { "hl7.fhir.r4.core": "4.0.1", ... }
```

#### `exportResources(): object`
Export all loaded resources for inspection.

```javascript
const all = packageManager.exportResources();
console.log('Loaded profiles:', all.profiles);
console.log('Loaded operations:', all.operations);
```

## Common Packages

### Downloading Official Packages

```bash
# US Core
npm pack hl7.fhir.us.core
mv hl7.fhir.us.core-*.tgz packages/

# International Patient Summary
npm pack hl7.fhir.uv.ips
mv hl7.fhir.uv.ips-*.tgz packages/

# SMART App Launch
npm pack hl7.fhir.uv.smart-app-launch
mv hl7.fhir.uv.smart-app-launch-*.tgz packages/
```

### Package Sources

- **FHIR Package Registry**: https://registry.fhir.org
- **NPM Registry**: https://www.npmjs.com/search?q=hl7.fhir
- **HL7 Downloads**: https://www.hl7.org/fhir/downloads.html

## Use Cases

### 1. Profile-Based Validation

```javascript
// Automatically validate all Patient resources against US Core
defineResource({
  resourceType: 'Patient',
  hooks: {
    beforeCreate: async (resource, context) => {
      const profileUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
      const result = await context.app.packageManager.validateAgainstProfile(
        resource,
        profileUrl
      );
      
      if (!result.valid) {
        throw new ValidationError(result.errors);
      }
      
      return resource;
    }
  }
});
```

### 2. Terminology Services

```javascript
// Expand a value set using loaded CodeSystems
defineOperation({
  name: 'expand',
  resource: 'ValueSet',
  async handler(params) {
    const valueSet = this.packageManager.getValueSet(params.url);
    const expanded = await expandValueSet(valueSet, this.packageManager);
    return expanded;
  }
});
```

### 3. Operation Discovery

```javascript
// List all available operations for a resource
defineOperation({
  name: 'operations',
  async handler(params) {
    const operations = this.packageManager.getOperationsForResource(params.resourceType);
    
    return {
      resourceType: 'Parameters',
      parameter: operations.map(op => ({
        name: 'operation',
        part: [
          { name: 'code', valueString: op.code },
          { name: 'description', valueString: op.description }
        ]
      }))
    };
  }
});
```

## Performance Considerations

1. **Startup Time**: Loading many large packages increases startup time
2. **Memory Usage**: All package resources are kept in memory
3. **Caching**: Package resources are loaded once and cached
4. **Lazy Loading**: Consider implementing lazy loading for large packages

## Best Practices

1. **Version Management**: Pin package versions in dependencies
2. **Validation**: Always validate resources against profiles
3. **Documentation**: Document which packages your server requires
4. **Testing**: Test with the actual packages you'll use in production
5. **Updates**: Regularly update packages to get latest profiles

## Troubleshooting

### Package Not Loading

Check:
- Package has valid `package.json`
- JSON files are valid FHIR resources
- Resources have `url` and `resourceType` properties
- Package directory is in the configured path

### Resource Not Found

Verify:
- Resource URL matches exactly (case-sensitive)
- Package containing resource is loaded
- Resource file is valid JSON

### Validation Failures

Debug:
- Check profile requirements with `getProfile()`
- Verify resource structure matches profile
- Look for missing required elements
- Check cardinality constraints

## Examples

See the `examples/package-aware-server` directory for a complete example of using the package manager with:
- Sample package structure
- Custom operations using loaded resources
- Profile-based validation
- ValueSet expansion

## Future Enhancements

Planned improvements:
- Package dependency resolution
- Automatic package downloading from registry
- Package versioning and updates
- Lazy loading for large packages
- Package validation tools
- GUI for package exploration