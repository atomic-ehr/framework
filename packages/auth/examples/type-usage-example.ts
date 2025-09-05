// Comprehensive example showing all auth types in realistic usage patterns
import {
  AuthStrategy,
  AuthStrategyConfig,
  AuthenticationResult,
  AuthenticatedUser,
  TokenInfo,
  FHIRPermissions,
  ResourcePermissions,
  BasicAuthConfig,
  JWTConfig,
  BearerTokenConfig,
  OAuth2Config,
  TokenStorage,
  SessionStorage,
  SessionData,
  AuthManagerConfig,
  AuthenticatedContext,
  AuthMiddlewareConfig,
  AuthAuditEvent,
  AuthEventType,
  AuthenticationError,
  AuthorizationError,
  TokenError,
  PermissionCondition
} from '../src/types/index.ts';

// ============================================================================
// Example 1: Authentication Strategy Implementation
// ============================================================================

class ExampleJWTStrategy implements AuthStrategy {
  readonly name = 'jwt';
  readonly priority = 100;
  
  constructor(private config: JWTConfig) {}
  
  async authenticate(req: Request): Promise<AuthenticationResult> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'Missing or invalid authorization header',
        statusCode: 401
      };
    }
    
    // Mock JWT validation
    const user: AuthenticatedUser = {
      id: 'user-123',
      username: 'john.doe',
      email: 'john@example.com',
      roles: ['doctor', 'user'],
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        resources: {
          'Patient': {
            read: true,
            write: true,
            search: true,
            create: true
          },
          'Observation': {
            read: true,
            write: false,
            search: true
          }
        },
        operations: {
          'patient-everything': true,
          'patient-match': false
        }
      },
      tokenInfo: {
        type: 'jwt',
        token: authHeader.split(' ')[1],
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000) // 1 hour
      }
    };
    
    return {
      success: true,
      user
    };
  }
  
  canHandle(req: Request): boolean {
    const authHeader = req.headers.get('authorization');
    return Boolean(authHeader?.startsWith('Bearer '));
  }
  
  challenge(): Response {
    return new Response(
      JSON.stringify({ error: 'JWT authentication required' }),
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer realm="FHIR Server"',
          'Content-Type': 'application/fhir+json'
        }
      }
    );
  }
}

// ============================================================================
// Example 2: Token Storage Implementation
// ============================================================================

class MemoryTokenStorage implements TokenStorage {
  private tokens = new Map<string, { user: AuthenticatedUser; expiresAt?: Date }>();
  
  async store(token: string, user: AuthenticatedUser, expiresAt?: Date): Promise<void> {
    this.tokens.set(token, { user, expiresAt });
  }
  
  async retrieve(token: string): Promise<AuthenticatedUser | null> {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.tokens.delete(token);
      return null;
    }
    
    return entry.user;
  }
  
  async revoke(token: string): Promise<void> {
    this.tokens.delete(token);
  }
  
  async cleanup(): Promise<void> {
    const now = new Date();
    for (const [token, entry] of this.tokens.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.tokens.delete(token);
      }
    }
  }
}

// ============================================================================
// Example 3: Session Storage Implementation  
// ============================================================================

class MemorySessionStorage implements SessionStorage {
  private sessions = new Map<string, { data: SessionData; expiresAt?: Date }>();
  
  async create(sessionId: string, data: SessionData, expiresAt?: Date): Promise<void> {
    this.sessions.set(sessionId, { data, expiresAt });
  }
  
