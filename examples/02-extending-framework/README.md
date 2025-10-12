# Example 2: Extending the Framework

Comprehensive example demonstrating all extension capabilities of the Atomic FHIR Server.

## What This Example Shows

### 1. **Type System Extensions**
Using TypeScript declaration merging to extend framework types:

```typescript
declare module '@atomic-ehr/core' {
  interface ServerDecorators {
    database: Database;
    authenticate(token: string): Promise<User | null>;
  }

  interface RequestDecorators {
    user: User | null;
    requestStart: number;
  }

  interface ResponseDecorators {
    sendSuccess(data: any): void;
    sendError(error: Error): void;
  }
}
```

### 2. **Plugin System**
Four plugins demonstrating different patterns:

- **Database Plugin** - External service integration
- **Authentication Plugin** - Security and auth
- **Feature Flags Plugin** - Configuration-driven features
- **Response Helpers Plugin** - Utility functions

### 3. **Decorators**
Three levels of decorators:

- **Server Decorators** - `server.database`, `server.authenticate()`
- **Request Decorators** - `context.user`, `context.requestStart`
- **Response Decorators** - `context.sendSuccess()`, `context.sendError()`

### 4. **Custom Hooks**
Lifecycle hooks for:

- Request metrics and logging
- Feature flag validation
- Audit trail generation
- Authentication checks

### 5. **Plugin Dependencies**
Authentication plugin depends on database plugin, showing dependency management.

## Running the Example

```bash
cd examples/02-extending-framework
bun install
bun run dev
```

## Making Requests

### Unauthenticated Request
```bash
curl http://localhost:3000/Patient
```

### Authenticated Request
```bash
curl -H "Authorization: Bearer valid-token" \
  http://localhost:3000/Patient
```

### With Invalid Token
```bash
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:3000/Patient
```

## Code Structure

```
02-extending-framework/
├── server.ts              # Main server with all extensions
├── package.json
└── README.md
```

All code is in a single file for easy understanding, organized as:

1. **Type Extensions** - TypeScript declarations
2. **Custom Types** - Interface definitions
3. **Plugins** - 4 plugin definitions
4. **Server Setup** - Registration and configuration

## Key Concepts Demonstrated

### Plugin Registration
```typescript
await server.register(myPlugin, {
  config: { /* options */ }
});
```

### Type-Safe Decorators
```typescript
// After declaration merging, this is fully typed:
server.decorate('database', databaseConnection);
const db = server.database; // TypeScript knows the type!
```

### Request Context Augmentation
```typescript
server.addHook({
  name: 'auth',
  phase: 'preHandler',
  async handler(context, next) {
    // Type-safe access to custom properties
    context.user = await server.authenticate(token);
    return next();
  }
});
```

### Plugin Dependencies
```typescript
const authPlugin = definePlugin({
  name: 'auth',
  dependencies: ['database'] // Must be registered after database
}, ...);
```

## What You'll Learn

1. ✅ How to extend the framework type system
2. ✅ How to create reusable plugins
3. ✅ How to add decorators at all levels
4. ✅ How to manage plugin dependencies
5. ✅ How to create custom hooks
6. ✅ How to augment request/response contexts
7. ✅ How to maintain type safety throughout

## Comparison with Simple Server

| Feature | Example 1 | Example 2 |
|---------|-----------|-----------|
| FHIR API | ✅ | ✅ |
| Validation | ✅ | ✅ |
| Plugins | ❌ | ✅ 4 plugins |
| Decorators | ❌ | ✅ All levels |
| Type Extensions | ❌ | ✅ Full merging |
| Custom Hooks | ❌ | ✅ 3 hooks |
| Auth | ❌ | ✅ JWT |
| Feature Flags | ❌ | ✅ |
| Audit Logging | ❌ | ✅ |

## Next Steps

After understanding this example:

1. Create your own plugins for specific features
2. Extend the type system for your domain
3. Build reusable plugin packages
4. Share plugins with the community

## Related Documentation

- [Plugin System Guide](../../docs/plugin-system.md)
- [Hook System Guide](../../docs/hook-system.md)
- [Configuration Reference](../../docs/configuration.md)
