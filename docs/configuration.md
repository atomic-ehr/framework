# Configuration Guide

This guide covers all configuration options for the Atomic FHIR Server, from basic setup to advanced customization.

## Table of Contents

- [Basic Configuration](#basic-configuration)
- [Server Options](#server-options)
- [Package Management](#package-management)
- [Validation Configuration](#validation-configuration)
- [Storage Configuration](#storage-configuration)
- [Error Handling](#error-handling)
- [Request Logging](#request-logging)
- [Security Options](#security-options)
- [Performance Tuning](#performance-tuning)
- [Environment Variables](#environment-variables)
- [Configuration Files](#configuration-files)

## Basic Configuration

### Minimal Setup

The simplest configuration requires only a port and FHIR packages:

```javascript
import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

await server.start();
```

### Common Setup

A typical production configuration:

```javascript
const server = new FhirServer({
  // Server basics
  port: process.env.PORT || 3000,
  host: '0.0.0.0',

  // FHIR packages
  packages: [
    'hl7.fhir.r4.core#4.0.1',
    'hl7.fhir.us.core#7.0.0'
  ],

  // Storage
  storage: {
    type: 'sqlite',
    database: './data/fhir.db'
  },

  // Validation
  validation: {
    enabled: true,
    strictMode: false
  },

  // Logging
  requestLogging: {
    enabled: true,
    format: 'json',
    includeBody: false
  },

  // Error handling
  errorHandling: {
    includeStackTrace: process.env.NODE_ENV !== 'production'
  }
});
```

## Server Options

### Core Server Settings

```typescript
interface FhirServerConfig {
  // Network settings
  port: number;                    // Server port (required)
  host?: string;                   // Bind address (default: 'localhost')

  // Server metadata
  name?: string;                   // Server name (default: 'Atomic FHIR Server')
  version?: string;                // Server version (default: package version)
  description?: string;            // Server description

  // Base URL
  baseUrl?: string;                // Full base URL (e.g., 'https://api.example.com/fhir')

  // Timeouts
  requestTimeout?: number;         // Request timeout in ms (default: 30000)
  shutdownTimeout?: number;        // Graceful shutdown timeout (default: 10000)

  // Concurrency
  maxConnections?: number;         // Max concurrent connections (default: 1000)

  // CORS
  cors?: CorsOptions;              // CORS configuration

  // ... other options
}
```

### Example: Production Server

```javascript
const server = new FhirServer({
  // Production network settings
  port: 443,
  host: '0.0.0.0',
  baseUrl: 'https://fhir.example.com',

  // Server identity
  name: 'Example Health FHIR Server',
  version: '1.0.0',
  description: 'FHIR R4 server for Example Health System',

  // Production timeouts
  requestTimeout: 60000,      // 60 seconds
  shutdownTimeout: 30000,     // 30 seconds

  // Connection limits
  maxConnections: 5000,

  // Enable CORS for web apps
  cors: {
    origin: ['https://app.example.com'],
    credentials: true,
    maxAge: 86400
  }
});
```

### CORS Configuration

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  cors: {
    // Allow specific origins
    origin: [
      'https://app.example.com',
      'https://admin.example.com'
    ],

    // Or allow all origins (development only!)
    // origin: '*',

    // Allow credentials (cookies, auth headers)
    credentials: true,

    // Allowed methods
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],

    // Allowed headers
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID'
    ],

    // Exposed headers
    exposedHeaders: [
      'X-Total-Count',
      'X-Request-ID'
    ],

    // Preflight cache time (seconds)
    maxAge: 86400  // 24 hours
  }
});
```

## Package Management

### Package Loading

FHIR packages provide resource definitions and validation rules:

```javascript
const server = new FhirServer({
  port: 3000,

  packages: [
    // Simple format
    'hl7.fhir.r4.core#4.0.1',

    // Object format with registry
    {
      name: 'hl7.fhir.us.core',
      version: '7.0.0',
      registry: 'https://packages.fhir.org'
    },

    // Direct URL download
    {
      name: 'hl7.fhir.us.core',
      version: '7.0.0',
      url: 'https://packages.fhir.org/hl7.fhir.us.core/7.0.0'
    },

    // Local package file
    {
      name: 'custom.package',
      version: '1.0.0',
      path: './packages/custom.package-1.0.0.tgz'
    }
  ],

  // Package cache directory
  packageCacheDir: '~/.fhir/packages',

  // Package loading options
  packageOptions: {
    // Auto-download missing packages
    autoDownload: true,

    // Validate package integrity
    validateChecksum: true,

    // Package download timeout
    downloadTimeout: 60000
  }
});
```

### Custom Package Registry

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['custom.ig#1.0.0'],

  packageRegistry: {
    // Custom registry URL
    url: 'https://packages.myorg.com',

    // Authentication
    auth: {
      token: process.env.REGISTRY_TOKEN
    },

    // Retry configuration
    retries: 3,
    retryDelay: 1000
  }
});
```

## Validation Configuration

### Validation Options

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  validation: {
    // Enable/disable validation
    enabled: true,

    // Strict mode (all resources must be valid)
    strictMode: false,

    // Validate on operations
    validateOnCreate: true,
    validateOnUpdate: true,
    validateOnPatch: true,

    // Validation depth
    validateNested: true,          // Validate nested resources
    validateReferences: false,     // Validate resource references exist
    validateCardinality: true,     // Check min/max cardinality
    validateRequired: true,        // Check required fields
    validateTypes: true,           // Check data types
    validateValueSets: false,      // Validate against value sets
    validateProfiles: false,       // Validate against declared profiles

    // Error handling
    throwOnInvalid: false,         // Throw error vs return OperationOutcome
    includeWarnings: false,        // Include warnings in validation

    // Custom validators
    customValidators: [
      // Add custom validation functions
    ]
  }
});
```

### Profile Validation

```javascript
const server = new FhirServer({
  port: 3000,
  packages: [
    'hl7.fhir.r4.core#4.0.1',
    'hl7.fhir.us.core#7.0.0'
  ],

  validation: {
    enabled: true,

    // Enable profile validation
    validateProfiles: true,

    // Require profile declaration
    requireProfile: ['Patient', 'Observation'],

    // Default profiles by resource type
    defaultProfiles: {
      Patient: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
      Observation: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation'
    }
  }
});
```

## Storage Configuration

### In-Memory Storage (Default)

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  storage: {
    type: 'memory',

    // Optional: persistence to file
    persistTo: './data/backup.json',
    persistInterval: 60000  // Save every minute
  }
});
```

### SQLite Storage

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  storage: {
    type: 'sqlite',

    // Database file
    database: './data/fhir.db',

    // SQLite options
    options: {
      // Enable WAL mode for better concurrency
      wal: true,

      // Cache size (pages)
      cacheSize: 2000,

      // Busy timeout
      busyTimeout: 5000,

      // Foreign keys
      foreignKeys: true
    },

    // Auto-vacuum
    autoVacuum: true,

    // Backup
    backup: {
      enabled: true,
      interval: 86400000,  // Daily
      destination: './backups/'
    }
  }
});
```

### PostgreSQL Storage

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  storage: {
    type: 'postgresql',

    // Connection
    connection: {
      host: 'localhost',
      port: 5432,
      database: 'fhir',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,

      // SSL
      ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync('./certs/ca.crt')
      }
    },

    // Pool settings
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000
    },

    // Schema
    schema: 'fhir',

    // Indexing
    indexes: {
      // Automatically create indexes for search parameters
      autoCreate: true,

      // Custom indexes
      custom: [
        'CREATE INDEX idx_patient_name ON patient ((data->\'name\'))',
        'CREATE INDEX idx_observation_code ON observation ((data->\'code\'))'
      ]
    }
  }
});
```

### Custom Storage Adapter

```javascript
import { StorageAdapter } from '@atomic-ehr/server';

class CustomStorageAdapter extends StorageAdapter {
  async create(resourceType, resource) {
    // Your implementation
  }

  async read(resourceType, id) {
    // Your implementation
  }

  async update(resourceType, id, resource) {
    // Your implementation
  }

  async delete(resourceType, id) {
    // Your implementation
  }

  async search(resourceType, params) {
    // Your implementation
  }
}

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  storage: {
    type: 'custom',
    adapter: new CustomStorageAdapter()
  }
});
```

## Error Handling

### Error Configuration

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  errorHandling: {
    // Include stack traces (development only!)
    includeStackTrace: process.env.NODE_ENV !== 'production',

    // Include request details in errors
    includeRequestDetails: true,

    // Error format
    format: 'fhir',  // 'fhir' or 'json'

    // Custom error mapping
    errorMap: {
      // Map internal errors to FHIR OperationOutcome codes
      'ValidationError': 'invalid',
      'NotFoundError': 'not-found',
      'UnauthorizedError': 'security',
      'ForbiddenError': 'forbidden'
    },

    // Error handlers
    onError: async (error, context) => {
      // Custom error logging
      await errorLogger.log({
        error,
        requestId: context.requestId,
        url: context.url,
        user: context.user
      });
    }
  }
});
```

### Custom Error Pages

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  errorHandling: {
    // Custom error response
    errorResponse: (error, context) => {
      return {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: error.code || 'exception',
          diagnostics: error.message,
          expression: error.path ? [error.path] : undefined
        }],
        // Custom extension
        extension: [{
          url: 'http://example.org/request-id',
          valueString: context.requestId
        }]
      };
    }
  }
});
```

## Request Logging

### Logging Configuration

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  requestLogging: {
    // Enable logging
    enabled: true,

    // Log format: 'text', 'json', 'combined'
    format: 'json',

    // Log level: 'error', 'warn', 'info', 'debug'
    level: 'info',

    // What to log
    includeBody: false,          // Request/response bodies
    includeHeaders: true,        // Headers
    includeTiming: true,         // Performance metrics
    includeUser: true,           // User info (if authenticated)

    // Redact sensitive data
    redactHeaders: [
      'authorization',
      'cookie',
      'x-api-key'
    ],

    // Log destination
    destination: process.stdout,  // or file path

    // Custom logger
    logger: customLogger,

    // Filter
    filter: (context) => {
      // Don't log health checks
      return context.url !== '/health';
    }
  }
});
```

### Structured Logging

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  requestLogging: {
    enabled: true,
    logger: {
      info: (msg, meta) => logger.info(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
      debug: (msg, meta) => logger.debug(msg, meta)
    }
  }
});
```

