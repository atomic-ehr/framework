import { describe, it, expect, beforeEach, jest, afterEach } from 'bun:test';
import { BearerTokenStrategy, type BearerTokenConfig } from '../src/strategies/bearer-token.ts';
import type { AuthenticatedUser, TokenStorage, HandlerContext } from '../src/types/index.ts';

// Mock HandlerContext
const mockContext: HandlerContext = {} as HandlerContext;

// Mock TokenStorage implementation
class MockTokenStorage implements TokenStorage {
  private tokens = new Map<string, AuthenticatedUser>();
  private revokedTokens = new Set<string>();

  async store(token: string, user: AuthenticatedUser, expiresAt?: Date): Promise<void> {
    if (expiresAt) {
      user.tokenInfo = {
        ...user.tokenInfo,
        type: 'bearer',
        token,
        issuedAt: new Date(),
        expiresAt
      };
    }
    this.tokens.set(token, user);
  }

  async retrieve(token: string): Promise<AuthenticatedUser | null> {
    if (this.revokedTokens.has(token)) {
      return null;
    }
    return this.tokens.get(token) || null;
  }

  async revoke(token: string): Promise<void> {
    this.revokedTokens.add(token);
  }

  async cleanup(): Promise<void> {
    // Remove expired tokens
    const now = new Date();
    for (const [token, user] of this.tokens.entries()) {
      if (user.tokenInfo?.expiresAt && user.tokenInfo.expiresAt < now) {
        this.tokens.delete(token);
      }
    }
  }

  // Test utilities
  hasToken(token: string): boolean {
    return this.tokens.has(token) && !this.revokedTokens.has(token);
  }
}

