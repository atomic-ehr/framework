// Comprehensive example showing AuthManager usage in real-world scenarios
import type { HandlerContext } from '@atomic-fhir/core';
import { AuthManager } from '../src/core/auth-manager.ts';
import { BaseAuthStrategy } from '../src/strategies/base-strategy.ts';
import type {
  AuthStrategyConfig,
  AuthenticationResult,
  AuthenticatedUser,
  TokenStorage,
  SessionStorage,
  SessionData
} from '../src/types/index.ts';

// ============================================================================
// Example Strategy Implementations
// ============================================================================

/**
 * Basic Authentication Strategy Implementation
 */
class BasicAuthStrategy extends BaseAuthStrategy {
  private users: Record<string, { password: string; user: Partial<AuthenticatedUser> }>;

  constructor(config: AuthStrategyConfig & { users: Record<string, { password: string; user: Partial<AuthenticatedUser> }> }) {
    super(config);
    this.users = config.users;
  }

  async authenticate(req: Request, context: HandlerContext): Promise<AuthenticationResult> {
    this.logAuthEvent('auth_attempt', req);

    if (!this.canHandle(req)) {
      return this.createFailureResult('Basic Auth not provided');
    }

    const credentials = this.extractBasicCredentials(req);
    if (!credentials) {
      this.logAuthEvent('auth_failure', req, undefined, 'Invalid basic auth format');
      return this.createFailureResult('Invalid basic auth format');
    }

    const userRecord = this.users[credentials.username];
    if (!userRecord || userRecord.password !== credentials.password) {
      this.logAuthEvent('auth_failure', req, undefined, 'Invalid credentials');
      return this.createFailureResult('Invalid credentials');
    }

    // Create full user object
    const user: AuthenticatedUser = {
      id: userRecord.user.id || `user-${credentials.username}`,
      username: credentials.username,
      email: userRecord.user.email,
      roles: userRecord.user.roles || ['user'],
      permissions: userRecord.user.permissions || {
        canRead: true,
        canWrite: false,
        canDelete: false
      },
      metadata: userRecord.user.metadata
    };

    this.logAuthEvent('auth_success', req, user);
    return this.createSuccessResult(user);
  }
}

/**
 * API Key Strategy Implementation
 */
class ApiKeyStrategy extends BaseAuthStrategy {
  private apiKeys: Record<string, AuthenticatedUser>;
  private headerName: string;

  constructor(config: AuthStrategyConfig & { 
    apiKeys: Record<string, AuthenticatedUser>; 
    headerName?: string 
  }) {
    super(config);
    this.apiKeys = config.apiKeys;
    this.headerName = config.headerName || 'X-API-Key';
  }

  async authenticate(req: Request, context: HandlerContext): Promise<AuthenticationResult> {
    this.logAuthEvent('auth_attempt', req);

    const apiKey = req.headers.get(this.headerName);
    if (!apiKey) {
      this.logAuthEvent('auth_failure', req, undefined, `Missing ${this.headerName} header`);
      return this.createFailureResult(`Missing ${this.headerName} header`);
    }

    const user = this.apiKeys[apiKey];
    if (!user) {
      this.logAuthEvent('auth_failure', req, undefined, 'Invalid API key');
      return this.createFailureResult('Invalid API key');
    }

    this.logAuthEvent('auth_success', req, user);
    return this.createSuccessResult(user);
  }

  canHandle(req: Request): boolean {
    if (!super.canHandle(req)) return false;
    return Boolean(req.headers.get(this.headerName));
  }

  challenge(req: Request): Response {
    return new Response(
      JSON.stringify({
        error: 'API Key authentication required',
        message: `Please provide a valid API key in the ${this.headerName} header`
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/fhir+json',
          'X-Required-Header': this.headerName
        }
      }
    );
  }
}

// ============================================================================
// Storage Implementations
// ============================================================================

/**
 * In-Memory Token Storage (for development/testing)
 */
