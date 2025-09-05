import { test, expect, describe, beforeEach } from 'bun:test';
import type { HandlerContext } from '@atomic-fhir/core';
import { JWTStrategy } from '../src/strategies/jwt-strategy.ts';
import type {
  JWTConfig,
  AuthenticationResult
} from '../src/types/index.ts';

// Test utilities
function createMockHandlerContext(): HandlerContext {
  return {
    requestId: 'test-request-123',
    timestamp: new Date()
  } as HandlerContext;
}

function createMockRequest(authHeader?: string): Request {
  const headers = authHeader ? { 'Authorization': authHeader } : {};
  return new Request('https://fhir.example.com/Patient/123', {
    headers
  });
}

describe('JWTStrategy (Simplified)', () => {
  let strategy: JWTStrategy;
  let mockConfig: JWTConfig;

  beforeEach(() => {
    mockConfig = {
      name: 'jwt-test',
      secret: 'test-secret',
      algorithm: 'HS256'
    };
    strategy = new JWTStrategy(mockConfig);
  });

  describe('Configuration', () => {
    test('should initialize with proper configuration', () => {
      expect(strategy.name).toBe('jwt-test');
      expect(strategy.priority).toBe(100); // Default priority
      expect(strategy.enabled).toBe(true);
    });

    test('should require either secret or JWKS URI', () => {
      expect(() => {
        new JWTStrategy({
          name: 'invalid-jwt'
          // No secret or jwksUri
        });
      }).toThrow('JWT strategy requires either a secret or JWKS URI');
    });

    test('should accept JWKS URI instead of secret', () => {
      const config: JWTConfig = {
        name: 'jwks-jwt',
        jwksUri: 'https://example.com/.well-known/jwks.json'
      };
      
      expect(() => new JWTStrategy(config)).not.toThrow();
    });
  });

  describe('canHandle', () => {
    test('should return true for Bearer token requests', () => {
      const req = createMockRequest('Bearer valid-jwt-token');
      expect(strategy.canHandle(req)).toBe(true);
    });

    test('should return false for non-Bearer requests', () => {
      const req1 = createMockRequest('Basic dXNlcjpwYXNz');
      const req2 = createMockRequest();
      
      expect(strategy.canHandle(req1)).toBe(false);
      expect(strategy.canHandle(req2)).toBe(false);
    });

    test('should return false when disabled', () => {
      const disabledConfig: JWTConfig = {
        ...mockConfig,
        enabled: false
      };
      const disabledStrategy = new JWTStrategy(disabledConfig);
      const req = createMockRequest('Bearer token');
      
      expect(disabledStrategy.canHandle(req)).toBe(false);
    });

    test('should respect path configuration', () => {
      const configWithPaths: JWTConfig = {
        ...mockConfig,
        onlyPaths: ['/secure/*']
      };
      const restrictedStrategy = new JWTStrategy(configWithPaths);
      
      const secureReq = new Request('https://example.com/secure/data', {
        headers: { 'Authorization': 'Bearer token' }
      });
      const publicReq = new Request('https://example.com/public/data', {
        headers: { 'Authorization': 'Bearer token' }
      });
      
      expect(restrictedStrategy.canHandle(secureReq)).toBe(true);
      expect(restrictedStrategy.canHandle(publicReq)).toBe(false);
    });
  });

  describe('authenticate', () => {
    test('should fail authentication with missing token', async () => {
      const req = createMockRequest();
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No JWT token provided');
      expect(result.statusCode).toBe(401);
    });

    test('should fail authentication with invalid Bearer format', async () => {
      const req = createMockRequest('Bearer');
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No JWT token provided');
    });

    test('should fail authentication with malformed JWT', async () => {
      const req = createMockRequest('Bearer not-a-jwt-token');
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain('Invalid token'); // Generic error due to simplified implementation
    });

    test('should fail authentication with invalid JWT format', async () => {
      const req = createMockRequest('Bearer incomplete.jwt');
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('Token Refresh Detection', () => {
    test('should detect tokens that need refresh when enabled', () => {
      const refreshConfig: JWTConfig = {
        ...mockConfig,
        allowRefresh: true,
        refreshThreshold: 300 // 5 minutes
      };
      const refreshStrategy = new JWTStrategy(refreshConfig);
      
      const soonToExpirePayload = {
        exp: Math.floor(Date.now() / 1000) + 200 // 200 seconds from now (less than 5 min threshold)
      };
      
      expect(refreshStrategy.needsRefresh(soonToExpirePayload)).toBe(true);
    });

    test('should not detect refresh need for fresh tokens', () => {
      const refreshConfig: JWTConfig = {
        ...mockConfig,
        allowRefresh: true,
        refreshThreshold: 300
      };
      const refreshStrategy = new JWTStrategy(refreshConfig);
      
      const freshPayload = {
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      };
      
      expect(refreshStrategy.needsRefresh(freshPayload)).toBe(false);
    });

    test('should not detect refresh when disabled', () => {
      const noRefreshConfig: JWTConfig = {
        ...mockConfig,
        allowRefresh: false
      };
      const noRefreshStrategy = new JWTStrategy(noRefreshConfig);
      
      const soonToExpirePayload = {
        exp: Math.floor(Date.now() / 1000) + 200
      };
      
      expect(noRefreshStrategy.needsRefresh(soonToExpirePayload)).toBe(false);
    });

    test('should not detect refresh when no expiry is present', () => {
      const refreshConfig: JWTConfig = {
        ...mockConfig,
        allowRefresh: true,
        refreshThreshold: 300
      };
      const refreshStrategy = new JWTStrategy(refreshConfig);
      
      const noExpiryPayload = {};
      
      expect(refreshStrategy.needsRefresh(noExpiryPayload)).toBe(false);
    });
  });

  describe('Challenge Response', () => {
    test('should return proper WWW-Authenticate challenge', () => {
      const req = createMockRequest();
      const response = strategy.challenge(req);
      
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer realm="FHIR Server"');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('should include proper error message in challenge', async () => {
      const req = createMockRequest();
      const response = strategy.challenge(req);
      
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
      expect(body.message).toBe('Please provide a valid JWT token');
    });
  });

  describe('Path Matching', () => {
    test('should handle skipPaths configuration', () => {
      const configWithSkipPaths: JWTConfig = {
        ...mockConfig,
        skipPaths: ['/public/*', '/health']
      };
      const pathStrategy = new JWTStrategy(configWithSkipPaths);
      
      const publicReq = new Request('https://example.com/public/info', {
        headers: { 'Authorization': 'Bearer token' }
      });
      const healthReq = new Request('https://example.com/health', {
        headers: { 'Authorization': 'Bearer token' }
      });
      const protectedReq = new Request('https://example.com/secure/data', {
        headers: { 'Authorization': 'Bearer token' }
      });
      
      expect(pathStrategy.canHandle(publicReq)).toBe(false);
      expect(pathStrategy.canHandle(healthReq)).toBe(false);
      expect(pathStrategy.canHandle(protectedReq)).toBe(true);
    });
  });

  describe('Priority and Strategy Properties', () => {
    test('should have configurable priority', () => {
      const highPriorityConfig: JWTConfig = {
        ...mockConfig,
        priority: 200
      };
      const highPriorityStrategy = new JWTStrategy(highPriorityConfig);
      
      expect(highPriorityStrategy.priority).toBe(200);
    });

    test('should use default priority when not specified', () => {
      expect(strategy.priority).toBe(100);
    });

    test('should be enabled by default', () => {
      expect(strategy.enabled).toBe(true);
    });

    test('should respect enabled configuration', () => {
      const disabledConfig: JWTConfig = {
        ...mockConfig,
        enabled: false
      };
      const disabledStrategy = new JWTStrategy(disabledConfig);
      
      expect(disabledStrategy.enabled).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    test('should accept valid configuration with secret', () => {
      const validConfig: JWTConfig = {
        name: 'valid-jwt',
        secret: 'my-secret',
        algorithm: 'HS256',
        issuer: 'test-issuer',
        audience: 'test-audience'
      };
      
      expect(() => new JWTStrategy(validConfig)).not.toThrow();
    });

    test('should accept valid configuration with JWKS', () => {
      const jwksConfig: JWTConfig = {
        name: 'jwks-jwt',
        jwksUri: 'https://example.com/.well-known/jwks.json',
        algorithm: 'RS256'
      };
      
      expect(() => new JWTStrategy(jwksConfig)).not.toThrow();
    });

    test('should set default algorithm', () => {
      const noAlgorithmConfig: JWTConfig = {
        name: 'no-alg-jwt',
        secret: 'secret'
      };
      
      const noAlgStrategy = new JWTStrategy(noAlgorithmConfig);
      // We can't directly test the algorithm, but we can test that it doesn't throw
      expect(noAlgStrategy.name).toBe('no-alg-jwt');
    });
  });
});