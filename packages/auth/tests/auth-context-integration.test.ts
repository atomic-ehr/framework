import { test, expect, describe } from 'bun:test';
import type { HandlerContext } from '@atomic-fhir/core';
import { createAuthenticatedContext } from '../src/core/auth-context.ts';
import { AuthenticationError, AuthorizationError } from '../src/types/index.ts';
import type { AuthenticatedUser, AuthenticatedContext } from '../src/types/index.ts';
import { FHIRPermissionManager } from '../src/core/permissions.ts';

// Mock FHIR handler functions to demonstrate integration
async function handlePatientRead(req: Request, context: AuthenticatedContext): Promise<Response> {
  // Step 1: Check authentication
  if (!context.isAuthenticated) {
    throw new AuthenticationError('Authentication required');
  }

  // Step 2: Check permissions
  if (!context.checkPermission('Patient', 'read')) {
    throw new AuthorizationError('Insufficient permissions to read Patient resources');
  }

  // Step 3: Extract patient ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const patientId = pathParts[pathParts.length - 1];

  // Step 4: Mock patient data
  const patientData = {
    resourceType: 'Patient',
    id: patientId,
    active: true,
    identifier: [{ value: `MRN-${patientId}` }],
    managingOrganization: { reference: 'Organization/org-123' }
  };

  // Step 5: Check conditional permissions with actual data
  if (!context.checkPermission('Patient', 'read', patientData)) {
    throw new AuthorizationError('Access denied to this specific patient resource');
  }

  // Step 6: Return the patient resource
  return new Response(JSON.stringify(patientData), {
    status: 200,
    headers: { 'Content-Type': 'application/fhir+json' }
  });
}

async function handlePatientCreate(req: Request, context: AuthenticatedContext): Promise<Response> {
  if (!context.isAuthenticated) {
    throw new AuthenticationError('Authentication required');
  }

  if (!context.checkPermission('Patient', 'create')) {
    throw new AuthorizationError('Insufficient permissions to create Patient resources');
  }

  // Mock creation
  const newPatient = {
    resourceType: 'Patient',
    id: 'patient-new-123',
    active: true
  };

  return new Response(JSON.stringify(newPatient), {
    status: 201,
    headers: { 'Content-Type': 'application/fhir+json' }
  });
}

// Create a simple permission manager for integration tests that respects basic permission logic
function createSimplePermissionManager() {
  return {
    evaluatePermission: (user: AuthenticatedUser, resourceType: string, operation: string, resourceData?: any) => {
      const permissions = user.permissions;
      
      // Check global permissions first
      const readOperations = ['read', 'vread', 'search-type', 'history-instance', 'history-type'];
      const writeOperations = ['create', 'update', 'patch', 'create-conditional', 'update-conditional'];
      const deleteOperations = ['delete', 'delete-conditional-single', 'delete-conditional-multiple'];
      
      if (readOperations.includes(operation)) {
        if (!permissions.canRead) {
          return { allowed: false, reason: 'Global read permission denied' };
        }
      }
      
      if (writeOperations.includes(operation)) {
        if (!permissions.canWrite) {
          return { allowed: false, reason: 'Global write permission denied' };
        }
      }
      
      if (deleteOperations.includes(operation)) {
        if (!permissions.canDelete) {
          return { allowed: false, reason: 'Global delete permission denied' };
        }
      }
      
      // Check resource-specific permissions
      const resourcePerms = permissions.resources?.[resourceType];
      if (resourcePerms) {
        const hasResourcePermission = (resourcePerms as any)[operation];
        if (hasResourcePermission === false) {
          return { allowed: false, reason: `Resource-specific ${operation} permission denied for ${resourceType}` };
        }
        
        // Check conditional permissions
        if (resourceData && resourcePerms.conditions) {
          for (const condition of resourcePerms.conditions) {
            if (condition.field === 'managingOrganization.reference' && condition.operator === 'contains') {
              const expectedValue = condition.value;
              const actualValue = resourceData.managingOrganization?.reference;
              if (!actualValue || !actualValue.includes(expectedValue)) {
                return { allowed: false, reason: 'Conditional permission check failed' };
              }
            }
          }
        }
      }
      
      return { allowed: true };
    },
    
    getEffectivePermissions: (user: AuthenticatedUser) => ({
      global: {
        canRead: user.permissions.canRead ?? false,
        canWrite: user.permissions.canWrite ?? false,
        canDelete: user.permissions.canDelete ?? false,
      },
      resources: user.permissions.resources || {},
      operations: {},
      inheritedFrom: [],
      computedAt: new Date(),
    })
  } as any;
}

