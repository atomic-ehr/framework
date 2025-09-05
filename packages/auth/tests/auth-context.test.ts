import { test, expect, describe } from 'bun:test';
import type { HandlerContext } from '@atomic-fhir/core';
import {
  AuthContext,
  createAuthContext,
  enhanceContext,
  createAuthenticatedContext,
  PermissionUtils
} from '../src/core/auth-context.ts';
import type {
  AuthenticatedUser,
  AuthenticatedContext,
  FHIRPermissions
} from '../src/types/index.ts';

// Test utilities
function createMockHandlerContext(): HandlerContext {
  return {
    requestId: 'test-request-123',
    timestamp: new Date()
  } as HandlerContext;
}

function createMockUser(permissions?: Partial<FHIRPermissions>, roles?: string[]): AuthenticatedUser {
  return {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    roles: roles || ['user'],
    permissions: {
      canRead: true,
      canWrite: false,
      canDelete: false,
      resources: {},
      operations: {},
      custom: {},
      ...permissions
    },
    metadata: { department: 'cardiology' }
  };
}

// Create a mock permission manager that uses simple global permissions
function createSimplePermissionManager() {
  return {
    evaluatePermission: (user: AuthenticatedUser, resourceType: string, operation: string) => {
      if (!user) {
        return { allowed: false, reason: 'No user provided' };
      }

      const permissions = user.permissions;
      
      // Check global permissions first
      switch (operation) {
        case 'read':
        case 'vread':
        case 'search-type':
        case 'history':
          return { allowed: permissions.canRead === true, reason: permissions.canRead ? undefined : 'Global read denied' };
        case 'create':
        case 'update':
        case 'patch':
          return { allowed: permissions.canWrite === true, reason: permissions.canWrite ? undefined : 'Global write denied' };
        case 'delete':
        case 'delete-conditional':
          return { allowed: permissions.canDelete === true, reason: permissions.canDelete ? undefined : 'Global delete denied' };
        default:
          return { allowed: false, reason: `Unknown operation: ${operation}` };
      }
    }
  } as any;
}

