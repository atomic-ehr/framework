/**
 * Example 3: Server with Authentication
 *
 * Demonstrates JWT-based authentication.
 */

import { FhirServer, FhirUnauthorizedError, FhirForbiddenError } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1']
});

// Simple token database (use proper JWT in production)
const validTokens = {
  'admin-token-123': {
    userId: 'admin',
    role: 'administrator',
    permissions: ['read', 'write', 'delete']
  },
  'doctor-token-456': {
    userId: 'doctor1',
    role: 'practitioner',
    permissions: ['read', 'write']
  },
  'readonly-token-789': {
    userId: 'readonly',
    role: 'viewer',
    permissions: ['read']
  }
};

// Authentication hook
server.addHook({
  name: 'bearer-auth',
  phase: 'preRequest',
  priority: 95,
  handler: async (context) => {
    // Skip auth for metadata endpoint
    if (context.url === '/metadata' || context.url.startsWith('/metadata')) {
      return context;
    }

    // Check Authorization header
    const authHeader = context.headers.authorization || context.headers.Authorization;

    if (!authHeader) {
      throw new FhirUnauthorizedError('Authorization header required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new FhirUnauthorizedError('Bearer token required');
    }

    const token = authHeader.substring(7);

    // Validate token
    const user = validTokens[token];

    if (!user) {
      throw new FhirUnauthorizedError('Invalid or expired token');
    }

    // Add user to context
    context.user = user;

    console.log(`✓ Authenticated user: ${user.userId} (${user.role})`);

    return context;
  }
});

// Authorization hook
server.addHook({
  name: 'permission-check',
  phase: 'preHandler',
  priority: 90,
  handler: async (context) => {
    const user = context.user;

    if (!user) {
      return context; // Auth hook will handle
    }

    // Check permissions for write operations
    if (['create', 'update', 'patch'].includes(context.operation)) {
      if (!user.permissions.includes('write')) {
        throw new FhirForbiddenError(
          `User ${user.userId} does not have write permission`
        );
      }
    }

    // Check permissions for delete operations
    if (context.operation === 'delete') {
      if (!user.permissions.includes('delete')) {
        throw new FhirForbiddenError(
          `User ${user.userId} does not have delete permission`
        );
      }
    }

    console.log(`✓ Authorized ${context.operation} for ${user.role}`);

    return context;
  }
});

// Audit logging with user info
server.addHook({
  name: 'audit-with-user',
  phase: 'onResponse',
  priority: 50,
  handler: async (context) => {
    if (['create', 'update', 'delete', 'patch'].includes(context.operation)) {
      const audit = {
        timestamp: new Date().toISOString(),
        userId: context.user?.userId || 'anonymous',
        userRole: context.user?.role,
        action: context.operation,
        resourceType: context.resourceType,
        resourceId: context.params?.id || context.responseBody?.id,
        success: context.statusCode < 400
      };

      console.log('📝 AUDIT:', JSON.stringify(audit));
    }

    return context;
  }
});

await server.start();

console.log('🚀 FHIR Server with auth running on http://localhost:3000');
console.log('\n🔑 Valid Tokens:');
console.log('  admin-token-123    - Admin (read, write, delete)');
console.log('  doctor-token-456   - Doctor (read, write)');
console.log('  readonly-token-789 - Viewer (read only)');
console.log('\nTest commands:');
console.log('  # No auth - should fail');
console.log('  curl http://localhost:3000/Patient');
console.log('\n  # With admin token - should succeed');
console.log('  curl http://localhost:3000/Patient \\');
console.log('    -H "Authorization: Bearer admin-token-123"');
console.log('\n  # Create with readonly token - should fail (403)');
console.log('  curl -X POST http://localhost:3000/Patient \\');
console.log('    -H "Authorization: Bearer readonly-token-789" \\');
console.log('    -H "Content-Type: application/fhir+json" \\');
console.log('    -d \'{"resourceType":"Patient","name":[{"family":"Test"}]}\'');
console.log('\n  # Create with doctor token - should succeed');
console.log('  curl -X POST http://localhost:3000/Patient \\');
console.log('    -H "Authorization: Bearer doctor-token-456" \\');
console.log('    -H "Content-Type: application/fhir+json" \\');
console.log('    -d \'{"resourceType":"Patient","name":[{"family":"Doe","given":["John"]}]}\'');