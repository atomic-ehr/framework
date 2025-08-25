# FHIR Web Framework Design Document

## Executive Summary

This document outlines the design for **Atomic.js** (working name), a FHIR-native web framework for JavaScript/Bun runtime. The framework takes architectural patterns from Django, Ruby on Rails, Laravel, and modern Go frameworks, adapting them specifically for FHIR (Fast Healthcare Interoperability Resources) development.

The key innovation is that instead of traditional models, controllers, and routes, Atomic.js uses FHIR resources as its core building blocks: StructureDefinitions for models, OperationDefinitions for business logic, CapabilityStatements for API contracts, and Implementation Guides for modular extensions.

## Core Philosophy

### Principles
1. **FHIR-First**: Every architectural decision prioritizes FHIR compliance and best practices
2. **Convention over Configuration**: Sensible defaults for FHIR servers with override capability
3. **Developer Experience**: Familiar patterns from popular frameworks adapted for healthcare
4. **Extensibility**: Plugin architecture supporting FHIR Implementation Guides
5. **Type Safety**: Leverage TypeScript and FHIR types for compile-time safety
6. **Performance**: Optimized for Bun runtime with native PostgreSQL support

## Architecture Overview

### Framework Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│         (FHIR Resources, Operations, Searches)          │
├─────────────────────────────────────────────────────────┤
│                    Framework Core                        │
│   (Router, Validator, Storage, Middleware, Extensions)  │
├─────────────────────────────────────────────────────────┤
│                    Runtime Layer                         │
│              (Bun Runtime, PostgreSQL, HTTP)                │
└─────────────────────────────────────────────────────────┘
```

## Core Components Mapping

### Traditional MVC → FHIR Architecture

| Traditional | FHIR Equivalent | Purpose |
|------------|-----------------|---------|
| Model | StructureDefinition | Define resource schemas and constraints |
| View | Resource Representations | JSON/XML serialization with profiles |
| Controller | OperationDefinition | Custom business logic and operations |
| Routes | CapabilityStatement | API surface and interaction patterns |
| Migrations | Profile Evolution | StructureDefinition versioning |
| Middleware | FHIR Interceptors | Security, audit, transformation |
| Plugins | Implementation Guides | Modular feature sets |

## Project Structure

```
my-fhir-app/
├── fhir.config.js                    # Framework configuration
├── capability-statement.json         # Server capabilities
├── resources/                        # FHIR resource definitions
│   ├── Patient/
│   │   ├── structure-definition.json # Resource profile
│   │   ├── operations/              # Custom operations
│   │   │   ├── $match.js           # Patient matching operation
│   │   │   └── $everything.js      # Everything operation
│   │   ├── searches/                # Search parameters
│   │   │   └── custom-searches.js
│   │   ├── validators/              # Custom validation rules
│   │   │   └── patient-validator.js
│   │   └── hooks/                   # Lifecycle hooks
│   │       ├── before-create.js
│   │       └── after-update.js
│   ├── Observation/
│   └── Medication/
├── operations/                       # Global operations
│   ├── $export.js                  # Bulk data export
│   └── $import.js                  # Bulk data import
├── middleware/                       # Request interceptors
│   ├── auth.js                     # Authentication
│   ├── audit.js                    # Audit logging
│   └── consent.js                  # Consent checking
├── extensions/                       # Implementation guides
│   ├── us-core/                    # US Core IG
│   │   ├── ig.manifest.json
│   │   └── resources/
│   └── custom-ig/                  # Custom IG
├── storage/                         # Storage adapters
│   ├── adapters/
│   │   ├── sqlite.js              # Default SQLite adapter
│   │   └── postgres.js            # PostgreSQL adapter
│   └── migrations/                 # Database migrations
└── tests/                          # Test suites
    ├── resources/
    └── operations/
```

## Core Framework APIs

### 1. Resource Definition API

```javascript
// resources/Patient/index.js
import { defineResource } from '@atomic/core';