describe('BearerTokenStrategy', () => {
  let strategy: BearerTokenStrategy;
  let mockTokenStorage: MockTokenStorage;

  // Test tokens and users
  const validToken = 'valid-bearer-token-12345678';
  const invalidToken = 'invalid-token';
  const shortToken = 'short';
  const prefixedToken = 'sk-1234567890abcdef';
  
  const testUser: AuthenticatedUser = {
    id: 'test-user-1',
    username: 'testuser',
    roles: ['user'],
    permissions: {
      canRead: true,
      canWrite: true,
      canDelete: false
    }
  };

  beforeEach(() => {
    mockTokenStorage = new MockTokenStorage();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create strategy with default configuration', () => {
      const config: BearerTokenConfig = { name: 'bearer-test' };
      strategy = new BearerTokenStrategy(config);
      
      expect(strategy.name).toBe('bearer-test');
      expect(strategy.priority).toBe(100);
    });

    it('should initialize static tokens correctly', () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokens: {
          [validToken]: {
            id: 'user-1',
            username: 'testuser',
            roles: ['api-client'],
            permissions: { canRead: true, canWrite: true }
          }
        }
      };
      strategy = new BearerTokenStrategy(config);
      
      expect(strategy.name).toBe('bearer-test');
    });

    it('should configure validation options correctly', () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        validateExpiration: true,
        allowExpiredGracePeriod: 300,
        minTokenLength: 16,
        tokenPrefix: 'sk-'
      };
      strategy = new BearerTokenStrategy(config);
      
      expect(strategy.name).toBe('bearer-test');
    });
  });

  describe('canHandle', () => {
    beforeEach(() => {
      const config: BearerTokenConfig = { name: 'bearer-test' };
      strategy = new BearerTokenStrategy(config);
    });

    it('should handle requests with Bearer authorization header', () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': 'Bearer valid-token-123' }
      });
      
      expect(strategy.canHandle(req)).toBe(true);
    });

    it('should not handle requests with Basic authorization header', () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': 'Basic dXNlcjpwYXNz' }
      });
      
      expect(strategy.canHandle(req)).toBe(false);
    });

    it('should not handle requests without authorization header', () => {
      const req = new Request('http://example.com/fhir/Patient');
      
      expect(strategy.canHandle(req)).toBe(false);
    });

    it('should handle case-insensitive bearer token', () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': 'BEARER valid-token-123' }
      });
      
      expect(strategy.canHandle(req)).toBe(true);
    });

    it('should respect skipPaths configuration', () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        skipPaths: ['/fhir/metadata', '/health']
      };
      strategy = new BearerTokenStrategy(config);

      const req1 = new Request('http://example.com/fhir/metadata', {
        headers: { 'Authorization': 'Bearer valid-token-123' }
      });
      const req2 = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': 'Bearer valid-token-123' }
      });

      expect(strategy.canHandle(req1)).toBe(false);
      expect(strategy.canHandle(req2)).toBe(true);
    });

    it('should respect onlyPaths configuration', () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        onlyPaths: ['/fhir/Patient*', '/fhir/Observation*']
      };
      strategy = new BearerTokenStrategy(config);

      const req1 = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': 'Bearer valid-token-123' }
      });
      const req2 = new Request('http://example.com/fhir/metadata', {
        headers: { 'Authorization': 'Bearer valid-token-123' }
      });

      expect(strategy.canHandle(req1)).toBe(true);
      expect(strategy.canHandle(req2)).toBe(false);
    });
  });

  describe('authenticate - Static Tokens', () => {
    beforeEach(() => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokens: {
          [validToken]: testUser
        }
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should authenticate valid static token successfully', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe('test-user-1');
      expect(result.user?.username).toBe('testuser');
      expect(result.user?.tokenInfo?.token).toBe(validToken);
      expect(result.user?.tokenInfo?.type).toBe('bearer');
    });

    it('should reject invalid token', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${invalidToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token not found');
      expect(result.statusCode).toBe(401);
    });

    it('should reject missing authorization header', async () => {
      const req = new Request('http://example.com/fhir/Patient');

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing or invalid Bearer token');
      expect(result.statusCode).toBe(401);
    });

    it('should reject malformed authorization header', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': 'Bearer' }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing or invalid Bearer token');
    });
  });

  describe('authenticate - Token Length Validation', () => {
    beforeEach(() => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        minTokenLength: 16,
        tokens: {
          [validToken]: testUser
        }
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should reject tokens shorter than minimum length', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${shortToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing or invalid Bearer token');
    });

    it('should accept tokens meeting minimum length', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('authenticate - Token Prefix Validation', () => {
    beforeEach(() => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokenPrefix: 'sk-',
        tokens: {
          [prefixedToken]: testUser
        }
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should accept tokens with correct prefix', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${prefixedToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
    });

    it('should reject tokens without required prefix', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing or invalid Bearer token');
    });
  });

  describe('authenticate - Dynamic Token Provider', () => {
    beforeEach(() => {
      const mockTokenProvider = jest.fn().mockImplementation(async (token: string) => {
        if (token === validToken) {
          return testUser;
        }
        return null;
      });

      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokenProvider: mockTokenProvider
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should authenticate using token provider', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('test-user-1');
    });

    it('should handle token provider errors gracefully', async () => {
      const errorProvider = jest.fn().mockImplementation(async () => {
        throw new Error('Provider connection failed');
      });

      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokenProvider: errorProvider
      };
      strategy = new BearerTokenStrategy(config);

      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token provider error');
    });
  });

  describe('authenticate - Token Storage', () => {
    beforeEach(async () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokenStorage: mockTokenStorage
      };
      strategy = new BearerTokenStrategy(config);

      // Store a test token
      await mockTokenStorage.store(validToken, testUser);
    });

    it('should authenticate using token storage', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('test-user-1');
    });

    it('should reject revoked tokens', async () => {
      await mockTokenStorage.revoke(validToken);

      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token not found');
    });
  });

  describe('authenticate - Token Expiration', () => {
    beforeEach(async () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokenStorage: mockTokenStorage,
        validateExpiration: true
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should accept non-expired tokens', async () => {
      const futureExpiry = new Date(Date.now() + 3600000); // 1 hour from now
      await mockTokenStorage.store(validToken, testUser, futureExpiry);

      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
    });

    it('should reject expired tokens', async () => {
      const pastExpiry = new Date(Date.now() - 3600000); // 1 hour ago
      await mockTokenStorage.store(validToken, testUser, pastExpiry);

      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should handle expired tokens within grace period', async () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokenStorage: mockTokenStorage,
        validateExpiration: true,
        allowExpiredGracePeriod: 300 // 5 minutes
      };
      strategy = new BearerTokenStrategy(config);

      const recentlyExpired = new Date(Date.now() - 60000); // 1 minute ago
      await mockTokenStorage.store(validToken, testUser, recentlyExpired);

      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('authenticate - Rate Limiting', () => {
    const rateLimitToken = 'rate-limit-test-token-12345678';
    
    beforeEach(() => {
      const config: BearerTokenConfig = {
        name: 'bearer-rate-limit-test',
        tokens: { [rateLimitToken]: testUser },
        maxRequestsPerToken: 3,
        rateLimitWindow: 60, // 1 minute
        validateExpiration: false // Disable expiration validation for rate limit tests
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should allow requests within rate limit', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${rateLimitToken}` }
      });

      // Make 3 requests (at the limit)
      for (let i = 0; i < 3; i++) {
        const result = await strategy.authenticate(req, mockContext);
        if (!result.success) {
          console.log(`Request ${i + 1} failed with error:`, result.error);
        }
        expect(result.success).toBe(true);
      }
    });

    it('should reject requests exceeding rate limit', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${rateLimitToken}` }
      });

      // Make 3 requests (at the limit)
      for (let i = 0; i < 3; i++) {
        await strategy.authenticate(req, mockContext);
      }

      // 4th request should be rejected
      const result = await strategy.authenticate(req, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
      expect(result.statusCode).toBe(429);
    });

    it('should get rate limit status correctly', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${rateLimitToken}` }
      });

      // Initial status
      let status = strategy.getRateLimitStatus(rateLimitToken);
      expect(status?.remaining).toBe(3);

      // After one request
      await strategy.authenticate(req, mockContext);
      status = strategy.getRateLimitStatus(rateLimitToken);
      expect(status?.remaining).toBe(2);
    });
  });

  describe('Token Management', () => {
    beforeEach(async () => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokenStorage: mockTokenStorage,
        tokens: { [validToken]: testUser }
      };
      strategy = new BearerTokenStrategy(config);

      await mockTokenStorage.store('storage-token', testUser);
    });

    it('should revoke static tokens', async () => {
      await strategy.revokeToken(validToken);

      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);
      expect(result.success).toBe(false);
    });

    it('should revoke tokens from storage', async () => {
      await strategy.revokeToken('storage-token');

      expect(mockTokenStorage.hasToken('storage-token')).toBe(false);
    });
  });

  describe('Challenge Response', () => {
    beforeEach(() => {
      const config: BearerTokenConfig = { name: 'bearer-test' };
      strategy = new BearerTokenStrategy(config);
    });

    it('should return proper challenge response', () => {
      const req = new Request('http://example.com/fhir/Patient');
      const response = strategy.challenge(req);

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/fhir+json');
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer realm="FHIR API", charset="UTF-8"');
    });

    it('should include proper error message in challenge', async () => {
      const req = new Request('http://example.com/fhir/Patient');
      const response = strategy.challenge(req);
      const body = await response.json();

      expect(body.error).toBe('Authentication required');
      expect(body.message).toBe('Please provide a valid Bearer token');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokens: { [validToken]: testUser }
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should handle malformed requests gracefully', async () => {
      // Create a strategy that throws during authentication
      class ErrorStrategy extends BearerTokenStrategy {
        protected extractToken(): string | null {
          throw new Error('Extraction failed');
        }
      }

      const errorStrategy = new ErrorStrategy({ name: 'error-test' });

      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await errorStrategy.authenticate(req, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('User Enrichment', () => {
    beforeEach(() => {
      const config: BearerTokenConfig = {
        name: 'bearer-test',
        tokens: {
          [validToken]: {
            id: 'api-user-1',
            roles: ['api-client']
            // Note: no permissions provided to test default enrichment
          }
        }
      };
      strategy = new BearerTokenStrategy(config);
    });

    it('should enrich user with default permissions', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user?.permissions.canRead).toBe(true);
      expect(result.user?.permissions.canWrite).toBe(true);
      expect(result.user?.permissions.canDelete).toBe(false);
      expect(result.user?.permissions.resources).toBeDefined();
      expect(result.user?.permissions.operations).toBeDefined();
    });

    it('should preserve existing metadata', async () => {
      const req = new Request('http://example.com/fhir/Patient', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      const result = await strategy.authenticate(req, mockContext);

      expect(result.success).toBe(true);
      expect(result.user?.metadata?.authStrategy).toBe('bearer-test');
      expect(result.user?.metadata?.tokenType).toBe('bearer');
    });
  });
});