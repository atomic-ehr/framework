// Example showing how to extend BaseAuthStrategy to create custom authentication strategies
import { BaseAuthStrategy } from '../src/strategies/base-strategy.ts';
import { HandlerContext } from '@atomic-fhir/core';
import {
  AuthStrategyConfig,
  AuthenticationResult,
  AuthenticatedUser,
  FHIRPermissions
} from '../src/types/index.ts';

// ============================================================================
// Example 1: Simple API Key Strategy
// ============================================================================

interface ApiKeyConfig extends AuthStrategyConfig {
  apiKeys: Record<string, { userId: string; permissions: FHIRPermissions }>;
  headerName?: string;
}

class ApiKeyStrategy extends BaseAuthStrategy {
  private config: ApiKeyConfig;

  constructor(config: ApiKeyConfig) {
    super(config);
    this.config = config;
  }

  async authenticate(req: Request, context: HandlerContext): Promise<AuthenticationResult> {
    this.logAuthEvent('auth_attempt', req);

    // Check if we can handle this request
    if (!this.canHandle(req)) {
      return this.createFailureResult('Strategy cannot handle this request');
    }

    // Extract API key from header
    const headerName = this.config.headerName || 'X-API-Key';
    const apiKey = req.headers.get(headerName);

    if (!apiKey) {
      this.logAuthEvent('auth_failure', req, undefined, `Missing ${headerName} header`);
      return this.createFailureResult(`Missing ${headerName} header`);
    }

    // Validate API key
    const keyInfo = this.config.apiKeys[apiKey];
    if (!keyInfo) {
      this.logAuthEvent('auth_failure', req, undefined, 'Invalid API key');
      return this.createFailureResult('Invalid API key');
    }

    // Create authenticated user
    const user: AuthenticatedUser = {
      id: keyInfo.userId,
      username: `api-user-${keyInfo.userId}`,
      roles: ['api-user'],
      permissions: keyInfo.permissions
    };

    this.logAuthEvent('auth_success', req, user);
    return this.createSuccessResult(user);
  }

  // Override challenge to provide API key specific response
  challenge(req: Request): Response {
    return new Response(
      JSON.stringify({
        error: 'API Key authentication required',
        message: `Please provide a valid API key in the ${this.config.headerName || 'X-API-Key'} header`
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/fhir+json'
        }
      }
    );
  }
}

// ============================================================================
// Example 2: Multi-Factor Authentication Strategy
// ============================================================================

interface MFAConfig extends AuthStrategyConfig {
  requireMFA: boolean;
  mfaTimeout: number; // in seconds
}

class MFAStrategy extends BaseAuthStrategy {
  private config: MFAConfig;
  private pendingMFA = new Map<string, { user: AuthenticatedUser; timestamp: Date }>();

  constructor(config: MFAConfig) {
    super(config);
    this.config = config;
  }

  async authenticate(req: Request, context: HandlerContext): Promise<AuthenticationResult> {
    // First check basic auth
    const credentials = this.extractBasicCredentials(req);
    if (!credentials) {
      return this.createFailureResult('Missing credentials');
    }

    // Mock user validation (in real implementation, validate against database)
    if (credentials.username !== 'testuser' || credentials.password !== 'password') {
      this.logAuthEvent('auth_failure', req, undefined, 'Invalid credentials');
      return this.createFailureResult('Invalid credentials');
    }

    const user: AuthenticatedUser = {
      id: 'user-123',
      username: credentials.username,
      roles: ['user'],
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        resources: {
          Patient: { read: true, write: true, search: true }
        }
      }
    };

    // Check if MFA is required
    if (this.config.requireMFA) {
      const mfaToken = req.headers.get('X-MFA-Token');
      
      if (!mfaToken) {
        // Store user for MFA validation
        const sessionId = this.generateSessionId();
        this.pendingMFA.set(sessionId, { user, timestamp: new Date() });
        
        return this.createFailureResult('MFA required', 428); // Precondition Required
      }

      // Validate MFA token (mock implementation)
      if (!this.validateMFAToken(mfaToken)) {
        this.logAuthEvent('auth_failure', req, user, 'Invalid MFA token');
        return this.createFailureResult('Invalid MFA token');
      }
    }

    // Check permissions for the requested resource
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(p => p);
    const resourceType = pathParts[1]; // Assuming /fhir/ResourceType/id format
    
    if (resourceType && !this.hasPermission(user, resourceType, 'read')) {
      this.logAuthEvent('auth_failure', req, user, `No permission for ${resourceType}`);
      return this.createFailureResult(`Insufficient permissions for ${resourceType}`, 403);
    }

    this.logAuthEvent('auth_success', req, user);
    return this.createSuccessResult(user);
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private validateMFAToken(token: string): boolean {
    // Mock MFA validation - in real implementation, verify TOTP/SMS code
    return token === '123456';
  }

  // Override WWW-Authenticate header for MFA
  protected getWWWAuthenticateHeader(): string {
    return `Basic realm="FHIR Server", charset="UTF-8"`;
  }
}

// ============================================================================
// Example 3: Role-Based Strategy with Dynamic Permissions
// ============================================================================

interface RoleBasedConfig extends AuthStrategyConfig {
  rolePermissions: Record<string, FHIRPermissions>;
  userRoleProvider: (username: string) => Promise<string[]>;
}

class RoleBasedStrategy extends BaseAuthStrategy {
  private config: RoleBasedConfig;

  constructor(config: RoleBasedConfig) {
    super(config);
    this.config = config;
  }

