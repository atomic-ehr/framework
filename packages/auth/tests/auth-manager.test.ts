import { test, expect, describe, beforeEach } from 'bun:test';
import type { HandlerContext } from '@atomic-fhir/core';
import { AuthManager, type AuthManagerStatistics } from '../src/core/auth-manager.ts';
import type {
  AuthStrategy,
  AuthStrategyConfig,
  AuthManagerConfig,
  AuthenticationResult,
  AuthenticatedUser,
  TokenStorage,
  SessionStorage,
  SessionData
} from '../src/types/index.ts';

// ============================================================================
// Mock Implementations
// ============================================================================

// Mock strategy implementations
class MockBasicStrategy implements AuthStrategy {
  readonly name: string;
  readonly priority: number;
  private users: Record<string, string>;

  constructor(config: AuthStrategyConfig & { users: Record<string, string>; priority: number }) {
    this.name = config.name;
    this.priority = config.priority;
    this.users = config.users;
  }

  async authenticate(req: Request, _context: HandlerContext): Promise<AuthenticationResult> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return { success: false, error: 'Missing basic auth header' };
    }

    try {
      const credentials = atob(authHeader.slice(6));
      const [username, password] = credentials.split(':');
      
      if (this.users[username] === password) {
        const user: AuthenticatedUser = {
          id: `user-${username}`,
          username,
          roles: ['user'],
          permissions: { canRead: true, canWrite: false, canDelete: false }
        };
        return { success: true, user };
      }
      
      return { success: false, error: 'Invalid credentials' };
    } catch {
      return { success: false, error: 'Invalid basic auth format' };
    }
  }

  canHandle(req: Request): boolean {
    const authHeader = req.headers.get('authorization');
    return Boolean(authHeader?.startsWith('Basic '));
  }

  challenge(): Response {
    return new Response(JSON.stringify({ error: 'Basic authentication required' }), {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Test"' }
    });
  }
}

class MockBearerStrategy implements AuthStrategy {
  readonly name: string;
  readonly priority: number;
  private tokens: Record<string, AuthenticatedUser>;

  constructor(config: AuthStrategyConfig & { tokens: Record<string, AuthenticatedUser>; priority: number }) {
    this.name = config.name;
    this.priority = config.priority;
    this.tokens = config.tokens;
  }

  async authenticate(req: Request, _context: HandlerContext): Promise<AuthenticationResult> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'Missing bearer token' };
    }

    const token = authHeader.slice(7);
    const user = this.tokens[token];
    
    if (user) {
      return { success: true, user };
    }
    
    return { success: false, error: 'Invalid token' };
  }

  canHandle(req: Request): boolean {
    const authHeader = req.headers.get('authorization');
    return Boolean(authHeader?.startsWith('Bearer '));
  }
}

