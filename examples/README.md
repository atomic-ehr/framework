# Atomic FHIR Server Examples

Learn how to use the Atomic FHIR Server framework through these examples.

## Getting Started

All examples use Bun as the runtime. Install it first:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Examples

### [01-simple-server](./01-simple-server)

**The absolute minimum** - Get a fully-functional FHIR R4 server running in just a few lines.

**Features:**
- ✅ Full FHIR R4 REST API
- ✅ Automatic validation
- ✅ Metadata endpoint
- ✅ All CRUD operations
- ✅ In-memory storage

**Perfect for:**
- Learning the basics
- Quick prototyping
- Testing FHIR concepts

```bash
cd 01-simple-server
bun install
bun run dev
```

### [02-extending-framework](./02-extending-framework)

**Comprehensive extensions** - Learn how to extend the framework with plugins, decorators, and custom types.

**Features:**
- 🔌 Plugin system (4 plugins)
- 🎨 Type system extensions (declaration merging)
- 📝 Decorators (server, request, response)
- 🪝 Custom hooks (metrics, auth, audit)
- 🔐 Authentication (JWT)
- 🚩 Feature flags
- 📊 Database integration
- ✅ Type safety throughout

**Perfect for:**
- Production applications
- Complex requirements
- Team collaboration
- Reusable components

```bash
cd 02-extending-framework
bun install
bun run dev
```

## Comparison

| Feature | 01-simple-server | 02-extending-framework |
|---------|------------------|------------------------|
| Lines of Code | ~30 | ~400 |
| Setup Time | 1 minute | 5 minutes |
| FHIR API | ✅ | ✅ |
| Validation | ✅ | ✅ |
| Plugins | ❌ | ✅ 4 plugins |
| Decorators | ❌ | ✅ All levels |
| Type Safety | Basic | Advanced |
| Authentication | ❌ | ✅ JWT |
| Custom Hooks | ❌ | ✅ 3 hooks |
| Feature Flags | ❌ | ✅ |
| Audit Logging | ❌ | ✅ |
| Production Ready | 🟡 | ✅ |

## Quick Start

### Option 1: Simple Server (Recommended for Learning)

```typescript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],
});

await server.start();
```

### Option 2: Extended Server (Recommended for Production)

```typescript
import { FhirServer, definePlugin } from '@atomic-ehr/server';

// Define plugins
const authPlugin = definePlugin({ /* ... */ });
const auditPlugin = definePlugin({ /* ... */ });

// Create server
const server = new FhirServer({ port: 3000 });

// Register plugins
await server.register(authPlugin);
await server.register(auditPlugin);

// Add decorators
server.decorate('database', db);
server.decorateRequest('user', null);

// Start
await server.start();
```

## Learning Path

1. **Start with Example 1** - Understand the basics
   - How FHIR servers work
   - Basic CRUD operations
   - Validation and metadata

2. **Move to Example 2** - Learn advanced features
   - Plugin architecture
   - Type system extensions
   - Decorators pattern
   - Custom hooks
   - Production patterns

3. **Build Your Own** - Apply what you learned
   - Create custom plugins
   - Extend types for your domain
   - Add business logic
   - Deploy to production

## Common Patterns

### Creating a Plugin

```typescript
import { definePlugin } from '@atomic-ehr/server';

const myPlugin = definePlugin(
  {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'What it does',
  },
  async (context, options) => {
    // Plugin initialization
    return context;
  }
);

await server.register(myPlugin);
```

### Extending Types

```typescript
declare module '@atomic-ehr/core' {
  interface ServerDecorators {
    myService: MyService;
  }

  interface RequestDecorators {
    user: User | null;
  }
}
```

### Adding Hooks

```typescript
server.addHook({
  name: 'my-hook',
  phase: 'preHandler',
  priority: 100,
  async handler(context, next) {
    // Your logic here
    return next();
  }
});
```

## Testing Examples

Each example includes curl commands for testing:

```bash
# Get server capabilities
curl http://localhost:3000/metadata

# Create a resource
curl -X POST http://localhost:3000/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","name":[{"family":"Doe"}]}'

# Search resources
curl http://localhost:3000/Patient

# With authentication (Example 2)
curl -H "Authorization: Bearer valid-token" \
  http://localhost:3000/Patient
```

## Documentation

- [Plugin System Guide](../docs/plugin-system.md)
- [Hook System Guide](../docs/hook-system.md)
- [Configuration Reference](../docs/configuration.md)
- [API Reference](../docs/api-reference.md)

## Need Help?

- 📚 Read the [documentation](../docs)
- 💬 Join [GitHub Discussions](https://github.com/atomic-ehr/framework/discussions)
- 🐛 Report [issues](https://github.com/atomic-ehr/framework/issues)

## Contributing

Want to add an example? See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