export default defineResource({
  // Auto-loaded from structure-definition.json
  structureDefinition: './structure-definition.json',
  
  // Resource capabilities (hooks are now in separate files)
  capabilities: {
    create: true,
    read: true,
    update: true,
    delete: true,
    search: true,
    history: true
  },
  
  // Custom search parameters
  searches: {
    'insurance-provider': {
      type: 'reference',
      path: 'coverage.insurer',
      target: ['Organization']
    }
  },
  
  // Custom validators beyond StructureDefinition
  validators: {
    async validateSSN(patient) {
      const ssn = patient.identifier?.find(id => id.system === 'http://hl7.org/fhir/sid/us-ssn');
      if (ssn && !isValidSSN(ssn.value)) {
        throw new ValidationError('Invalid SSN format');
      }
    }
  },
  
  // Resource-specific middleware
  middleware: [
    requireConsent,
    auditAccess
  ]
});
```

### 2. Operation Definition API

```javascript
// resources/Patient/operations/$match.js
import { defineOperation } from '@atomic/core';

export default defineOperation({
  name: 'match',
  resource: 'Patient',
  type: 'type', // 'type' | 'instance' | 'system'
  
  parameters: {
    input: [
      {
        name: 'resource',
        type: 'Patient',
        min: 1,
        max: '1'
      },
      {
        name: 'onlyCertainMatches',
        type: 'boolean',
        min: 0,
        max: '1'
      }
    ],
    output: [
      {
        name: 'return',
        type: 'Bundle',
        min: 1,
        max: '1'
      }
    ]
  },
  
  async handler(params, context) {
    const { resource, onlyCertainMatches } = params;
    
    // Matching logic
    const matches = await this.storage.searchPatients({
      name: resource.name,
      birthDate: resource.birthDate,
      identifier: resource.identifier
    });
    
    // Score and filter matches
    const scored = matches.map(match => ({
      resource: match,
      score: calculateMatchScore(resource, match)
    }));
    
    const filtered = onlyCertainMatches 
      ? scored.filter(m => m.score > 0.95)
      : scored;
    
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: filtered.map(({ resource, score }) => ({
        resource,
        search: { mode: 'match', score }
      }))
    };
  }
});
```

### 3. Middleware System

```javascript
// middleware/consent.js
import { defineMiddleware } from '@atomic/core';

export default defineMiddleware({
  name: 'consent-check',
  
  // Middleware can be scoped
  scope: {
    resources: ['Patient', 'Observation'],
    operations: ['read', 'search']
  },
  
  async before(request, context) {
    const consent = await checkConsent(
      context.user,
      request.resource,
      request.operation
    );
    
    if (!consent.granted) {
      throw new ForbiddenError('No active consent');
    }
    
    // Add consent to context for downstream use
    context.consent = consent;
  },
  
  async after(response, context) {
    // Log access for audit
    await auditLog.record({
      user: context.user,
      resource: response.resource,
      consent: context.consent,
      timestamp: new Date()
    });
    
    return response;
  }
});
```

### 4. Hooks System (Separated Lifecycle Management)

The hooks system provides separated lifecycle event handling, allowing hooks to be defined independently from resources and applied globally, to specific resources, or to groups of resources.

```javascript
// hooks/timestamps.js
import { defineHook } from '@atomic/core';

// Global hook - applies to all resources
export default defineHook({
  name: 'add-timestamps',
  type: 'beforeCreate',
  resources: '*',  // Apply to all resources
  priority: 10,    // Higher priority executes first
  
  async handler(resource, context) {
    resource.meta = resource.meta || {};
    resource.meta.lastUpdated = new Date().toISOString();
    return resource;  // Return modified resource for 'before' hooks
  }
});
```

```javascript
// hooks/patient-validation.js
// Resource-specific hook
export default defineHook({
  name: 'patient-mrn',
  type: 'beforeCreate',
  resources: 'Patient',  // Only for Patient resources
  
  async handler(resource, context) {
    if (!resource.identifier) {
      resource.identifier = [{
        system: 'http://example.org/mrn',
        value: generateMRN()
      }];
    }
    return resource;
  }
});
```

```javascript
// hooks/clinical-audit.js
// Multi-resource hook
export default defineHook({
  name: 'clinical-audit',
  type: 'afterCreate',
  resources: ['Observation', 'Condition', 'Procedure'],
  
  async handler(resource, context) {
    await auditLog.create({
      type: 'clinical-resource-created',
      resource: `${resource.resourceType}/${resource.id}`,
      user: context.req.user,
      timestamp: new Date()
    });
  }
});
```

#### Hook Types and Execution Order

1. **Hook Types**:
   - `beforeCreate` / `afterCreate`
   - `beforeUpdate` / `afterUpdate`
   - `beforeDelete` / `afterDelete`
   - `beforeValidate` / `afterValidate`
   - `beforeRead` / `afterRead`
   - `beforeSearch` / `afterSearch`

2. **Execution Order**:
   - Global hooks execute first (`resources: '*'`)
   - Resource-specific hooks execute next
   - Within each group, hooks execute by priority (highest first)
   - 'before' hooks can modify and return the resource
   - 'after' hooks are for side effects only

3. **Context Object**:
   - `req`: HTTP request object
   - `storage`: Storage manager instance
   - `user`: Authenticated user (if available)
   - Custom context properties

### 5. Storage Adapter API

```javascript
// storage/adapters/custom.js
import { StorageAdapter } from '@atomic/core';