class MemoryTokenStorage implements TokenStorage {
  private tokens = new Map<string, { user: AuthenticatedUser; expiresAt?: Date }>();

  async store(token: string, user: AuthenticatedUser, expiresAt?: Date): Promise<void> {
    this.tokens.set(token, { user, expiresAt });
    console.log(`📦 Token stored: ${token.slice(0, 8)}... for user ${user.username}`);
  }

  async retrieve(token: string): Promise<AuthenticatedUser | null> {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.tokens.delete(token);
      console.log(`⏰ Token expired and removed: ${token.slice(0, 8)}...`);
      return null;
    }
    
    console.log(`🔍 Token retrieved: ${token.slice(0, 8)}... for user ${entry.user.username}`);
    return entry.user;
  }

  async revoke(token: string): Promise<void> {
    const deleted = this.tokens.delete(token);
    if (deleted) {
      console.log(`🗑️ Token revoked: ${token.slice(0, 8)}...`);
    }
  }

  async cleanup(): Promise<void> {
    const now = new Date();
    let cleaned = 0;
    
    for (const [token, entry] of this.tokens.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.tokens.delete(token);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired tokens`);
    }
  }
}

/**
 * In-Memory Session Storage (for development/testing)
 */
class MemorySessionStorage implements SessionStorage {
  private sessions = new Map<string, { data: SessionData; expiresAt?: Date }>();

  async create(sessionId: string, data: SessionData, expiresAt?: Date): Promise<void> {
    this.sessions.set(sessionId, { data, expiresAt });
    console.log(`🎫 Session created: ${sessionId} for user ${data.user.username}`);
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      console.log(`⏰ Session expired and removed: ${sessionId}`);
      return null;
    }
    
    // Update last accessed time
    entry.data.lastAccessedAt = new Date();
    return entry.data;
  }

  async update(sessionId: string, data: Partial<SessionData>): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.data = { ...entry.data, ...data };
      console.log(`🔄 Session updated: ${sessionId}`);
    }
  }

  async destroy(sessionId: string): Promise<void> {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      console.log(`💥 Session destroyed: ${sessionId}`);
    }
  }

  async cleanup(): Promise<void> {
    const now = new Date();
    let cleaned = 0;
    
    for (const [sessionId, entry] of this.sessions.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
    }
  }
}

// ============================================================================
// Example 1: Basic AuthManager Setup
// ============================================================================

function createBasicAuthManager(): AuthManager {
  console.log('🔧 Setting up basic AuthManager...');

  // Create strategies
  const basicAuth = new BasicAuthStrategy({
    name: 'basic-auth',
    priority: 100,
    users: {
      'admin': {
        password: 'secure-password',
        user: {
          id: 'admin-001',
          email: 'admin@hospital.com',
          roles: ['admin', 'user'],
          permissions: {
            canRead: true,
            canWrite: true,
            canDelete: true,
            resources: {
              '*': { read: true, create: true, update: true, delete: true, search: true }
            }
          }
        }
      },
      'doctor': {
        password: 'doctor-pass',
        user: {
          id: 'doctor-001',
          email: 'doctor@hospital.com',
          roles: ['doctor', 'user'],
          permissions: {
            canRead: true,
            canWrite: true,
            canDelete: false,
            resources: {
              'Patient': { read: true, create: true, update: true, search: true },
              'Observation': { read: true, create: true, update: true, search: true }
            }
          }
        }
      }
    }
  });

  const apiKey = new ApiKeyStrategy({
    name: 'api-key',
    priority: 200,
    headerName: 'X-API-Key',
    apiKeys: {
      'pk_live_12345': {
        id: 'api-client-001',
        username: 'api-client',
        roles: ['api-user'],
        permissions: {
          canRead: true,
          canWrite: false,
          canDelete: false,
          resources: {
            'Patient': { read: true, search: true },
            'Observation': { read: true, search: true }
          }
        }
      }
    }
  });

  // Create storage
  const tokenStorage = new MemoryTokenStorage();
  const sessionStorage = new MemorySessionStorage();

  // Create AuthManager
  const authManager = new AuthManager({
    strategies: [basicAuth, apiKey],
    tokenStorage,
    sessionStorage,
    requireAuth: true,
    skipPaths: ['/metadata', '/health', '/.well-known/*'],
    auditEnabled: true
  });

  console.log('✅ AuthManager setup complete');
  return authManager;
}

// ============================================================================
// Example 2: Authentication Flow Demonstration
// ============================================================================

async function demonstrateAuthenticationFlow(): Promise<void> {
  console.log('\n🔐 Demonstrating Authentication Flow...\n');

  const authManager = createBasicAuthManager();
  
  const testScenarios = [
    {
      name: 'API Key Authentication (High Priority)',
      request: new Request('https://fhir.example.com/Patient', {
        headers: { 'X-API-Key': 'pk_live_12345' }
      })
    },
    {
      name: 'Basic Auth Authentication (Lower Priority)',
      request: new Request('https://fhir.example.com/Patient', {
        headers: { 'Authorization': 'Basic ' + btoa('admin:secure-password') }
      })
    },
    {
      name: 'Multiple Headers (API Key Wins)',
      request: new Request('https://fhir.example.com/Patient', {
        headers: {
          'X-API-Key': 'pk_live_12345',
          'Authorization': 'Basic ' + btoa('doctor:doctor-pass')
        }
      })
    },
    {
      name: 'Invalid API Key (Fallback to Basic)',
      request: new Request('https://fhir.example.com/Patient', {
        headers: {
          'X-API-Key': 'invalid-key',
          'Authorization': 'Basic ' + btoa('admin:secure-password')
        }
      })
    },
    {
      name: 'Skip Path (No Auth Required)',
      request: new Request('https://fhir.example.com/metadata')
    },
    {
      name: 'Authentication Failure',
      request: new Request('https://fhir.example.com/Patient', {
        headers: { 'Authorization': 'Basic invalid' }
      })
    }
  ];

  const context: HandlerContext = {
    requestId: 'test-request',
    timestamp: new Date()
  } as HandlerContext;

  for (const scenario of testScenarios) {
    console.log(`--- ${scenario.name} ---`);
    
    try {
      const result = await authManager.authenticate(scenario.request, context);
      
      if (result.success) {
        console.log(`✅ Authentication successful`);
        console.log(`   User: ${result.user?.username || 'anonymous'}`);
        console.log(`   Roles: ${result.user?.roles.join(', ') || 'none'}`);
      } else {
        console.log(`❌ Authentication failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`💥 Error: ${error}`);
    }
    
    console.log('');
  }
}

