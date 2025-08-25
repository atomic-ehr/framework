# Quick Start Guide

Get a FHIR server running in under 60 seconds!

## Installation

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Create a new project
mkdir my-fhir-server
cd my-fhir-server

# Initialize and install Atomic
bun init -y
bun add @atomic/framework
```

## Minimal Server (3 lines!)

Create `server.js`:

```javascript
import { Atomic } from '@atomic/framework';

const app = new Atomic();
app.start();
```

That's it! Run with:

```bash
bun run server.js
```

Your FHIR server is now running at http://localhost:3000

## How It Works

**Autoload is enabled by default!** The framework automatically discovers:

- ✅ Resources from `./resources/`
- ✅ Operations from `./operations/`
- ✅ Middleware from `./middleware/`
- ✅ Hooks from `./hooks/`
- ✅ FHIR packages from `./packages/`

## Adding Components

### Add a Resource

Create `resources/Patient.js`:

```javascript
import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient',
  capabilities: {
    create: true,
    read: true,
    update: true,
    delete: true,
    search: true
  }
});
```

**No registration needed!** It's automatically loaded.

### Add Hooks

Create `hooks/timestamps.js`:

```javascript
import { defineHook } from '@atomic/framework';

export default defineHook({
  name: 'add-timestamps',
  type: 'beforeCreate',
  resources: '*',  // Apply to all resources
  async handler(resource) {
    resource.meta = resource.meta || {};
    resource.meta.lastUpdated = new Date().toISOString();
    return resource;
  }
});
```

**Hooks are automatically discovered and applied!**

### Add an Operation

Create `operations/status.js`:

```javascript
import { defineOperation } from '@atomic/framework';

export default defineOperation({
  name: 'status',
  resource: null,
  type: 'system',
  async handler() {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'information',
        code: 'informational',
        details: { text: 'Server is healthy' }
      }]
    };
  }
});
```

Access it at: `POST http://localhost:3000/$status`

### Add Middleware

Create `middleware/logger.js`:

```javascript
import { defineMiddleware } from '@atomic/framework';

export default defineMiddleware({
  name: 'logger',
  async before(req) {
    console.log(`${req.method} ${req.url}`);
  }
});
```

**Automatically applied to all requests!**

### Add a FHIR Package

Download a package:

```bash
npm pack hl7.fhir.us.core
mv hl7.fhir.us.core-*.tgz packages/
```

Or create `packages/my-profiles/package.json`:

```json
{
  "name": "my-profiles",
  "version": "1.0.0"
}
```

Add your profiles as JSON files in the package directory.

**Packages are loaded automatically on startup!**

## Configuration Options

### Basic Configuration

```javascript
const app = new Atomic({
  server: {
    name: 'My FHIR Server',
    version: '1.0.0',
    port: 3000
  },
  storage: {
    adapter: 'sqlite',
    config: {
      database: './fhir.db'
    }
  }
});
```

### Disable Autoload (Manual Mode)

```javascript
const app = new Atomic({
  autoload: false,  // Disable auto-discovery
  packages: false   // Disable package loading
});

// Now you must register manually
app.registerResource('Patient', patientResource);
app.registerOperation(customOperation);
app.use(middleware);
```

### Custom Paths

```javascript
const app = new Atomic({
  server: {
    port: 3000  // Optional, defaults to 3000
  },
  autoload: {
    paths: {
      resources: 'src/resources',
      operations: 'src/operations',
      middleware: 'src/middleware'
    }
  },
  packages: {
    path: 'fhir-packages'
  }
});
```

## Testing Your Server

### Create a Patient

```bash
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"family": "Smith", "given": ["John"]}],
    "gender": "male",
    "birthDate": "1980-01-01"
  }'
```

### Search Patients

```bash
curl http://localhost:3000/Patient
```

### Get Server Metadata

```bash
curl http://localhost:3000/metadata
```

## Project Structure

Here's the recommended structure (all auto-discovered):

```
my-fhir-server/
├── server.js              # Your 3-line server
├── resources/            # FHIR resources
│   ├── Patient.js
│   └── Observation.js
├── operations/           # Custom operations
│   ├── match.js         # Patient/$match
│   └── export.js        # System/$export
├── middleware/           # HTTP middleware
│   ├── auth.js
│   └── audit.js
└── packages/             # FHIR IG packages
    ├── us-core/
    └── my-profiles.tgz
```

## Next Steps

1. **Add Resources**: Create files in `resources/` folder
2. **Add Operations**: Create files in `operations/` folder
3. **Add Validation**: Use loaded packages for profile validation
4. **Add Storage**: Configure PostgreSQL or MongoDB
5. **Add Authentication**: Implement SMART on FHIR

## Examples

Check out the example servers:

- `examples/minimal-server` - Simplest possible server
- `examples/basic-server` - Basic server with resources and operations
- `examples/us-core-server` - US Core compliant server
- `examples/package-aware-server` - Using FHIR packages

## Tips

1. **File = Component**: One resource/operation/middleware per file
2. **Export Default**: Always use `export default`
3. **Naming**: File name doesn't matter, resource type does
4. **Hot Reload**: Use `bun --watch server.js` for development
5. **Debugging**: Check console for autoload messages

## Troubleshooting

### Components Not Loading?

Check:
- Files are in the correct folders
- Using `export default`
- Valid JavaScript syntax
- Console for error messages

### Need Manual Control?

Disable autoload:
```javascript
const app = new Atomic({ autoload: false });
```

### Package Not Loading?

Ensure:
- Valid `package.json` in package folder
- JSON files have `url` and `resourceType`
- Package is in `packages/` directory

## Get Help

- Documentation: `/docs` folder
- Examples: `/examples` folder
- Issues: GitHub Issues
- Design: `DESIGN.md`