## Security Options

### TLS/HTTPS Configuration

```javascript
import fs from 'fs';

const server = new FhirServer({
  port: 443,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  tls: {
    enabled: true,

    // Certificate and key
    cert: fs.readFileSync('./certs/server.crt'),
    key: fs.readFileSync('./certs/server.key'),

    // CA certificate (for client verification)
    ca: fs.readFileSync('./certs/ca.crt'),

    // Require client certificates
    requestCert: false,
    rejectUnauthorized: false,

    // TLS version
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',

    // Cipher suites
    ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384'
  }
});
```

### Security Headers

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  security: {
    // Security headers
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'"
    },

    // Rate limiting (basic)
    rateLimit: {
      enabled: true,
      windowMs: 60000,     // 1 minute
      maxRequests: 100,    // 100 requests per minute
      message: 'Too many requests, please try again later'
    },

    // Request size limits
    maxBodySize: '10mb',
    maxUrlLength: 2048,

    // IP filtering
    allowedIPs: ['127.0.0.1', '192.168.1.0/24'],
    blockedIPs: []
  }
});
```

## Performance Tuning

### Performance Options

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  performance: {
    // Compression
    compression: {
      enabled: true,
      level: 6,           // 0-9, higher = more compression
      threshold: 1024     // Only compress responses > 1KB
    },

    // Caching
    cache: {
      enabled: true,

      // Cache capability statement
      cacheMetadata: true,
      metadataTTL: 3600,  // 1 hour

      // Cache read responses
      cacheReads: true,
      readTTL: 300,       // 5 minutes

      // Cache search results
      cacheSearches: false,  // Usually not recommended
      searchTTL: 60,

      // Cache implementation
      implementation: 'memory',  // or 'redis'

      // Redis config (if using Redis)
      redis: {
        host: 'localhost',
        port: 6379,
        password: process.env.REDIS_PASSWORD
      }
    },

    // Connection pooling
    keepAlive: true,
    keepAliveTimeout: 5000,

    // Request optimization
    etag: true,                    // Enable ETags
    lastModified: true,            // Include Last-Modified header
    conditionalRequests: true      // Support If-None-Match, If-Modified-Since
  }
});
```