export class CustomStorageAdapter extends StorageAdapter {
  async create(resourceType, resource) {
    // Implementation
  }
  
  async read(resourceType, id) {
    // Implementation
  }
  
  async update(resourceType, id, resource) {
    // Implementation
  }
  
  async delete(resourceType, id) {
    // Implementation
  }
  
  async search(resourceType, params) {
    // Complex search implementation
    // Handle chaining, modifiers, includes
  }
  
  async history(resourceType, id, options) {
    // Version history
  }
  
  async transaction(bundle) {
    // FHIR transaction/batch processing
  }
}
```

### 5. Implementation Guide (Extension) System

```javascript
// extensions/us-core/index.js
import { defineImplementationGuide } from '@atomic/core';

export default defineImplementationGuide({
  id: 'us-core',
  version: '5.0.1',
  
  // IG dependencies
  dependencies: [
    { id: 'hl7.fhir.r4.core', version: '4.0.1' }
  ],
  
  // Profile definitions
  profiles: [
    './profiles/us-core-patient.json',
    './profiles/us-core-observation.json'
  ],
  
  // Value sets
  valueSets: [
    './valuesets/us-core-race.json',
    './valuesets/us-core-ethnicity.json'
  ],
  
  // Search parameters
  searchParameters: [
    './search/us-core-patient-race.json'
  ],
  
  // Custom operations
  operations: [
    './operations/us-core-fetch-all.js'
  ],
  
  // IG-specific configuration
  configure(app) {
    // Add US Core specific middleware
    app.use(usCoreMustSupport);
    
    // Register US Core validators
    app.validator.register('Patient', usCorePatientValidator);
    
    // Add US Core specific routes
    app.route('/Patient/$us-core-fetch', fetchAllOperation);
  }
});
```

## CLI Tool (Atomic CLI)

```bash
# Project initialization
atomic new my-fhir-server
atomic new my-fhir-server --ig us-core,mcode

# Resource generation
atomic generate resource Patient
atomic generate resource Observation --profile us-core

# Operation generation
atomic generate operation Patient/$match
atomic generate operation $export --system

# Migration management
atomic migrate create add_patient_fields
atomic migrate run
atomic migrate rollback

# Development server
atomic dev                    # Start development server
atomic dev --port 3000       # Custom port
atomic dev --inspect         # Enable debugging

# Testing
atomic test                  # Run all tests
atomic test Patient         # Test specific resource
atomic test:operations      # Test operations

# Implementation Guide management
atomic ig add us-core@5.0.1
atomic ig remove us-core
atomic ig list

# Validation
atomic validate             # Validate all resources
atomic validate Patient/123 # Validate specific resource

