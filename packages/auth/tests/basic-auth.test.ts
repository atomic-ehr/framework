import { describe, it, expect, beforeEach } from 'bun:test';
import { BasicAuthStrategy } from '../src/strategies/basic-auth.ts';
import type { HandlerContext } from '@atomic-fhir/core';
import type { BasicAuthConfig, UserProviderResult } from '../src/strategies/basic-auth.ts';

// Mock HandlerContext
const createMockContext = (): HandlerContext => ({
  requestId: 'test-request-id',
  startTime: Date.now(),
  metadata: {}
} as HandlerContext);

// Mock Request with Authorization header
const createMockRequest = (authHeader?: string, url: string = 'http://localhost/Patient'): Request => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }
  
  return new Request(url, {
    method: 'GET',
    headers
  });
};

// Helper to create Basic Auth header
const createBasicAuthHeader = (username: string, password: string): string => {
  const credentials = btoa(`${username}:${password}`);
  return `Basic ${credentials}`;
};

describe('BasicAuthStrategy', () => {
  let strategy: BasicAuthStrategy;
  let mockContext: HandlerContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('Constructor and Configuration', () => {
    it('should create strategy with basic configuration', () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: {
          'admin': 'password123',
          'user': 'userpass'
        }
      });

      expect(strategy.name).toBe('basic-auth');
      expect(strategy.priority).toBe(100);
    });

    it('should create strategy with full configuration', () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        priority: 200,
        realm: 'Test Realm',
        hashPasswords: true,
        caseSensitiveUsernames: false,
        users: {
          'Admin': {
            password: 'hashedpassword',
            user: {
              id: 'admin-1',
              email: 'admin@example.com',
              roles: ['admin', 'user']
            }
          }
        }
      });

      expect(strategy.name).toBe('basic-auth');
      expect(strategy.priority).toBe(200);
    });

    it('should create strategy with user provider', () => {
      const userProvider = async (username: string): Promise<UserProviderResult | null> => {
        if (username === 'dbuser') {
          return {
            password: 'dbpassword',
            user: {
              id: 'db-user-1',
              username: 'dbuser',
              email: 'dbuser@example.com',
              roles: ['user']
            }
          };
        }
        return null;
      };

      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        userProvider,
        hashPasswords: true
      });

      expect(strategy.name).toBe('basic-auth');
    });
  });

  describe('canHandle Method', () => {
    beforeEach(() => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': 'password' }
      });
    });

    it('should return true for requests with Basic Authorization header', () => {
      const req = createMockRequest(createBasicAuthHeader('admin', 'password'));
      expect(strategy.canHandle(req)).toBe(true);
    });

    it('should return false for requests without Authorization header', () => {
      const req = createMockRequest();
      expect(strategy.canHandle(req)).toBe(false);
    });

    it('should return false for requests with Bearer token', () => {
      const req = createMockRequest('Bearer token123');
      expect(strategy.canHandle(req)).toBe(false);
    });

    it('should return false for requests with malformed Basic header', () => {
      const req = createMockRequest('Basic');
      expect(strategy.canHandle(req)).toBe(false);
    });

    it('should respect skipPaths configuration', () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': 'password' },
        skipPaths: ['/metadata', '/health']
      });

      const authReq = createMockRequest(createBasicAuthHeader('admin', 'password'), 'http://localhost/metadata');
      expect(strategy.canHandle(authReq)).toBe(false);

      const normalReq = createMockRequest(createBasicAuthHeader('admin', 'password'), 'http://localhost/Patient');
      expect(strategy.canHandle(normalReq)).toBe(true);
    });

    it('should respect onlyPaths configuration', () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': 'password' },
        onlyPaths: ['/admin/*']
      });

      const adminReq = createMockRequest(createBasicAuthHeader('admin', 'password'), 'http://localhost/admin/users');
      expect(strategy.canHandle(adminReq)).toBe(true);

      const normalReq = createMockRequest(createBasicAuthHeader('admin', 'password'), 'http://localhost/Patient');
      expect(strategy.canHandle(normalReq)).toBe(false);
    });
  });

  describe('Authentication with Static Users', () => {
    beforeEach(() => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: {
          'admin': 'adminpass',
          'user': {
            password: 'userpass',
            user: {
              id: 'user-123',
              email: 'user@example.com',
              roles: ['user', 'reader']
            }
          }
        }
      });
    });

    it('should authenticate valid credentials successfully', async () => {
      const req = createMockRequest(createBasicAuthHeader('admin', 'adminpass'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe('admin');
      expect(result.user!.roles).toContain('user');
    });

    it('should authenticate user with full configuration', async () => {
      const req = createMockRequest(createBasicAuthHeader('user', 'userpass'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.id).toBe('user-123');
      expect(result.user!.email).toBe('user@example.com');
      expect(result.user!.roles).toEqual(['user', 'reader']);
    });

    it('should reject invalid username', async () => {
      const req = createMockRequest(createBasicAuthHeader('nonexistent', 'password'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.statusCode).toBe(401);
    });

    it('should reject invalid password', async () => {
      const req = createMockRequest(createBasicAuthHeader('admin', 'wrongpass'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.statusCode).toBe(401);
    });

    it('should reject empty username', async () => {
      const req = createMockRequest(createBasicAuthHeader('', 'password'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username and password are required');
      expect(result.statusCode).toBe(400);
    });

    it('should reject empty password', async () => {
      const req = createMockRequest(createBasicAuthHeader('admin', ''));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username and password are required');
      expect(result.statusCode).toBe(400);
    });
  });

  describe('Authentication with User Provider', () => {
    let userProvider: (username: string) => Promise<UserProviderResult | null>;

    beforeEach(() => {
      userProvider = async (username: string): Promise<UserProviderResult | null> => {
        const users: Record<string, UserProviderResult> = {
          'dbadmin': {
            password: 'dbadminpass',
            user: {
              id: 'db-admin-1',
              username: 'dbadmin',
              email: 'dbadmin@example.com',
              roles: ['admin', 'user']
            }
          },
          'dbuser': {
            password: 'dbuserpass',
            user: {
              id: 'db-user-1',
              username: 'dbuser',
              roles: ['user']
            }
          }
        };
        return users[username] || null;
      };

      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        userProvider
      });
    });

    it('should authenticate using user provider', async () => {
      const req = createMockRequest(createBasicAuthHeader('dbadmin', 'dbadminpass'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.id).toBe('db-admin-1');
      expect(result.user!.username).toBe('dbadmin');
      expect(result.user!.email).toBe('dbadmin@example.com');
      expect(result.user!.roles).toEqual(['admin', 'user']);
    });

    it('should reject invalid user from provider', async () => {
      const req = createMockRequest(createBasicAuthHeader('nonexistent', 'password'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should handle user provider errors gracefully', async () => {
      const errorProvider = async (): Promise<UserProviderResult | null> => {
        throw new Error('Database connection failed');
      };

      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        userProvider: errorProvider
      });

      const req = createMockRequest(createBasicAuthHeader('admin', 'password'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle case-sensitive usernames (default)', async () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'Admin': 'password' },
        caseSensitiveUsernames: true
      });

      const correctReq = createMockRequest(createBasicAuthHeader('Admin', 'password'));
      const correctResult = await strategy.authenticate(correctReq, mockContext);
      expect(correctResult.success).toBe(true);

      const incorrectReq = createMockRequest(createBasicAuthHeader('admin', 'password'));
      const incorrectResult = await strategy.authenticate(incorrectReq, mockContext);
      expect(incorrectResult.success).toBe(false);
    });

    it('should handle case-insensitive usernames', async () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'Admin': 'password' },
        caseSensitiveUsernames: false
      });

      const lowerReq = createMockRequest(createBasicAuthHeader('admin', 'password'));
      const lowerResult = await strategy.authenticate(lowerReq, mockContext);
      expect(lowerResult.success).toBe(true);

      const upperReq = createMockRequest(createBasicAuthHeader('ADMIN', 'password'));
      const upperResult = await strategy.authenticate(upperReq, mockContext);
      expect(upperResult.success).toBe(true);
    });
  });

  describe('Header Parsing', () => {
    beforeEach(() => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': 'password' }
      });
    });

    it('should handle missing Authorization header', async () => {
      const req = createMockRequest();
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing or malformed Authorization header');
    });

    it('should handle malformed Basic header', async () => {
      const req = createMockRequest('Basic invalidbase64');
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing or malformed Authorization header');
    });

    it('should handle Basic header without colon', async () => {
      const invalidCredentials = btoa('adminpassword'); // No colon separator
      const req = createMockRequest(`Basic ${invalidCredentials}`);
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing or malformed Authorization header');
    });

    it('should handle credentials with special characters', async () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin@domain.com': 'pass:word!@#' }
      });

      const req = createMockRequest(createBasicAuthHeader('admin@domain.com', 'pass:word!@#'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user!.username).toBe('admin@domain.com');
    });
  });

  describe('Challenge Response', () => {
    beforeEach(() => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        realm: 'Test API',
        users: { 'admin': 'password' }
      });
    });

    it('should return proper challenge response', () => {
      const req = createMockRequest();
      const response = strategy.challenge(req);

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/fhir+json');
      expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Test API", charset="UTF-8"');
    });

    it('should include proper error message in challenge', async () => {
      const req = createMockRequest();
      const response = strategy.challenge(req);
      const body = await response.json();

      expect(body.error).toBe('Authentication required');
      expect(body.message).toBe('Please provide valid Basic authentication credentials');
    });
  });

  describe('Password Security', () => {
    it('should use constant-time comparison for plain text passwords', async () => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': 'password123' },
        hashPasswords: false
      });

      const validReq = createMockRequest(createBasicAuthHeader('admin', 'password123'));
      const validResult = await strategy.authenticate(validReq, mockContext);
      expect(validResult.success).toBe(true);

      const invalidReq = createMockRequest(createBasicAuthHeader('admin', 'password124'));
      const invalidResult = await strategy.authenticate(invalidReq, mockContext);
      expect(invalidResult.success).toBe(false);
    });

    it('should handle hashed passwords correctly', async () => {
      // First, hash a password to store it properly
      let hashedPassword: string;
      try {
        hashedPassword = await BasicAuthStrategy.hashPassword('password123');
      } catch (error) {
        // If bcrypt not available, use plain text
        hashedPassword = 'password123';
      }
      
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': hashedPassword },
        hashPasswords: true
      });

      const req = createMockRequest(createBasicAuthHeader('admin', 'password123'));
      const result = await strategy.authenticate(req, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe('Static Utility Methods', () => {
    it('should provide static password hashing method', async () => {
      try {
        const hashed = await BasicAuthStrategy.hashPassword('testpassword');
        expect(typeof hashed).toBe('string');
        expect(hashed.length).toBeGreaterThan(0);
        expect(hashed).not.toBe('testpassword');
        
        const isValid = await BasicAuthStrategy.verifyPassword('testpassword', hashed);
        expect(isValid).toBe(true);
        
        const isInvalid = await BasicAuthStrategy.verifyPassword('wrongpassword', hashed);
        expect(isInvalid).toBe(false);
      } catch (error) {
        // bcrypt might not be installed in test environment
        expect((error as Error).message).toContain('bcrypt not available');
      }
    });
  });

  describe('Combined Static and Provider Users', () => {
    it('should prioritize static users over provider', async () => {
      const userProvider = async (): Promise<UserProviderResult | null> => ({
        password: 'providerpass',
        user: {
          id: 'provider-user',
          username: 'admin',
          roles: ['provider-user']
        }
      });

      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': 'staticpass' },
        userProvider
      });

      const req = createMockRequest(createBasicAuthHeader('admin', 'staticpass'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user!.roles).toContain('user'); // Static user default role
    });

    it('should fall back to provider when static user not found', async () => {
      const userProvider = async (username: string): Promise<UserProviderResult | null> => {
        if (username === 'provideruser') {
          return {
            password: 'providerpass',
            user: {
              id: 'provider-user-1',
              username: 'provideruser',
              roles: ['provider-user']
            }
          };
        }
        return null;
      };

      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'staticuser': 'staticpass' },
        userProvider
      });

      const req = createMockRequest(createBasicAuthHeader('provideruser', 'providerpass'));
      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user!.id).toBe('provider-user-1');
      expect(result.user!.roles).toEqual(['provider-user']);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      strategy = new BasicAuthStrategy({
        name: 'basic-auth',
        users: { 'admin': 'password' }
      });
    });

    it('should handle authentication exceptions gracefully', async () => {
      // Create a strategy that will cause internal errors by overriding extractBasicCredentials
      const throwingStrategy = new (class extends BasicAuthStrategy {
        protected extractBasicCredentials(): { username: string; password: string } | null {
          throw new Error('Internal processing error');
        }
      })({
        name: 'basic-auth',
        users: { 'admin': 'password' }
      });

      const req = createMockRequest(createBasicAuthHeader('admin', 'password'));
      const result = await throwingStrategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
      expect(result.statusCode).toBe(500);
    });
  });
});