// ============================================================================
// Example 3: Storage Operations
// ============================================================================

async function demonstrateStorageOperations(): Promise<void> {
  console.log('💾 Demonstrating Storage Operations...\n');

  const authManager = createBasicAuthManager();
  
  // Token operations
  console.log('📦 Token Storage Operations:');
  
  const testUser: AuthenticatedUser = {
    id: 'test-user-123',
    username: 'testuser',
    roles: ['user'],
    permissions: { canRead: true, canWrite: false, canDelete: false }
  };

  // Store token
  const token = 'test-token-' + Date.now();
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour
  await authManager.storeToken(token, testUser, expiresAt);

  // Retrieve token
  const retrievedUser = await authManager.getTokenUser(token);
  console.log(`Retrieved user: ${retrievedUser?.username}`);

  // Session operations
  console.log('\n🎫 Session Storage Operations:');
  
  const sessionId = 'session-' + Date.now();
  await authManager.createSession(sessionId, testUser);
  
  const sessionUser = await authManager.getSession(sessionId);
  console.log(`Session user: ${sessionUser?.username}`);

  // Cleanup
  console.log('\n🧹 Cleanup Operations:');
  await authManager.cleanup();

  // Revoke token
  await authManager.revokeToken(token);
  const revokedUser = await authManager.getTokenUser(token);
  console.log(`Token after revocation: ${revokedUser ? 'still exists' : 'revoked'}`);

  // Destroy session
  await authManager.destroySession(sessionId);
  const destroyedSession = await authManager.getSession(sessionId);
  console.log(`Session after destruction: ${destroyedSession ? 'still exists' : 'destroyed'}`);
}