# Build and deployment
atomic build               # Production build
atomic deploy             # Deploy to cloud
```

## Configuration System

```javascript
// fhir.config.js
export default {
  // Server metadata
  server: {
    name: 'My FHIR Server',
    version: '1.0.0',
    fhirVersion: '4.0.1',
    url: process.env.BASE_URL || 'http://localhost:3000'
  },
  
  // Autoload is enabled by default!
  // Set to false to disable, or customize paths:
  autoload: {
    enabled: true, // Default: true
    paths: {
      resources: 'resources',
      operations: 'operations',
      middleware: 'middleware'
    }
  },
  
  // Package loading is enabled by default!
  packages: {
    enabled: true, // Default: true
    path: 'packages'
  },
  
  // Storage configuration
  storage: {
    adapter: 'sqlite', // 'sqlite' | 'postgres' | 'mongodb' | custom
    config: {
      database: './data/fhir.db',
      // Connection options
    }
  },
  
  // Security configuration
  security: {
    cors: {
      enabled: true,
      origins: ['*']
    },
    authentication: {
      type: 'oauth2', // 'basic' | 'oauth2' | 'smart' | custom
      config: {
        issuer: process.env.OAUTH_ISSUER,
        audience: process.env.OAUTH_AUDIENCE
      }
    }
  },
  
  // Validation settings
  validation: {
    strict: true,
    profiles: ['us-core'],
    schemaLocation: './schemas'
  },
  
  // Feature flags
  features: {
    bulkData: true,
    subscription: true,
    graphql: false,
    smartOnFhir: true
  },
  
  // Performance tuning
  performance: {
    maxBundleSize: 100,
    defaultPageSize: 20,
    caching: {
      enabled: true,
      ttl: 3600
    }
  },
  
  // Implementation Guides
  implementationGuides: [
    'us-core@5.0.1',
    './extensions/custom-ig'
  ],
  
  // Middleware pipeline
  middleware: [
    'cors',
    'requestId',
    'authentication',
    'authorization',
    'consent',
    'audit'
  ]
};
```

## Advanced Features

### 1. Subscription Support

```javascript
// Auto-generated from FHIR Subscription resource
app.subscription.register({
  criteria: 'Observation?patient=Patient/123&code=85354-9',
  channel: {
    type: 'rest-hook',
    endpoint: 'https://webhook.site/...',
    header: ['Authorization: Bearer secret']
  }
});
```

### 2. Bulk Data Operations

```javascript
// Implements FHIR Bulk Data Access IG
app.bulkData.configure({
  maxFileSize: '1GB',
  outputFormat: 'ndjson',
  storage: 's3://my-bucket/exports'
});
```

### 3. GraphQL Support

```javascript
// Optional GraphQL interface
app.graphql.enable({
  endpoint: '/graphql',
  playground: true
});
```

### 4. SMART on FHIR

```javascript
// SMART App Launch Framework
app.smart.configure({
  issuer: 'https://auth.example.com',
  capabilities: [
    'launch-ehr',
    'patient-read',
    'offline-access'
  ]
});
```

### 5. Profiling and Validation

```javascript
// Runtime profiling system
const validator = app.validator;

// Validate against base spec
await validator.validate(resource);

// Validate against profile
await validator.validate(resource, 'us-core-patient');

// Validate operation parameters
await validator.validateOperation('Patient/$match', params);
```

## Testing Framework

```javascript
// tests/resources/Patient.test.js
import { describe, test, expect } from '@atomic/test';

describe('Patient Resource', () => {
  test('should create patient with valid data', async ({ client }) => {
    const patient = {
      resourceType: 'Patient',
      name: [{ 
        family: 'Test',
        given: ['John']
      }]
    };
    
    const response = await client.create('Patient', patient);
    
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });
  
  test('should search patients by name', async ({ client }) => {
    const bundle = await client.search('Patient', {
      name: 'Test'
    });
    
    expect(bundle.type).toBe('searchset');
    expect(bundle.entry).toHaveLength(1);
  });
  
  test('should execute $match operation', async ({ client }) => {
    const result = await client.operation('Patient/$match', {
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'Test' }]
      }
    });
    
    expect(result.resourceType).toBe('Bundle');
  });
});
```

## Deployment Architecture

### Production Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  fhir-server:
    image: atomic/fhir-server
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    
  postgres:
    image: postgres:14
    environment:
      - POSTGRES_DB=fhir
      - POSTGRES_PASSWORD=secret
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Scaling Strategy

```javascript
// Horizontal scaling with cluster mode
import { cluster } from '@atomic/core';