describe('AuthContext (Simplified)', () => {
  describe('Construction', () => {
    test('creates authenticated context with user', () => {
      const user = createMockUser();
      const authContext = new AuthContext(user);
      
      expect(authContext.user).toBe(user);
      expect(authContext.isAuthenticated).toBe(true);
    });

    test('creates unauthenticated context without user', () => {
      const authContext = new AuthContext();
      
      expect(authContext.user).toBeUndefined();
      expect(authContext.isAuthenticated).toBe(false);
    });
  });

  describe('Global Permissions', () => {
    test('checkPermission respects global read permissions', () => {
      const user = createMockUser({ canRead: true, canWrite: false, canDelete: false });
      const permissionManager = createSimplePermissionManager();
      const authContext = new AuthContext(user, permissionManager);
      
      expect(authContext.checkPermission('Patient', 'read')).toBe(true);
      expect(authContext.checkPermission('Patient', 'search-type')).toBe(true);
      expect(authContext.checkPermission('Patient', 'create')).toBe(false);
      expect(authContext.checkPermission('Patient', 'delete')).toBe(false);
    });

    test('checkPermission respects global write permissions', () => {
      const user = createMockUser({ canRead: true, canWrite: true, canDelete: false });
      const permissionManager = createSimplePermissionManager();
      const authContext = new AuthContext(user, permissionManager);
      
      expect(authContext.checkPermission('Observation', 'create')).toBe(true);
      expect(authContext.checkPermission('Observation', 'update')).toBe(true);
      expect(authContext.checkPermission('Observation', 'patch')).toBe(true);
      expect(authContext.checkPermission('Observation', 'delete')).toBe(false);
    });

    test('checkPermission respects global delete permissions', () => {
      const user = createMockUser({ canRead: true, canWrite: true, canDelete: true });
      const permissionManager = createSimplePermissionManager();
      const authContext = new AuthContext(user, permissionManager);
      
      expect(authContext.checkPermission('DiagnosticReport', 'delete')).toBe(true);
      expect(authContext.checkPermission('DiagnosticReport', 'delete-conditional')).toBe(true);
    });

    test('denies all permissions when not authenticated', () => {
      const authContext = new AuthContext();
      
      expect(authContext.checkPermission('Patient', 'read')).toBe(false);
      expect(authContext.checkPermission('Patient', 'create')).toBe(false);
      expect(authContext.checkPermission('Patient', 'delete')).toBe(false);
    });
  });

  describe('Role Checking', () => {
    test('hasRole returns true for existing roles', () => {
      const user = createMockUser({}, ['user', 'practitioner', 'admin']);
      const authContext = new AuthContext(user);
      
      expect(authContext.hasRole('user')).toBe(true);
      expect(authContext.hasRole('practitioner')).toBe(true);
      expect(authContext.hasRole('admin')).toBe(true);
    });

    test('hasRole returns false for non-existing roles', () => {
      const user = createMockUser({}, ['user']);
      const authContext = new AuthContext(user);
      
      expect(authContext.hasRole('admin')).toBe(false);
      expect(authContext.hasRole('superuser')).toBe(false);
    });

    test('hasRole returns false when not authenticated', () => {
      const authContext = new AuthContext();
      
      expect(authContext.hasRole('user')).toBe(false);
    });
  });

  describe('Permission String Checking', () => {
    test('hasPermission handles global permissions', () => {
      const user = createMockUser({
        canRead: true,
        canWrite: false,
        canDelete: true
      });
      const authContext = new AuthContext(user);
      
      expect(authContext.hasPermission('read')).toBe(true);
      expect(authContext.hasPermission('write')).toBe(false);
      expect(authContext.hasPermission('delete')).toBe(true);
    });

    test('hasPermission returns false when not authenticated', () => {
      const authContext = new AuthContext();
      
      expect(authContext.hasPermission('read')).toBe(false);
      expect(authContext.hasPermission('write')).toBe(false);
      expect(authContext.hasPermission('delete')).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    test('getRoles returns user roles', () => {
      const user = createMockUser({}, ['user', 'admin']);
      const authContext = new AuthContext(user);
      
      expect(authContext.getRoles()).toEqual(['user', 'admin']);
    });

    test('getRoles returns empty array when not authenticated', () => {
      const authContext = new AuthContext();
      
      expect(authContext.getRoles()).toEqual([]);
    });

    test('getMetadata returns user metadata', () => {
      const user = createMockUser();
      const authContext = new AuthContext(user);
      
      expect(authContext.getMetadata()).toEqual({ department: 'cardiology' });
    });
  });
});

describe('PermissionUtils', () => {
  test('canReadAny checks global read permission', () => {
    const user1 = createMockUser({ canRead: true });
    const user2 = createMockUser({ canRead: false });
    
    expect(PermissionUtils.canReadAny(user1)).toBe(true);
    expect(PermissionUtils.canReadAny(user2)).toBe(false);
    expect(PermissionUtils.canReadAny(undefined)).toBe(false);
  });

  test('canWriteAny checks global write permission', () => {
    const user1 = createMockUser({ canWrite: true });
    const user2 = createMockUser({ canWrite: false });
    
    expect(PermissionUtils.canWriteAny(user1)).toBe(true);
    expect(PermissionUtils.canWriteAny(user2)).toBe(false);
    expect(PermissionUtils.canWriteAny(undefined)).toBe(false);
  });

  test('isAdmin checks for admin role', () => {
    const user1 = createMockUser({}, ['admin', 'user']);
    const user2 = createMockUser({}, ['user']);
    
    expect(PermissionUtils.isAdmin(user1)).toBe(true);
    expect(PermissionUtils.isAdmin(user2)).toBe(false);
    expect(PermissionUtils.isAdmin(undefined)).toBe(false);
  });

  test('hasAnyRole checks for any matching role', () => {
    const user = createMockUser({}, ['user', 'practitioner']);
    
    expect(PermissionUtils.hasAnyRole(user, ['admin', 'user'])).toBe(true);
    expect(PermissionUtils.hasAnyRole(user, ['admin', 'superuser'])).toBe(false);
    expect(PermissionUtils.hasAnyRole(undefined, ['admin'])).toBe(false);
  });

  test('hasAllRoles checks for all required roles', () => {
    const user = createMockUser({}, ['user', 'practitioner', 'admin']);
    
    expect(PermissionUtils.hasAllRoles(user, ['user', 'practitioner'])).toBe(true);
    expect(PermissionUtils.hasAllRoles(user, ['user', 'superuser'])).toBe(false);
    expect(PermissionUtils.hasAllRoles(undefined, ['user'])).toBe(false);
  });
});

describe('Context Enhancement', () => {
  test('createAuthContext creates AuthContext', () => {
    const user = createMockUser();
    const authContext = createAuthContext(user);
    
    expect(authContext).toBeInstanceOf(AuthContext);
    expect(authContext.user).toBe(user);
    expect(authContext.isAuthenticated).toBe(true);
  });

  test('enhanceContext adds authentication methods', () => {
    const user = createMockUser({ canRead: true });
    const context = createMockHandlerContext();
    const authContext = new AuthContext(user);
    
    const enhanced = enhanceContext(context, authContext);
    
    expect(enhanced.user).toBe(user);
    expect(enhanced.isAuthenticated).toBe(true);
    expect(typeof enhanced.checkPermission).toBe('function');
    expect(typeof enhanced.hasRole).toBe('function');
    expect(typeof enhanced.hasPermission).toBe('function');
  });

  test('createAuthenticatedContext combines creation and enhancement', () => {
    const user = createMockUser();
    const context = createMockHandlerContext();
    
    const enhanced = createAuthenticatedContext(context, user);
    
    expect(enhanced.user).toBe(user);
    expect(enhanced.isAuthenticated).toBe(true);
    expect(typeof enhanced.checkPermission).toBe('function');
  });
});