### Search Optimization

```javascript
const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],

  search: {
    // Default page size
    defaultPageSize: 20,

    // Maximum page size
    maxPageSize: 100,

    // Maximum total results
    maxResults: 10000,

    // Search timeout
    timeout: 30000,

    // Enable search result caching
    cacheResults: true,
    cacheTTL: 60,

    // Optimize search parameters
    optimizedParameters: [
      'name', 'family', 'given',
      'identifier', 'code'
    ]
  }
});
```

## Environment Variables

Use environment variables for sensitive configuration:

```javascript
import dotenv from 'dotenv';
dotenv.config();

const server = new FhirServer({
  // Server
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || 'localhost',
  baseUrl: process.env.BASE_URL,

  // Database
  storage: {
    type: process.env.DB_TYPE || 'sqlite',
    database: process.env.DB_NAME || './data/fhir.db',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },

  // Security
  tls: {
    enabled: process.env.TLS_ENABLED === 'true',
    cert: process.env.TLS_CERT,
    key: process.env.TLS_KEY
  },

  // Logging
  requestLogging: {
    enabled: process.env.LOG_ENABLED !== 'false',
    level: process.env.LOG_LEVEL || 'info'
  },

  // Error handling
  errorHandling: {
    includeStackTrace: process.env.NODE_ENV !== 'production'
  }
});
```