// ============================================================================
// Example 4: Middleware Integration
// ============================================================================

async function demonstrateMiddlewareIntegration(): Promise<void> {
  console.log('\n🔧 Demonstrating Middleware Integration...\n');

  const authManager = createBasicAuthManager();
  
  // Create middleware
  const authMiddleware = authManager.middleware({
    skipPaths: ['/public/*'],
    requireAuth: true
  });

  console.log(`Middleware name: ${authMiddleware.name}`);
  console.log(`Has before hook: ${typeof authMiddleware.before === 'function'}`);

  // Simulate middleware execution
  console.log('\n🔄 Simulating middleware execution:');

  const testRequests = [
    {
      name: 'Authenticated Request',
      request: new Request('https://fhir.example.com/Patient', {
        headers: { 'X-API-Key': 'pk_live_12345' }
      })
    },
    {
      name: 'Public Path Request',
      request: new Request('https://fhir.example.com/public/info')
    },
    {
      name: 'Unauthenticated Request',
      request: new Request('https://fhir.example.com/Patient')
    }
  ];

  for (const test of testRequests) {
    console.log(`--- ${test.name} ---`);
    
    const context: HandlerContext = {
      requestId: `req-${Date.now()}`,
      timestamp: new Date()
    } as HandlerContext;

    try {
      if (authMiddleware.before) {
        await authMiddleware.before(test.request, context);
        
        // Check if context was enhanced
        const enhancedContext = context as any;
        if (enhancedContext.isAuthenticated !== undefined) {
          console.log(`✅ Context enhanced - Authenticated: ${enhancedContext.isAuthenticated}`);
          if (enhancedContext.user) {
            console.log(`   User: ${enhancedContext.user.username}`);
          }
        } else {
          console.log('ℹ️ Context not enhanced (public path or error)');
        }
      }
    } catch (error: any) {
      if (error.name === 'AuthenticationError') {
        console.log(`❌ Authentication required: ${error.message}`);
        console.log(`   Response status: ${error.response.status}`);
      } else {
        console.log(`💥 Error: ${error.message}`);
      }
    }
    
    console.log('');
  }
}

// ============================================================================
// Example 5: Statistics and Monitoring
// ============================================================================

