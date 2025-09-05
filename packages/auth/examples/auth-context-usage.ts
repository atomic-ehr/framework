// Example showing how to use AuthContext in FHIR request handlers
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
import { AuthenticationError, AuthorizationError } from '../src/types/index.ts';

// ============================================================================
// Example 1: Basic Handler with Authentication Context
// ============================================================================

async function handlePatientRead(req: Request, context: AuthenticatedContext): Promise<Response> {
  // Step 1: Verify user is authenticated
  if (!context.isAuthenticated) {
    throw new AuthenticationError('Authentication required to access patient resources');
  }

  // Step 2: Check basic read permission
  if (!context.checkPermission('Patient', 'read')) {
    throw new AuthorizationError('Insufficient permissions to read Patient resources');
  }

  // Step 3: Extract patient ID from request
  const url = new URL(req.url);
  const patientId = url.pathname.split('/').pop();

  // Step 4: Fetch patient data (mock)
  const patientData = {
    resourceType: 'Patient',
    id: patientId,
    active: true,
    identifier: [{ system: 'http://hospital.org/mrn', value: `MRN-${patientId}` }],
    managingOrganization: { reference: 'Organization/org-123' },
    department: context.user?.metadata?.department
  };

  // Step 5: Apply conditional permissions with actual patient data
  if (!context.checkPermission('Patient', 'read', patientData)) {
    throw new AuthorizationError('Access denied to this specific patient resource');
  }

  // Step 6: Return patient resource
  return new Response(JSON.stringify(patientData), {
    status: 200,
    headers: { 'Content-Type': 'application/fhir+json' }
  });
}

// ============================================================================
// Example 2: Role-Based Handler
// ============================================================================

