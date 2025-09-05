# @atomic-fhir/auth

Authentication and authorization module for Atomic FHIR framework.

## Installation

```bash
bun add @atomic-fhir/auth
```

## Basic Usage

### Simple JWT Authentication

```typescript
import { Atomic } from '@atomic-fhir/core';
import { AuthManager, JWTStrategy } from '@atomic-fhir/auth';

const app = new Atomic({
  port: 3000,
  storage: {
    adapter: 'sqlite',
    options: { filename: 'fhir.db' }
  }
});

// Configure authentication
const authManager = new AuthManager({
  strategy: new JWTStrategy({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    issuer: 'my-fhir-server',
    audience: 'fhir-clients'
  })
});

// Apply authentication middleware
app.use(authManager.middleware());

await app.start();
```

### OAuth 2.0 / SMART on FHIR

```typescript
import { OAuth2Strategy, SMARTonFHIRStrategy } from '@atomic-fhir/auth';

const authManager = new AuthManager({
  strategy: new SMARTonFHIRStrategy({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: 'http://localhost:3000/auth/callback',
    scopes: ['patient/*.read', 'user/*.read']
  })
});
```

### Custom Authentication Strategy

```typescript
import { AuthStrategy, AuthContext } from '@atomic-fhir/auth';

class CustomStrategy extends AuthStrategy {
  async authenticate(token: string, context: AuthContext) {
    // Custom authentication logic
    const user = await this.validateToken(token);
    if (!user) {
      throw new Error('Invalid token');
    }
    
    return {
      user,
      permissions: this.getUserPermissions(user)
    };
  }
}

const authManager = new AuthManager({
  strategy: new CustomStrategy()
});
```

### Resource-Level Authorization

```typescript
import { defineResource } from '@atomic-fhir/core';
import { requirePermission } from '@atomic-fhir/auth';

defineResource({
  resourceType: 'Patient',
  middleware: [
    requirePermission('patient.read')
  ],
  handlers: {
    async read(req, context) {
      // Only users with 'patient.read' permission can access
      return await context.storage.read('Patient', req.params.id);
    }
  }
});
```

### Authentication Hooks

```typescript
import { defineHook } from '@atomic-fhir/core';
import { AuthHook } from '@atomic-fhir/auth';

defineHook({
  name: 'audit-auth',
  type: 'afterAuthenticate',
  resources: '*',
  async handler(authResult, context) {
    // Log authentication events
    console.log(`User ${authResult.user.id} authenticated`);
    
    // Add user context to all subsequent operations
    context.user = authResult.user;
  }
});
```

## Features

- **Multiple Authentication Strategies**
  - JWT (JSON Web Tokens)
  - OAuth 2.0
  - SMART on FHIR
  - Custom strategies

- **Flexible Authorization**
  - Role-based access control (RBAC)
  - Resource-level permissions
  - Scope-based authorization
  - Custom authorization policies

- **Session Management**
  - Token storage and validation
  - Session persistence
  - Token refresh handling

- **Security Features**
  - Password hashing with bcrypt
  - Secure token generation
  - CORS handling
  - Rate limiting integration

## API Reference

### AuthManager

Main class for managing authentication.

```typescript
interface AuthManagerConfig {
  strategy: AuthStrategy;
  storage?: TokenStorage;
  sessionTimeout?: number;
}
```

### AuthStrategy

Base class for authentication strategies.

```typescript
abstract class AuthStrategy {
  abstract authenticate(token: string, context: AuthContext): Promise<AuthResult>;
}
```

### Middleware Functions

- `requireAuth()` - Require authentication for routes
- `requirePermission(permission: string)` - Require specific permission
- `requireRole(role: string)` - Require specific role
- `allowAnonymous()` - Allow anonymous access

## Directory Structure

```
packages/auth/
├── src/
│   ├── core/           # Core authentication classes
│   ├── strategies/     # Authentication strategy implementations
│   ├── middleware/     # Request middleware
│   ├── storage/        # Token/session storage adapters
│   ├── hooks/          # Authentication lifecycle hooks
│   └── types/          # TypeScript type definitions
├── tests/              # Test files
├── examples/           # Usage examples
└── docs/               # Additional documentation
```

## Development

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Run tests
bun test

# Type checking
bun run typecheck

# Watch mode for development
bun run dev
```

## Contributing

See the main [framework repository](https://github.com/atomic-fhir/framework) for contribution guidelines.

## License

MIT License - see LICENSE file for details.