cluster.configure({
  workers: 'auto', // Uses CPU cores
  gracefulShutdown: true,
  healthCheck: '/health'
});
```

## Extensibility Architecture

### Plugin System

```javascript
// plugins/custom-plugin.js
export default {
  name: 'custom-audit',
  version: '1.0.0',
  
  install(app, options) {
    // Add custom functionality
    app.on('resource:created', async (resource) => {
      await sendToAuditSystem(resource);
    });
    
    // Register custom routes
    app.route('/audit/report', auditReportHandler);
    
    // Add custom validators
    app.validator.extend('customRule', validator);
  }
};
```

### Event System

```javascript
// Global event emitter for extensibility
app.on('resource:created', handler);
app.on('resource:updated', handler);
app.on('resource:deleted', handler);
app.on('operation:executed', handler);
app.on('search:performed', handler);
app.on('transaction:completed', handler);
```

## Performance Optimizations

### 1. Built-in Caching

```javascript
// Resource-level caching
app.cache.configure({
  strategy: 'lru',
  maxSize: '100MB',
  ttl: 3600,
  resources: {
    'Patient': { ttl: 7200 },
    'Observation': { ttl: 1800 }
  }
});
```

### 2. Query Optimization

```javascript
// Automatic query optimization
app.storage.optimizer.enable({
  indexing: 'auto',
  queryPlanning: true,
  explainThreshold: 100 // ms
});
```

### 3. Streaming Support

```javascript
// Large bundle streaming
app.streaming.enable({
  threshold: '10MB',
  format: 'ndjson'
});
```

## Security Features

### 1. Built-in Security Headers

```javascript
app.security.headers({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'"
});
```

### 2. Rate Limiting

```javascript
app.rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests'
});
```

### 3. Audit Logging

```javascript
app.audit.configure({
  events: ['create', 'update', 'delete', 'search'],
  storage: 'database', // or 'file', 'syslog'
  format: 'FHIR AuditEvent'
});
```

## Roadmap and Future Enhancements

### Phase 1: Core Framework (Months 1-3)
- [x] Framework architecture design
- [ ] Core routing and middleware system
- [ ] StructureDefinition-based validation
- [ ] SQLite storage adapter
- [ ] Basic CRUD operations
- [ ] Search parameter support

### Phase 2: Advanced Features (Months 4-6)
- [ ] OperationDefinition support
- [ ] CapabilityStatement auto-generation
- [ ] Implementation Guide system
- [ ] PostgreSQL adapter
- [ ] Transaction/Batch support
- [ ] History and versioning

### Phase 3: Enterprise Features (Months 7-9)
- [ ] Subscription support
- [ ] Bulk Data operations
- [ ] SMART on FHIR
- [ ] GraphQL interface
- [ ] Clustering support
- [ ] Advanced caching

### Phase 4: Ecosystem (Months 10-12)
- [ ] Plugin marketplace
- [ ] Cloud deployment tools
- [ ] Monitoring dashboard
- [ ] Performance profiler
- [ ] Migration tools from other FHIR servers
- [ ] Comprehensive documentation

## Conclusion

Atomic.js represents a paradigm shift in FHIR application development by treating FHIR resources as first-class citizens rather than adapting traditional MVC patterns. By leveraging Bun's performance characteristics and learning from successful web frameworks, we can create a developer experience that is both familiar and optimized for healthcare interoperability.

The framework's extensibility through Implementation Guides, combined with its convention-over-configuration approach, will enable rapid development of compliant FHIR servers while maintaining the flexibility needed for complex healthcare workflows.

## Appendix: Technology Choices

### Why Bun?
- **Performance**: Faster startup and execution than Node.js
- **Built-in TypeScript**: No compilation step needed
- **Native SQLite**: Perfect for development and small deployments
- **Modern APIs**: Fetch, WebSocket, and other web standards built-in
- **Package management**: Fast, reliable package installation

### Why SQLite Default?
- **Zero configuration**: Works out of the box
- **Portability**: Single file database
- **Performance**: Excellent for read-heavy FHIR workloads
- **JSON support**: Native JSON functions for FHIR resources
- **Production ready**: Used by many production applications

### Why StructureDefinition-First?
- **FHIR native**: Aligns with FHIR's own modeling approach
- **Validation**: Built-in validation from profiles
- **Interoperability**: Profiles are shareable and reusable
- **Tooling**: Existing FHIR tools understand StructureDefinitions
- **Evolution**: Natural versioning and extension mechanism