### Example .env File

```bash
# Server
PORT=3000
HOST=0.0.0.0
BASE_URL=https://fhir.example.com
NODE_ENV=production

# Database
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fhir
DB_USER=fhir_user
DB_PASSWORD=your_password_here

# Security
TLS_ENABLED=true
TLS_CERT=/path/to/cert.pem
TLS_KEY=/path/to/key.pem

# Logging
LOG_ENABLED=true
LOG_LEVEL=info

# Package registry
REGISTRY_TOKEN=your_token_here
```

## Configuration Files

### Using JSON Configuration

```javascript
import fs from 'fs';

const config = JSON.parse(
  fs.readFileSync('./config/production.json', 'utf8')
);

const server = new FhirServer(config);
```

**config/production.json**:
```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "packages": [
    "hl7.fhir.r4.core#4.0.1"
  ],
  "storage": {
    "type": "postgresql",
    "connection": {
      "host": "db.example.com",
      "port": 5432,
      "database": "fhir"
    }
  },
  "validation": {
    "enabled": true,
    "strictMode": false
  }
}
```

### Using YAML Configuration

```javascript
import yaml from 'js-yaml';
import fs from 'fs';

const config = yaml.load(
  fs.readFileSync('./config/production.yaml', 'utf8')
);

const server = new FhirServer(config);
```

**config/production.yaml**:
```yaml
port: 3000
host: 0.0.0.0

packages:
  - hl7.fhir.r4.core#4.0.1
  - hl7.fhir.us.core#7.0.0

storage:
  type: postgresql
  connection:
    host: db.example.com
    port: 5432
    database: fhir

validation:
  enabled: true
  strictMode: false

requestLogging:
  enabled: true
  format: json
  level: info
```

### Environment-Specific Configuration

```javascript
const env = process.env.NODE_ENV || 'development';
const config = require(`./config/${env}.js`);

const server = new FhirServer(config);
```

**config/development.js**:
```javascript
export default {
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],
  storage: { type: 'memory' },
  errorHandling: { includeStackTrace: true },
  requestLogging: { level: 'debug' }
};
```

**config/production.js**:
```javascript
export default {
  port: 443,
  packages: ['hl7.fhir.r4.core#4.0.1'],
  storage: {
    type: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  errorHandling: { includeStackTrace: false },
  requestLogging: { level: 'warn' }
};
```

## Configuration Validation

Validate configuration at startup:

```javascript
import Joi from 'joi';

const configSchema = Joi.object({
  port: Joi.number().port().required(),
  host: Joi.string().hostname(),
  packages: Joi.array().items(Joi.string()).min(1).required(),
  storage: Joi.object({
    type: Joi.string().valid('memory', 'sqlite', 'postgresql').required()
  }).required()
});

const { error, value: config } = configSchema.validate(rawConfig);

if (error) {
  throw new Error(`Configuration error: ${error.message}`);
}

const server = new FhirServer(config);
```

## Summary

Key configuration areas:

1. **Server**: Port, host, timeouts, CORS
2. **Packages**: FHIR package loading and caching
3. **Validation**: Resource validation rules
4. **Storage**: Database configuration and adapters
5. **Error Handling**: Error formatting and logging
6. **Request Logging**: Logging format and destination
7. **Security**: TLS, headers, rate limiting
8. **Performance**: Caching, compression, optimization

Use environment variables and configuration files for different deployment environments! 🚀