  async authenticate(req: Request, context: HandlerContext): Promise<AuthenticationResult> {
    const token = this.extractBearerToken(req);
    if (!token) {
      return this.createFailureResult('Missing bearer token');
    }

    // Mock JWT decode (in real implementation, use proper JWT library)
    const payload = this.mockDecodeJWT(token);
    if (!payload) {
      this.logAuthEvent('auth_failure', req, undefined, 'Invalid token');
      return this.createFailureResult('Invalid token');
    }

    // Get user roles
    const roles = await this.config.userRoleProvider(payload.username);
    
    // Build combined permissions from all roles
    const permissions = this.combineRolePermissions(roles);
    
    const user: AuthenticatedUser = {
      id: payload.sub,
      username: payload.username,
      email: payload.email,
      roles,
      permissions
    };

    this.logAuthEvent('auth_success', req, user);
    return this.createSuccessResult(user);
  }

  private mockDecodeJWT(token: string): any {
    // Mock implementation - use proper JWT library in production
    if (token === 'valid-token') {
      return {
        sub: 'user-123',
        username: 'doctor.smith',
        email: 'doctor@hospital.com'
      };
    }
    return null;
  }

  private combineRolePermissions(roles: string[]): FHIRPermissions {
    const combined: FHIRPermissions = {
      canRead: false,
      canWrite: false,
      canDelete: false,
      resources: {},
      operations: {},
      custom: {}
    };

    for (const role of roles) {
      const rolePerms = this.config.rolePermissions[role];
      if (rolePerms) {
        // Combine global permissions (use OR logic)
        combined.canRead = combined.canRead || rolePerms.canRead || false;
        combined.canWrite = combined.canWrite || rolePerms.canWrite || false;
        combined.canDelete = combined.canDelete || rolePerms.canDelete || false;

        // Merge resource permissions
        if (rolePerms.resources) {
          Object.entries(rolePerms.resources).forEach(([resource, perms]) => {
            if (!combined.resources![resource]) {
              combined.resources![resource] = {};
            }
            Object.assign(combined.resources![resource], perms);
          });
        }

        // Merge operations
        Object.assign(combined.operations!, rolePerms.operations || {});
        Object.assign(combined.custom!, rolePerms.custom || {});
      }
    }

    return combined;
  }
}

// ============================================================================
// Usage Examples
// ============================================================================

async function demonstrateStrategies() {
  console.log('🔐 BaseAuthStrategy Usage Examples\n');

  // Example 1: API Key Strategy
  console.log('1. API Key Strategy:');
  const apiKeyStrategy = new ApiKeyStrategy({
    name: 'api-key',
    priority: 100,
    headerName: 'X-API-Key',
    apiKeys: {
      'pk_live_123456': {
        userId: 'api-user-1',
        permissions: {
          canRead: true,
          canWrite: false,
          canDelete: false,
          resources: {
            Patient: { read: true, search: true }
          }
        }
      }
    }
  });

  const apiReq = new Request('https://fhir.example.com/Patient', {
    headers: { 'X-API-Key': 'pk_live_123456' }
  });

  const apiResult = await apiKeyStrategy.authenticate(apiReq, {} as HandlerContext);
  console.log(`   API Key auth: ${apiResult.success ? '✅ Success' : '❌ Failed'}`);
  if (apiResult.success) {
    console.log(`   User: ${apiResult.user?.username} (${apiResult.user?.roles.join(', ')})`);
  }

  // Example 2: MFA Strategy
  console.log('\n2. Multi-Factor Authentication:');
  const mfaStrategy = new MFAStrategy({
    name: 'mfa',
    requireMFA: true,
    mfaTimeout: 300
  });

  const mfaReq = new Request('https://fhir.example.com/Patient', {
    headers: {
      'authorization': 'Basic ' + btoa('testuser:password'),
      'X-MFA-Token': '123456'
    }
  });

  const mfaResult = await mfaStrategy.authenticate(mfaReq, {} as HandlerContext);
  console.log(`   MFA auth: ${mfaResult.success ? '✅ Success' : '❌ Failed'}`);

  // Example 3: Role-Based Strategy
  console.log('\n3. Role-Based Authentication:');
  const roleStrategy = new RoleBasedStrategy({
    name: 'role-based',
    rolePermissions: {
      'doctor': {
        canRead: true,
        canWrite: true,
        canDelete: false,
        resources: {
          Patient: { read: true, write: true, search: true },
          Observation: { read: true, write: true, search: true }
        }
      },
      'nurse': {
        canRead: true,
        canWrite: false,
        canDelete: false,
        resources: {
          Patient: { read: true, search: true },
          Observation: { read: true, search: true }
        }
      }
    },
    userRoleProvider: async (username) => {
      // Mock role lookup
      if (username === 'doctor.smith') return ['doctor'];
      if (username === 'nurse.jones') return ['nurse'];
      return ['user'];
    }
  });

  const roleReq = new Request('https://fhir.example.com/Patient', {
    headers: { 'authorization': 'Bearer valid-token' }
  });

  const roleResult = await roleStrategy.authenticate(roleReq, {} as HandlerContext);
  console.log(`   Role-based auth: ${roleResult.success ? '✅ Success' : '❌ Failed'}`);
  if (roleResult.success) {
    console.log(`   User: ${roleResult.user?.username} (${roleResult.user?.roles.join(', ')})`);
    console.log(`   Permissions: Read=${roleResult.user?.permissions.canRead}, Write=${roleResult.user?.permissions.canWrite}`);
  }

  console.log('\n✅ All examples completed successfully!');
  console.log('📝 These demonstrate the flexibility of BaseAuthStrategy for implementing custom authentication.');
}

// Run examples if this file is executed directly
if (import.meta.main) {
  await demonstrateStrategies();
}

export { ApiKeyStrategy, MFAStrategy, RoleBasedStrategy };