async function demonstrateStatistics(): Promise<void> {
  console.log('📊 Demonstrating Statistics and Monitoring...\n');

  const authManager = createBasicAuthManager();
  
  // Perform various authentication attempts
  const testRequests = [
    new Request('https://fhir.example.com/Patient', {
      headers: { 'X-API-Key': 'pk_live_12345' }
    }),
    new Request('https://fhir.example.com/Patient', {
      headers: { 'Authorization': 'Basic ' + btoa('admin:secure-password') }
    }),
    new Request('https://fhir.example.com/Patient', {
      headers: { 'X-API-Key': 'invalid-key' }
    }),
    new Request('https://fhir.example.com/metadata')
  ];

  const context: HandlerContext = {
    requestId: 'stats-test',
    timestamp: new Date()
  } as HandlerContext;

  console.log('🔄 Performing test authentications...');
  for (const req of testRequests) {
    await authManager.authenticate(req, context);
  }

  // Get statistics
  const stats = authManager.getStatistics();
  console.log('\n📈 Authentication Statistics:');
  console.log(`   Total strategies: ${stats.totalStrategies}`);
  console.log(`   Total attempts: ${stats.totalAttempts}`);
  console.log(`   Successful attempts: ${stats.successfulAttempts}`);
  console.log(`   Failed attempts: ${stats.failedAttempts}`);
  console.log(`   Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`   Average auth time: ${stats.averageAuthTime.toFixed(2)}ms`);
  console.log(`   Strategies used: ${stats.strategiesUsed.join(', ')}`);

  // Get audit events
  const auditEvents = authManager.getAuditEvents(10);
  console.log(`\n📋 Recent Audit Events (${auditEvents.length}):`);
  auditEvents.forEach((event, index) => {
    console.log(`   ${index + 1}. ${event.type} - ${event.success ? '✅' : '❌'} (${event.strategy})`);
    if (event.username) {
      console.log(`      User: ${event.username}`);
    }
    if (event.error) {
      console.log(`      Error: ${event.error}`);
    }
  });
}

// ============================================================================
// Example 6: Dynamic Strategy Management
// ============================================================================

async function demonstrateDynamicManagement(): Promise<void> {
  console.log('\n🔄 Demonstrating Dynamic Strategy Management...\n');

  const authManager = new AuthManager({
    strategies: [], // Start empty
    requireAuth: true
  });

  // Add strategies dynamically
  console.log('➕ Adding strategies dynamically:');
  
  const basicAuth = new BasicAuthStrategy({
    name: 'dynamic-basic',
    priority: 100,
    users: {
      'test': {
        password: 'test',
        user: {
          id: 'test-user',
          roles: ['user'],
          permissions: { canRead: true }
        }
      }
    }
  });

  authManager.registerStrategy(basicAuth);
  console.log(`   Registered: ${basicAuth.name}`);
  
  // Try authentication
  const testReq = new Request('https://fhir.example.com/Patient', {
    headers: { 'Authorization': 'Basic ' + btoa('test:test') }
  });

  let result = await authManager.authenticate(testReq, {
    requestId: 'dynamic-test',
    timestamp: new Date()
  } as HandlerContext);

  console.log(`   Authentication: ${result.success ? '✅ Success' : '❌ Failed'}`);

  // Remove strategy
  console.log('\n➖ Removing strategy:');
  const removed = authManager.unregisterStrategy('dynamic-basic');
  console.log(`   Removed ${basicAuth.name}: ${removed ? '✅' : '❌'}`);

  // Try authentication again
  result = await authManager.authenticate(testReq, {
    requestId: 'dynamic-test-2',
    timestamp: new Date()
  } as HandlerContext);

  console.log(`   Authentication after removal: ${result.success ? '✅ Success' : '❌ Failed'}`);
  if (!result.success) {
    console.log(`   Error: ${result.error}`);
  }

  // List all strategies
  const allStrategies = authManager.getAllStrategies();
  console.log(`\n📋 Current strategies: ${allStrategies.length}`);
  allStrategies.forEach(strategy => {
    console.log(`   - ${strategy.name} (priority: ${strategy.priority})`);
  });
}

// ============================================================================
// Main Execution
// ============================================================================

async function runAllExamples(): Promise<void> {
  console.log('🚀 AuthManager Usage Examples\n');
  console.log('=' .repeat(60));

  try {
    await demonstrateAuthenticationFlow();
    console.log('=' .repeat(60));
    
    await demonstrateStorageOperations();
    console.log('=' .repeat(60));
    
    await demonstrateMiddlewareIntegration();
    console.log('=' .repeat(60));
    
    await demonstrateStatistics();
    console.log('=' .repeat(60));
    
    await demonstrateDynamicManagement();
    console.log('=' .repeat(60));

    console.log('\n✅ All AuthManager examples completed successfully!');
    console.log('📝 These examples demonstrate comprehensive authentication management capabilities.');
    
  } catch (error) {
    console.error('💥 Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (import.meta.main) {
  await runAllExamples();
}

// Export for use in other files
export {
  BasicAuthStrategy,
  ApiKeyStrategy,
  MemoryTokenStorage,
  MemorySessionStorage,
  createBasicAuthManager
};