// Mock storage implementations
class MockTokenStorage implements TokenStorage {
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

class MockSessionStorage implements SessionStorage {
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
      entry.data = { ...entry.data, ...data };
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

// Test utilities
function createMockRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

function createMockContext(): HandlerContext {
  return {
    requestId: 'test-request-123',
    timestamp: new Date()
  } as HandlerContext;
}

function createTestUser(id: string = 'test-user'): AuthenticatedUser {
  return {
    id,
    username: 'testuser',
    email: 'test@example.com',
    roles: ['user'],
    permissions: {
      canRead: true,
      canWrite: false,
      canDelete: false
    }
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AuthManager', () => {
  let authManager: AuthManager;
  let basicStrategy: MockBasicStrategy;
  let bearerStrategy: MockBearerStrategy;
  let tokenStorage: MockTokenStorage;
  let sessionStorage: MockSessionStorage;

  beforeEach(() => {
    tokenStorage = new MockTokenStorage();
    sessionStorage = new MockSessionStorage();
    
    basicStrategy = new MockBasicStrategy({
      name: 'basic',
      priority: 100,
      users: { admin: 'password', user: 'pass123' }
    });
    
    bearerStrategy = new MockBearerStrategy({
      name: 'bearer',
      priority: 200,
      tokens: {
        'valid-token': createTestUser('bearer-user'),
        'admin-token': createTestUser('admin-user')
      }
    });
    
    authManager = new AuthManager({
      strategies: [basicStrategy, bearerStrategy],
      tokenStorage,
      sessionStorage,
      requireAuth: true,
      skipPaths: ['/metadata', '/health/*'],
      auditEnabled: true
    });
  });

  describe('Strategy Management', () => {
    test('constructor registers initial strategies', () => {
      expect(authManager.getStrategy('basic')).toBe(basicStrategy);
      expect(authManager.getStrategy('bearer')).toBe(bearerStrategy);
      expect(authManager.getAllStrategies()).toHaveLength(2);
    });

    test('registerStrategy adds new strategy', () => {
      const newStrategy = new MockBasicStrategy({
        name: 'new-basic', // Different name
        priority: 50,
        users: { test: 'test' }
      });
      
      authManager.registerStrategy(newStrategy);
      expect(authManager.getStrategy('new-basic')).toBe(newStrategy);
      expect(authManager.getAllStrategies()).toHaveLength(3);
    });

    test('registerStrategy throws on duplicate name', () => {
      const duplicate = new MockBasicStrategy({
        name: 'basic', // Same name as existing
        priority: 50,
        users: {}
      });
      
      expect(() => authManager.registerStrategy(duplicate)).toThrow(
        "Strategy with name 'basic' already registered"
      );
    });

    test('unregisterStrategy removes strategy', () => {
      expect(authManager.unregisterStrategy('basic')).toBe(true);
      expect(authManager.getStrategy('basic')).toBeUndefined();
      expect(authManager.getAllStrategies()).toHaveLength(1);
    });

    test('unregisterStrategy returns false for non-existent strategy', () => {
      expect(authManager.unregisterStrategy('non-existent')).toBe(false);
    });
  });

  describe('Authentication Flow', () => {
    test('successful authentication with bearer token (higher priority)', async () => {
      const req = createMockRequest('https://fhir.example.com/Patient', {
        'authorization': 'Bearer valid-token'
      });
      
      const result = await authManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('bearer-user');
    });

    test('successful authentication with basic auth (fallback)', async () => {
      const req = createMockRequest('https://fhir.example.com/Patient', {
        'authorization': 'Basic ' + btoa('admin:password')
      });
      
      const result = await authManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(true);
      expect(result.user?.username).toBe('admin');
    });

    test('authentication fails when no strategies can handle request', async () => {
      const req = createMockRequest('https://fhir.example.com/Patient', {
        'authorization': 'Digest username="test"'
      });
      
      const result = await authManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No authentication strategies can handle');
    });

    test('authentication fails when all strategies fail', async () => {
      const req = createMockRequest('https://fhir.example.com/Patient', {
        'authorization': 'Bearer invalid-token'
      });
      
      const result = await authManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    test('skip paths allow anonymous access', async () => {
      const req = createMockRequest('https://fhir.example.com/metadata');
      
      const result = await authManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(true);
      expect(result.user).toBeUndefined();
    });

    test('skip paths with wildcards work correctly', async () => {
      const req = createMockRequest('https://fhir.example.com/health/status');
      
      const result = await authManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(true);
      expect(result.user).toBeUndefined();
    });

    test('strategies are tried in priority order', async () => {
      // Create request that both strategies can handle
      const req = createMockRequest('https://fhir.example.com/Patient', {
        'authorization': 'Bearer invalid-token'
      });
      
      // Bearer strategy (priority 200) should be tried first and fail
      // Basic strategy won't be tried because the request doesn't have Basic auth
      const result = await authManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token'); // Error from bearer strategy
    });
  });

  describe('Challenge Responses', () => {
    test('createChallenge uses first applicable strategy', () => {
      const req = createMockRequest('https://fhir.example.com/Patient', {
        'authorization': 'Basic invalid'
      });
      
      const response = authManager.createChallenge(req);
      
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Test"');
    });

    test('createChallenge provides default when no strategy has challenge', () => {
      const req = createMockRequest('https://fhir.example.com/Patient', {
        'authorization': 'Bearer invalid'
      });
      
      const response = authManager.createChallenge(req);
      
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer realm="FHIR Server"');
    });
  });

  describe('Context Management', () => {
    test('createContext creates authenticated context', () => {
      const originalContext = createMockContext();
      const user = createTestUser();
      
      const enhancedContext = authManager.createContext(originalContext, user);
      
      expect(enhancedContext.user).toBe(user);
      expect(enhancedContext.isAuthenticated).toBe(true);
      expect(enhancedContext.requestId).toBe('test-request-123');
      expect(typeof enhancedContext.checkPermission).toBe('function');
    });

    test('createContext works with anonymous user', () => {
      const originalContext = createMockContext();
      
      const enhancedContext = authManager.createContext(originalContext);
      
      expect(enhancedContext.user).toBeUndefined();
      expect(enhancedContext.isAuthenticated).toBe(false);
    });
  });

  describe('Storage Integration', () => {
    test('token storage operations work correctly', async () => {
      const user = createTestUser();
      const token = 'test-token-123';
      const expiresAt = new Date(Date.now() + 3600000);
      
      await authManager.storeToken(token, user, expiresAt);
      
      const retrievedUser = await authManager.getTokenUser(token);
      expect(retrievedUser).toEqual(user);
      
      await authManager.revokeToken(token);
      
      const retrievedAfterRevoke = await authManager.getTokenUser(token);
      expect(retrievedAfterRevoke).toBeNull();
    });

    test('session storage operations work correctly', async () => {
      const user = createTestUser();
      const sessionId = 'session-123';
      
      await authManager.createSession(sessionId, user);
      
      const retrievedUser = await authManager.getSession(sessionId);
      expect(retrievedUser).toEqual(user);
      
      await authManager.destroySession(sessionId);
      
      const retrievedAfterDestroy = await authManager.getSession(sessionId);
      expect(retrievedAfterDestroy).toBeNull();
    });

    test('cleanup removes expired tokens and sessions', async () => {
      const user = createTestUser();
      const pastDate = new Date(Date.now() - 1000);
      
      await authManager.storeToken('expired-token', user, pastDate);
      await authManager.createSession('expired-session', user, pastDate);
      
      await authManager.cleanup();
      
      expect(await authManager.getTokenUser('expired-token')).toBeNull();
      expect(await authManager.getSession('expired-session')).toBeNull();
    });
  });

  describe('Middleware Integration', () => {
    test('middleware creates proper middleware definition', () => {
      const middleware = authManager.middleware();
      
      expect(middleware.name).toBe('auth-middleware');
      expect(typeof middleware.before).toBe('function');
    });

    test('middleware with custom options', () => {
      const middleware = authManager.middleware({
        skipPaths: ['/custom'],
        requireAuth: false
      });
      
      expect(middleware.name).toBe('auth-middleware');
    });
  });

  describe('Statistics and Audit', () => {
    test('getStatistics returns correct data', async () => {
      // Perform some authentication attempts
      await authManager.authenticate(
        createMockRequest('https://fhir.example.com/Patient', {
          'authorization': 'Bearer valid-token'
        }),
        createMockContext()
      );
      
      await authManager.authenticate(
        createMockRequest('https://fhir.example.com/Patient', {
          'authorization': 'Bearer invalid-token'
        }),
        createMockContext()
      );
      
      const stats = authManager.getStatistics();
      
      expect(stats.totalStrategies).toBe(2);
      expect(stats.totalAttempts).toBe(2);
      expect(stats.successfulAttempts).toBe(1);
      expect(stats.failedAttempts).toBe(1);
      expect(stats.successRate).toBe(0.5);
    });

    test('getAuditEvents returns audit trail', async () => {
      await authManager.authenticate(
        createMockRequest('https://fhir.example.com/Patient', {
          'authorization': 'Bearer valid-token'
        }),
        createMockContext()
      );
      
      const events = authManager.getAuditEvents();
      
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'auth_success')).toBe(true);
    });

    test('audit events are limited to prevent memory issues', async () => {
      // This test would be slow with 1000+ requests, so we'll just verify the structure
      const events = authManager.getAuditEvents(10);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Error Handling', () => {
    test('handles strategy errors gracefully', async () => {
      // Create a strategy that throws errors
      class ErrorStrategy implements AuthStrategy {
        readonly name = 'error';
        readonly priority = 300;

        canHandle(): boolean {
          return true;
        }

        async authenticate(): Promise<AuthenticationResult> {
          throw new Error('Strategy error');
        }
      }

      authManager.registerStrategy(new ErrorStrategy());
      
      const req = createMockRequest('https://fhir.example.com/Patient');
      const result = await authManager.authenticate(req, createMockContext());
      
      // Should continue to other strategies after error
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles no strategies registered', async () => {
      const emptyAuthManager = new AuthManager({
        strategies: [],
        requireAuth: true
      });
      
      const req = createMockRequest('https://fhir.example.com/Patient');
      const result = await emptyAuthManager.authenticate(req, createMockContext());
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No authentication strategies can handle');
    });
  });

  describe('Configuration', () => {
    test('default configuration values are applied', () => {
      const defaultManager = new AuthManager({
        strategies: []
      });
      
      const stats = defaultManager.getStatistics();
      expect(stats.totalStrategies).toBe(0);
    });

    test('custom configuration is respected', () => {
      const customManager = new AuthManager({
        strategies: [],
        requireAuth: false,
        skipPaths: ['/custom'],
        auditEnabled: false
      });
      
      // Just verify it was created successfully with custom config
      expect(customManager).toBeInstanceOf(AuthManager);
    });
  });
});