  async get(sessionId: string): Promise<SessionData | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      return null;
    }
    
    return entry.data;
  }
  
  async update(sessionId: string, data: Partial<SessionData>): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.data = { ...entry.data, ...data, lastAccessedAt: new Date() };
    }
  }
  
  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
  
  async cleanup(): Promise<void> {
    const now = new Date();
    for (const [sessionId, entry] of this.sessions.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

// ============================================================================
// Example 4: Configuration Examples
// ============================================================================

// Basic Auth Configuration
const basicAuthConfig: BasicAuthConfig = {
  name: 'basic',
  priority: 50,
  enabled: true,
  users: {
    'admin': '$2b$10$hash.of.password',
    'doctor': '$2b$10$another.hash'
  },
  hashPasswords: true,
  realm: 'FHIR Server',
  skipPaths: ['/metadata', '/health']
};

// JWT Configuration
const jwtConfig: JWTConfig = {
  name: 'jwt',
  priority: 100,
  enabled: true,
  secret: process.env.JWT_SECRET || 'dev-secret',
  issuer: 'fhir-server',
  audience: 'fhir-clients',
  algorithm: 'HS256',
  expiresIn: '1h',
  clockTolerance: 30,
  onlyPaths: ['/fhir/*']
};

// OAuth2/SMART on FHIR Configuration
const smartConfig: OAuth2Config = {
  name: 'smart-on-fhir',
  priority: 150,
  enabled: true,
  clientId: 'my-smart-app',
  clientSecret: 'client-secret',
  authorizationUrl: 'https://auth.fhir-server.com/oauth2/authorize',
  tokenUrl: 'https://auth.fhir-server.com/oauth2/token',
  userInfoUrl: 'https://auth.fhir-server.com/oauth2/userinfo',
  scopes: ['patient/*.read', 'user/*.read', 'launch'],
  redirectUri: 'https://my-app.com/callback',
  pkce: true
};

// Auth Manager Configuration
const authManagerConfig: AuthManagerConfig = {
  strategies: [], // Would contain actual strategy instances
  defaultRole: 'user',
  requireAuth: true,
  skipPaths: ['/metadata', '/health', '/.well-known/*'],
  sessionStorage: new MemorySessionStorage(),
  tokenStorage: new MemoryTokenStorage(),
  auditEnabled: true
};

// ============================================================================
// Example 5: Permission System Usage
// ============================================================================

// Complex permission conditions
const doctorPermissions: FHIRPermissions = {
  canRead: true,
  canWrite: true,
  canDelete: false,
  resources: {
    'Patient': {
      read: true,
      write: true,
      search: true,
      create: true,
      conditions: [
        {
          field: 'generalPractitioner.reference',
          operator: 'contains',
          value: 'Practitioner/dr-123'
        } as PermissionCondition
      ]
    },
    'Observation': {
      read: true,
      write: true,
      search: true,
      create: true,
      conditions: [
        {
          field: 'performer.reference',
          operator: 'eq',
          value: 'Practitioner/dr-123'
        }
      ]
    },
    'DiagnosticReport': {
      read: true,
      write: false,
      search: true
    }
  },
  operations: {
    'patient-everything': true,
    'composition-document': false
  }
};

// ============================================================================
// Example 6: Audit Logging
// ============================================================================

function createAuditEvent(
  type: AuthEventType,
  strategy: string,
  user?: AuthenticatedUser,
  success: boolean = true,
  error?: string
): AuthAuditEvent {
  return {
    type,
    timestamp: new Date(),
    userId: user?.id,
    username: user?.username,
    strategy,
    success,
    error,
    metadata: {
      roles: user?.roles,
      tokenType: user?.tokenInfo?.type
    }
  };
}

// Example audit events
const successEvent = createAuditEvent('auth_success', 'jwt', {
  id: 'user-123',
  username: 'john.doe',
  roles: ['doctor'],
  permissions: doctorPermissions
});

const failureEvent = createAuditEvent(
  'auth_failure',
  'jwt', 
  undefined,
  false,
  'Invalid JWT signature'
);

// ============================================================================
// Example 7: Error Handling
// ============================================================================

function handleAuthenticationErrors() {
  try {
    // Simulate authentication failure
    throw new AuthenticationError('Invalid credentials', 401, 'INVALID_CREDS');
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log(`Auth Error: ${error.message} (${error.statusCode})`);
    }
  }
  
  try {
    // Simulate authorization failure  
    throw new AuthorizationError('Insufficient permissions', 403, 'INSUFFICIENT_PERMS');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      console.log(`Authorization Error: ${error.message} (${error.statusCode})`);
    }
  }
  
  try {
    // Simulate token error
    throw new TokenError('Token expired', 401, 'TOKEN_EXPIRED');
  } catch (error) {
    if (error instanceof TokenError) {
      console.log(`Token Error: ${error.message} (${error.statusCode})`);
    }
  }
}

// ============================================================================
// Example Test Execution
// ============================================================================

async function runExamples() {
  console.log('🚀 Running comprehensive auth types examples...\n');
  
  // Test strategy
  console.log('1. Testing JWT Strategy:');
  const strategy = new ExampleJWTStrategy(jwtConfig);
  const mockRequest = new Request('https://fhir.example.com/Patient', {
    headers: { 'authorization': 'Bearer mock-jwt-token' }
  });
  
  const result = await strategy.authenticate(mockRequest);
  console.log(`   Authentication: ${result.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`   User: ${result.user?.username || 'None'}\n`);
  
  // Test storage
  console.log('2. Testing Token Storage:');
  const tokenStorage = new MemoryTokenStorage();
  if (result.user) {
    await tokenStorage.store('test-token', result.user);
    const retrieved = await tokenStorage.retrieve('test-token');
    console.log(`   Storage: ${retrieved ? '✅ Working' : '❌ Failed'}\n`);
  }
  
  // Test error handling
  console.log('3. Testing Error Handling:');
  handleAuthenticationErrors();
  console.log('   ✅ Error types working correctly\n');
  
  // Test audit events
  console.log('4. Testing Audit Events:');
  console.log(`   Success Event: ${successEvent.type} at ${successEvent.timestamp}`);
  console.log(`   Failure Event: ${failureEvent.type} - ${failureEvent.error}\n`);
  
  console.log('✅ All type examples completed successfully!');
  console.log('✅ Types provide comprehensive authentication system foundation');
}

// Run examples if this file is executed directly
if (import.meta.main) {
  runExamples();
}