// Mock middleware that creates authenticated context
function createAuthMiddleware(user?: AuthenticatedUser) {
  const permissionManager = createSimplePermissionManager();
  return (originalContext: HandlerContext) => {
    return createAuthenticatedContext(originalContext, user, permissionManager);
  };
}

// Test utilities
function createMockHandlerContext(): HandlerContext {
  return {
    requestId: 'test-request-123',
    timestamp: new Date()
  } as HandlerContext;
}

function createMockUser(permissions: any, roles: string[] = ['user']): AuthenticatedUser {
  return {
    id: 'user-123',
    username: 'doctor.smith',
    email: 'doctor@hospital.com',
    roles,
    permissions,
    metadata: { department: 'cardiology', orgId: 'org-123' }
  };
}

describe('Auth Context Integration', () => {
  describe('Successful Authentication Flow', () => {
    test('authenticated user can read allowed patient', async () => {
      const user = createMockUser({
        canRead: true,
        resources: {
          'Patient': {
            read: true,
            conditions: [{
              field: 'managingOrganization.reference',
              operator: 'contains',
              value: 'org-123'
            }]
          }
        }
      });

      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(user);
      const enhancedContext = authMiddleware(originalContext);

      const req = new Request('https://fhir.example.com/Patient/patient-123');
      const response = await handlePatientRead(req, enhancedContext);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/fhir+json');

      const responseData = await response.json();
      expect(responseData.resourceType).toBe('Patient');
      expect(responseData.id).toBe('patient-123');
    });

    test('authenticated user can create patient with proper permissions', async () => {
      const user = createMockUser({
        canRead: true,
        canWrite: true,
        resources: {
          'Patient': {
            read: true,
            create: true
          }
        }
      });

      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(user);
      const enhancedContext = authMiddleware(originalContext);

      const req = new Request('https://fhir.example.com/Patient', {
        method: 'POST',
        body: JSON.stringify({ resourceType: 'Patient', active: true })
      });

      const response = await handlePatientCreate(req, enhancedContext);

      expect(response.status).toBe(201);
      const responseData = await response.json();
      expect(responseData.resourceType).toBe('Patient');
    });
  });

  describe('Authentication Failures', () => {
    test('unauthenticated request throws AuthenticationError', async () => {
      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(); // No user
      const enhancedContext = authMiddleware(originalContext);

      const req = new Request('https://fhir.example.com/Patient/patient-123');

      await expect(handlePatientRead(req, enhancedContext)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('Authorization Failures', () => {
    test('user without read permission throws AuthorizationError', async () => {
      const user = createMockUser({
        canRead: false, // No read permission
        canWrite: true
      });

      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(user);
      const enhancedContext = authMiddleware(originalContext);

      const req = new Request('https://fhir.example.com/Patient/patient-123');

      await expect(handlePatientRead(req, enhancedContext)).rejects.toThrow(AuthorizationError);
    });

    test('user without create permission throws AuthorizationError', async () => {
      const user = createMockUser({
        canRead: true,
        canWrite: false // No write permission
      });

      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(user);
      const enhancedContext = authMiddleware(originalContext);

      const req = new Request('https://fhir.example.com/Patient', { method: 'POST' });

      await expect(handlePatientCreate(req, enhancedContext)).rejects.toThrow(AuthorizationError);
    });

    test('conditional permission failure throws AuthorizationError', async () => {
      const user = createMockUser({
        canRead: true,
        resources: {
          'Patient': {
            read: true,
            conditions: [{
              field: 'managingOrganization.reference',
              operator: 'contains',
              value: 'org-456' // Different org than the test data
            }]
          }
        }
      });

      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(user);
      const enhancedContext = authMiddleware(originalContext);

      const req = new Request('https://fhir.example.com/Patient/patient-123');

      await expect(handlePatientRead(req, enhancedContext)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('Role-Based Access Control', () => {
    test('admin user has access to all operations', async () => {
      const user = createMockUser({
        canRead: true,
        canWrite: true,
        canDelete: true
      }, ['user', 'admin']);

      const originalContext = createMockHandlerContext();
      const enhancedContext = createAuthenticatedContext(originalContext, user);

      expect(enhancedContext.hasRole('admin')).toBe(true);
      expect(enhancedContext.hasRole('user')).toBe(true);
      expect(enhancedContext.hasRole('superuser')).toBe(false);
      
      expect(enhancedContext.checkPermission('Patient', 'read')).toBe(true);
      expect(enhancedContext.checkPermission('Patient', 'create')).toBe(true);
      expect(enhancedContext.checkPermission('Patient', 'delete')).toBe(true);
    });

    test('regular user has limited access', async () => {
      const user = createMockUser({
        canRead: true,
        canWrite: false,
        canDelete: false
      }, ['user']);

      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(user);
      const enhancedContext = authMiddleware(originalContext);

      expect(enhancedContext.hasRole('user')).toBe(true);
      expect(enhancedContext.hasRole('admin')).toBe(false);
      
      expect(enhancedContext.checkPermission('Patient', 'read')).toBe(true);
      expect(enhancedContext.checkPermission('Patient', 'create')).toBe(false);
      expect(enhancedContext.checkPermission('Patient', 'delete')).toBe(false);
    });
  });

  describe('Context Method Integration', () => {
    test('enhanced context preserves original context properties', () => {
      const originalContext = createMockHandlerContext();
      const user = createMockUser({ canRead: true });
      const enhancedContext = createAuthenticatedContext(originalContext, user);

      // Original context properties should be preserved
      expect(enhancedContext.requestId).toBe('test-request-123');
      expect(enhancedContext.timestamp).toBeInstanceOf(Date);

      // Authentication properties should be added
      expect(enhancedContext.user).toBe(user);
      expect(enhancedContext.isAuthenticated).toBe(true);

      // Authentication methods should be available
      expect(typeof enhancedContext.checkPermission).toBe('function');
      expect(typeof enhancedContext.hasRole).toBe('function');
      expect(typeof enhancedContext.hasPermission).toBe('function');
    });

    test('context methods work correctly with complex permissions', () => {
      const user = createMockUser({
        canRead: true,
        canWrite: false,
        resources: {
          'Patient': { read: true, create: false },
          'Observation': { read: true, create: true, delete: false }
        },
        custom: {
          'export-data': true,
          'admin-panel': false
        }
      }, ['doctor', 'user']);

      const originalContext = createMockHandlerContext();
      const authMiddleware = createAuthMiddleware(user);
      const enhancedContext = authMiddleware(originalContext);

      // Role checks
      expect(enhancedContext.hasRole('doctor')).toBe(true);
      expect(enhancedContext.hasRole('admin')).toBe(false);

      // Global permission checks
      expect(enhancedContext.hasPermission('read')).toBe(true);
      expect(enhancedContext.hasPermission('write')).toBe(false);

      // Resource-specific permission checks
      expect(enhancedContext.checkPermission('Patient', 'read')).toBe(true);
      expect(enhancedContext.checkPermission('Patient', 'create')).toBe(false);
      expect(enhancedContext.checkPermission('Observation', 'create')).toBe(false); // Blocked by global canWrite: false

      // Dot notation permission checks
      expect(enhancedContext.hasPermission('Patient.read')).toBe(true);
      expect(enhancedContext.hasPermission('Observation.read')).toBe(true);

      // Custom permission checks
      expect(enhancedContext.hasPermission('export-data')).toBe(true);
      expect(enhancedContext.hasPermission('admin-panel')).toBe(false);
    });
  });
});