# Auth Package Autoload Architecture

This package demonstrates the modern autoload-based architecture for embedded FHIR packages, eliminating the need for dedicated seed loader files and manual configuration.

## 🚀 Modern Structure (Recommended)

```
packages/auth/src/
├── package.ts                   # EmbeddedPackageDefinition with SeedProvider
├── register-auth.ts             # Simple registration API (registerAuth/enableAuth)
├── index.ts                     # Exports (legacy functions marked deprecated)
├── seeds/
│   ├── init-bundle.json        # Seed data (automatically detected & loaded)
│   └── index.ts                # Legacy loader (deprecated, for backward compatibility)
├── hooks/
│   └── auth-audit.ts           # Hooks (automatically loaded from directory)
├── middleware/
│   └── security-context.ts     # Middleware (automatically loaded from directory)
├── resources/                  # Resources (automatically loaded from directory)
├── operations/                 # Operations (automatically loaded from directory)
└── ig/
    ├── package.json            # IG dependencies (automatically parsed & loaded)
    └── StructureDefinition/    # FHIR profiles and extensions
```

## ✨ Usage Examples

### New Autoload Approach (Recommended)
```typescript
import { Atomic } from "@atomic-fhir/core";
import { enableAuth } from "@atomic-fhir/auth";

const app = new Atomic(config);

// One line - everything loads automatically in correct order!
await enableAuth(app);

app.start();
```

### Advanced Configuration
```typescript
import { registerAuth } from "@atomic-fhir/auth";

const app = new Atomic(config);

// More control over auth registration
await registerAuth(app, {
  basePath: '/custom-auth',
  enableSeeding: true,
  enableStaticAssets: true,
  staticPath: '/auth-ui'
});
```

### Legacy Approach (Deprecated)
```typescript
// ❌ Old way - manual registration (still works but deprecated)
import { 
  seedAuthData, 
  checkAndRunAutoSeeding, 
  registerAtomicAuthPackage 
} from "@atomic-fhir/auth";

app.hooks.register('beforeStart', async (context) => {
  await registerAtomicAuthPackage(context.packageManager);
  await checkAndRunAutoSeeding(context);
});
```

## 🎯 Autoload Features

### 📦 **Automatic Package Detection**
- ✅ **IG Dependencies**: Scans `ig/package.json` and loads dependencies via canonical manager
- ✅ **Component Discovery**: Auto-loads hooks, middleware, resources, operations from directories  
- ✅ **Seed Detection**: Finds JSON bundles in `seeds/` directory automatically
- ✅ **Type Safety**: Full TypeScript support with embedded package definitions

### 🔄 **Guaranteed Load Order**
1. **IG Dependencies** → Load via canonical manager (e.g., `hl7.fhir.r4.core`)
2. **Package Configuration** → Register search parameters & database entities  
3. **Component Loading** → Load hooks, middleware, resources, operations
4. **Seed Provider Registration** → After database entities exist
5. **Auto-Seeding** → Only if needed, with proper dependency resolution

### ⚡ **Zero Configuration Required**
- No manual seed provider registration
- No manual dependency management  
- No manual load order management
- No dedicated loader files needed

## 🛠️ Implementation Details

### Package Definition (`package.ts`)
```typescript
import { AtomicAuthSeedProvider } from "./seed-provider.js";

const authSeedProvider = new AtomicAuthSeedProvider();

export const AtomicAuthPackageDefinition: EmbeddedPackageDefinition = {
  name: "atomic.fhir.auth",
  version: "1.0.0",
  canonical: "http://atomic-fhir.org/ig/auth",
  dependencies: ["hl7.fhir.r4.core"], // Auto-updated from ig/package.json
  
  // Autoload paths
  structureDefinitions: "ig/StructureDefinition",
  searchParameters: "search-parameters.json", 
  resources: "resources",
  operations: "operations", 
  hooks: "hooks",
  middleware: "middleware",
  seeds: "seeds",
  
  // Custom seed provider with password hashing
  seedProvider: authSeedProvider,
  
  // Configuration runs before seeding
  configure: async (context) => {
    // Register search parameters with database
    // This ensures they exist before seeds can reference them
  }
};
```

### Seed Provider (`package.ts`)
```typescript
export class AtomicAuthSeedProvider implements SeedProvider {
  name = "atomic.fhir.auth";
  version = "1.0.0";

  async getSeedBundles(): Promise<SeedBundle[]> {
    // Uses fs/promises (non-blocking)
    const content = await readFile(seedPath, 'utf8');
    const bundle = JSON.parse(content);
    return bundle.resourceType === 'Bundle' ? [bundle] : [];
  }

  async preprocessResource(resource: any): Promise<any> {
    // Hash passwords and secrets before storing
    if (resource.resourceType === 'Basic') {
      // Auto-hash plain text passwords with bcrypt
    }
    return resource;
  }
}
```

## 📊 Benefits Over Legacy Approach

| Feature | Legacy Approach | Modern Autoload |
|---------|----------------|-----------------|
| **Setup Complexity** | Manual registration of multiple components | Single `enableAuth()` call |
| **Load Order** | Manual dependency management | Automatic proper ordering |
| **Seed Files** | Dedicated `.ts` loader files required | JSON bundles auto-detected |
| **Dependencies** | Manual IG package loading | Auto-parsed from `ig/package.json` |
| **Type Safety** | Partial TypeScript support | Full embedded package types |
| **Error Handling** | Manual error management | Built-in dependency resolution |
| **Maintenance** | High - many files to keep in sync | Low - convention-based structure |

## 🔄 Migration Guide

### From Legacy to Autoload
1. **Replace registration calls**:
   ```typescript
   // Old
   await checkAndRunAutoSeeding(context);
   
   // New  
   await enableAuth(app);
   ```

2. **Remove dedicated seed loaders** (optional - kept for compatibility):
   ```typescript
   // Can remove these imports (still work but deprecated)
   import { seedAuthData, checkAndRunAutoSeeding } from "@atomic-fhir/auth";
   ```

3. **Update package structure** (if creating new packages):
   - Add `package.ts` with `EmbeddedPackageDefinition`
   - Put seed data in JSON files instead of TypeScript loaders
   - Use directory structure for auto-discovery

## 🚧 Backward Compatibility

The auth package maintains full backward compatibility:
- ✅ Legacy functions still exported (marked `@deprecated`)
- ✅ Existing code continues to work unchanged
- ✅ Gradual migration path available
- ✅ No breaking changes

## 📝 Best Practices for Package Authors

### ✅ Do:
- Define `EmbeddedPackageDefinition` in `package.ts`
- Create `seeds/*.json` bundles for data
- Use directory structure for auto-discovery  
- Include `ig/package.json` for dependencies
- Use `fs/promises` for non-blocking file operations

### ❌ Don't:
- Create dedicated seed loader `.ts` files  
- Manually register seed providers
- Use dynamic imports or `readFileSync`
- Manually manage load order
- Duplicate dependency configuration

The autoload system makes package development much simpler while ensuring dependencies and seeding always happen in the correct order! 🎯