async function handleAdminOperation(req: Request, context: AuthenticatedContext): Promise<Response> {
  // Check if user has admin role
  if (!context.hasRole('admin')) {
    throw new AuthorizationError('Admin role required for this operation');
  }

  // Check custom permission
  if (!context.hasPermission('system-administration')) {
    throw new AuthorizationError('System administration permission required');
  }

  // Proceed with admin operation
  return new Response(JSON.stringify({ 
    message: 'Admin operation completed successfully',
    user: context.user?.username,
    roles: context.user?.roles
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/fhir+json' }
  });
}

// ============================================================================
// Example 3: Multi-Resource Handler with Complex Permissions
// ============================================================================

async function handleSearchOperation(req: Request, context: AuthenticatedContext): Promise<Response> {
  if (!context.isAuthenticated) {
    throw new AuthenticationError('Authentication required');
  }

  const url = new URL(req.url);
  const resourceType = url.searchParams.get('_type') || 'Patient';

  // Check if user can search the requested resource type
  if (!context.checkPermission(resourceType, 'search')) {
    throw new AuthorizationError(`Insufficient permissions to search ${resourceType} resources`);
  }

  // Get all resource types the user can search
  const searchableResources = PermissionUtils.getPermittedResources(context.user, 'search');
  
  // Mock search results
  const searchResults = {
    resourceType: 'Bundle',
    type: 'searchset',
    total: searchableResources.length,
    entry: searchableResources.map(type => ({
      resource: {
        resourceType: type,
        id: `${type.toLowerCase()}-example`,
        status: 'active'
      }
    }))
  };

  return new Response(JSON.stringify(searchResults), {
    status: 200,
    headers: { 'Content-Type': 'application/fhir+json' }
  });
}

// ============================================================================
// Example 4: Middleware Integration
// ============================================================================

function createAuthContextMiddleware(authenticatedUser?: AuthenticatedUser) {
  return function authMiddleware(
    originalContext: HandlerContext,
    next: (enhancedContext: AuthenticatedContext) => Promise<Response>
  ): Promise<Response> {
    // Create enhanced context with authentication capabilities
    const enhancedContext = createAuthenticatedContext(originalContext, authenticatedUser);
    
    // Log authentication info
    console.log(`Request authenticated: ${enhancedContext.isAuthenticated}`);
    if (enhancedContext.user) {
      console.log(`User: ${enhancedContext.user.username} (${enhancedContext.user.roles.join(', ')})`);
    }
    
    // Call next handler with enhanced context
    return next(enhancedContext);
  };
}

// ============================================================================
// Example 5: Permission Utilities Usage
// ============================================================================

function analyzeUserPermissions(user: AuthenticatedUser): void {
  console.log('=== User Permission Analysis ===');
  console.log(`User: ${user.username} (${user.id})`);
  console.log(`Roles: ${user.roles.join(', ')}`);
  
  // Global permissions
  console.log('\nGlobal Permissions:');
  console.log(`  Can Read Any: ${PermissionUtils.canReadAny(user)}`);
  console.log(`  Can Write Any: ${PermissionUtils.canWriteAny(user)}`);
  console.log(`  Can Delete Any: ${PermissionUtils.canDeleteAny(user)}`);
  console.log(`  Is Admin: ${PermissionUtils.isAdmin(user)}`);
  
  // Role checks
  console.log('\nRole Checks:');
  console.log(`  Has Doctor Role: ${PermissionUtils.hasAnyRole(user, ['doctor'])}`);
  console.log(`  Has Admin/Superuser: ${PermissionUtils.hasAnyRole(user, ['admin', 'superuser'])}`);
  console.log(`  Has All Required Roles: ${PermissionUtils.hasAllRoles(user, ['user', 'practitioner'])}`);
  
  // Resource permissions
  console.log('\nPermitted Resources:');
  console.log(`  Can Read: ${PermissionUtils.getPermittedResources(user, 'read').join(', ')}`);
  console.log(`  Can Create: ${PermissionUtils.getPermittedResources(user, 'create').join(', ')}`);
  console.log(`  Can Delete: ${PermissionUtils.getPermittedResources(user, 'delete').join(', ')}`);
}

// ============================================================================
// Example 6: Complete Request Flow
// ============================================================================

async function simulateRequestFlow(): Promise<void> {
  console.log('🔐 Authentication Context Usage Examples\n');

  // Create mock user with comprehensive permissions
  const doctorUser: AuthenticatedUser = {
    id: 'doc-123',
    username: 'dr.smith',
    email: 'smith@hospital.com',
    roles: ['user', 'practitioner', 'doctor'],
    permissions: {
      canRead: true,
      canWrite: true,
      canDelete: false,
      resources: {
        'Patient': {
          read: true,
          create: true,
          search: true,
          conditions: [
            {
              field: 'managingOrganization.reference',
              operator: 'contains',
              value: 'Organization/cardiology-dept'
            }
          ]
        },
        'Observation': {
          read: true,
          create: true,
          search: true
        },
        'DiagnosticReport': {
          read: true,
          create: false,
          search: true
        }
      },
      operations: {
        'patient-everything': true,
        'export-data': true
      },
      custom: {
        'system-administration': false,
        'quality-metrics': true
      }
    },
    metadata: {
      department: 'cardiology',
      organizationId: 'cardiology-dept'
    }
  };

  // Simulate different request scenarios
  const scenarios = [
    {
      name: 'Patient Read (Allowed)',
      url: 'https://fhir.example.com/Patient/patient-123',
      handler: handlePatientRead
    },
    {
      name: 'Admin Operation (Denied - Role)',
      url: 'https://fhir.example.com/admin/system-status',
      handler: handleAdminOperation
    },
    {
      name: 'Search Operation (Allowed)',
      url: 'https://fhir.example.com/_search?_type=Patient',
      handler: handleSearchOperation
    }
  ];

  const originalContext: HandlerContext = {
    requestId: 'req-123',
    timestamp: new Date()
  } as HandlerContext;

  console.log('1. User Permission Analysis:');
  analyzeUserPermissions(doctorUser);

  console.log('\n2. Request Simulation:');
  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.name} ---`);
    try {
      const req = new Request(scenario.url);
      const enhancedContext = createAuthenticatedContext(originalContext, doctorUser);
      
      const response = await scenario.handler(req, enhancedContext);
      console.log(`✅ Success: ${response.status} ${response.statusText}`);
      
      // Log response body for successful requests
      if (response.status < 400) {
        const responseData = await response.json();
        console.log(`   Response: ${responseData.resourceType || 'Success'}`);
      }
      
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        console.log(`❌ ${error.name}: ${error.message}`);
      } else {
        console.log(`💥 Unexpected error: ${error}`);
      }
    }
  }

  console.log('\n✅ Authentication context examples completed successfully!');
  console.log('📝 These examples demonstrate comprehensive FHIR permission management.');
}

// ============================================================================
// Example 7: Direct AuthContext Usage (Without Framework Integration)
// ============================================================================

function demonstrateDirectAuthContext(): void {
  console.log('\n🔧 Direct AuthContext Usage:');

  // Create user with limited permissions
  const limitedUser: AuthenticatedUser = {
    id: 'nurse-456',
    username: 'nurse.jones',
    roles: ['user', 'nurse'],
    permissions: {
      canRead: true,
      canWrite: false,
      canDelete: false,
      resources: {
        'Patient': { read: true, search: true },
        'Observation': { read: true, search: false }
      }
    }
  };

  // Create auth context directly
  const authContext = createAuthContext(limitedUser);

  console.log('\nDirect Permission Checks:');
  console.log(`  Patient read: ${authContext.checkPermission('Patient', 'read')}`);
  console.log(`  Patient create: ${authContext.checkPermission('Patient', 'create')}`);
  console.log(`  Observation search: ${authContext.checkPermission('Observation', 'search')}`);
  
  console.log('\nRole and Permission String Checks:');
  console.log(`  Has nurse role: ${authContext.hasRole('nurse')}`);
  console.log(`  Has admin role: ${authContext.hasRole('admin')}`);
  console.log(`  Global read permission: ${authContext.hasPermission('read')}`);
  console.log(`  Dot notation - Patient.read: ${authContext.hasPermission('Patient.read')}`);
  
  console.log(`\nUser roles: ${authContext.getRoles().join(', ')}`);
  console.log(`Authentication status: ${authContext.isAuthenticated}`);
}

// Run examples if this file is executed directly
if (import.meta.main) {
  await simulateRequestFlow();
  demonstrateDirectAuthContext();
}

export {
  handlePatientRead,
  handleAdminOperation,
  handleSearchOperation,
  createAuthContextMiddleware,
  analyzeUserPermissions
};