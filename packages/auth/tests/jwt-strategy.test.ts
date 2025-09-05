import { test, expect, describe, beforeEach } from 'bun:test';
import type { HandlerContext } from '@atomic-fhir/core';
import { JWTStrategy, TokenError } from '../src/strategies/jwt-strategy.ts';
import type {
  JWTConfig,
  JWTPayload,
  AuthenticatedUser,
  AuthenticationResult,
  FHIRPermissions
} from '../src/types/index.ts';

// Test utilities
function createMockHandlerContext(): HandlerContext {
  return {
    requestId: 'test-request-123',
    timestamp: new Date()
  } as HandlerContext;
}

function createMockJWTPayload(overrides?: Partial<JWTPayload>): JWTPayload {
  const payload = {
    iss: 'test-issuer',
    sub: 'user-123',
    aud: 'test-audience',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    name: 'Test User',
    email: 'test@example.com',
    roles: ['user'],
    ...overrides
  };
  
  // Remove undefined values
  Object.keys(payload).forEach(key => {
    if (payload[key as keyof JWTPayload] === undefined) {
      delete payload[key as keyof JWTPayload];
    }
  });
  
  return payload;
}

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createValidJWTToken(payload?: Partial<JWTPayload>): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  // If payload is provided, use it directly; otherwise create a default mock payload
  const finalPayload = payload || createMockJWTPayload();
  
  // Create a simple JWT-like token using base64url encoding
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(finalPayload));
  const signature = base64UrlEncode('test-signature'); // Simplified for testing
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function createMockRequest(authHeader?: string): Request {
  const headers = authHeader ? { 'Authorization': authHeader } : {};
  return new Request('https://fhir.example.com/Patient/123', {
    headers
  });
}

describe('JWTStrategy', () => {
  let strategy: JWTStrategy;
  let mockConfig: JWTConfig;

  beforeEach(() => {
    mockConfig = {
      name: 'jwt-test',
      secret: 'test-secret',
      algorithm: 'HS256',
      issuer: 'test-issuer',
      audience: 'test-audience',
      clockTolerance: 60
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
    test('should successfully authenticate with valid JWT', async () => {
      const token = createValidJWTToken();
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe('user-123');
      expect(result.user?.email).toBe('test@example.com');
      expect(result.user?.roles).toEqual(['user']);
    });

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

    test('should handle expired tokens', async () => {
      const expiredPayload = createMockJWTPayload({
        exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      });
      const token = createValidJWTToken(expiredPayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token has expired');
      expect(result.statusCode).toBe(401);
    });

    test('should handle tokens not yet valid (nbf claim)', async () => {
      const futurePayload = createMockJWTPayload({
        nbf: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      });
      const token = createValidJWTToken(futurePayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token not yet valid');
      expect(result.statusCode).toBe(401);
    });

    test('should validate issuer when configured', async () => {
      const wrongIssuerPayload = createMockJWTPayload({
        iss: 'wrong-issuer'
      });
      const token = createValidJWTToken(wrongIssuerPayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token issuer not trusted');
      expect(result.statusCode).toBe(401);
    });

    test('should validate audience when configured', async () => {
      const wrongAudiencePayload = createMockJWTPayload({
        aud: 'wrong-audience'
      });
      const token = createValidJWTToken(wrongAudiencePayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token audience not valid');
      expect(result.statusCode).toBe(401);
    });
  });

  describe('Token Validation', () => {
    test('should validate timing claims with clock tolerance', async () => {
      const almostExpiredPayload = createMockJWTPayload({
        exp: Math.floor(Date.now() / 1000) - 30 // 30 seconds ago, within tolerance
      });
      const token = createValidJWTToken(almostExpiredPayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(true); // Should pass due to clock tolerance
    });

    test('should handle missing issuer claim when issuer validation is required', async () => {
      const noIssuerPayload = createMockJWTPayload({ iss: undefined });
      const token = createValidJWTToken(noIssuerPayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token missing issuer claim');
    });

    test('should handle missing audience claim when audience validation is required', async () => {
      const noAudiencePayload = createMockJWTPayload({ aud: undefined });
      const token = createValidJWTToken(noAudiencePayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token missing audience claim');
    });
  });

  describe('Claims Extraction', () => {
    test('should extract user information from standard claims', async () => {
      const payload = createMockJWTPayload({
        sub: 'user-456',
        name: 'Jane Doe',
        preferred_username: 'janedoe',
        email: 'jane@example.com',
        roles: ['admin', 'user']
      });
      const token = createValidJWTToken(payload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('user-456');
      expect(result.user?.username).toBe('janedoe');
      expect(result.user?.email).toBe('jane@example.com');
      expect(result.user?.roles).toEqual(['admin', 'user']);
    });

    test('should use custom claims extractor when provided', async () => {
      const customConfig: JWTConfig = {
        ...mockConfig,
        userClaims: (payload: JWTPayload) => ({
          id: payload.sub || 'unknown',
          username: payload.email, // Use email as username
          roles: ['custom-role'],
          permissions: {
            canRead: true,
            canWrite: payload.roles?.includes('admin') || false,
            canDelete: false,
            resources: {},
            operations: {},
            custom: {}
          }
        })
      };
      
      const customStrategy = new JWTStrategy(customConfig);
      const payload = createMockJWTPayload({
        email: 'custom@example.com',
        roles: ['admin']
      });
      const token = createValidJWTToken(payload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await customStrategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
      expect(result.user?.username).toBe('custom@example.com');
      expect(result.user?.roles).toEqual(['custom-role']);
      expect(result.user?.permissions.canWrite).toBe(true); // admin role gives write permission
    });

    test('should handle custom role and permission claims', async () => {
      const customConfig: JWTConfig = {
        ...mockConfig,
        roleClaim: 'custom_roles',
        permissionClaim: 'custom_permissions'
      };
      
      const customStrategy = new JWTStrategy(customConfig);
      const payload = createMockJWTPayload({
        custom_roles: ['manager', 'user'],
        custom_permissions: {
          canRead: true,
          canWrite: true,
          canDelete: false
        }
      });
      const token = createValidJWTToken(payload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await customStrategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
      expect(result.user?.roles).toEqual(['manager', 'user']);
    });
  });

  describe('Token Refresh Detection', () => {
    test('should detect tokens that need refresh', async () => {
      const soonToExpirePayload = createMockJWTPayload({
        exp: Math.floor(Date.now() / 1000) + 200 // 200 seconds from now (less than 5 min threshold)
      });
      const token = createValidJWTToken(soonToExpirePayload);
      
      const refreshConfig: JWTConfig = {
        ...mockConfig,
        allowRefresh: true,
        refreshThreshold: 300 // 5 minutes
      };
      const refreshStrategy = new JWTStrategy(refreshConfig);
      
      expect(refreshStrategy.needsRefresh(soonToExpirePayload)).toBe(true);
    });

    test('should not detect refresh need for fresh tokens', async () => {
      const freshPayload = createMockJWTPayload({
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      });
      
      const refreshConfig: JWTConfig = {
        ...mockConfig,
        allowRefresh: true,
        refreshThreshold: 300
      };
      const refreshStrategy = new JWTStrategy(refreshConfig);
      
      expect(refreshStrategy.needsRefresh(freshPayload)).toBe(false);
    });

    test('should not detect refresh when refresh is disabled', async () => {
      const soonToExpirePayload = createMockJWTPayload({
        exp: Math.floor(Date.now() / 1000) + 200
      });
      
      const noRefreshConfig: JWTConfig = {
        ...mockConfig,
        allowRefresh: false
      };
      const noRefreshStrategy = new JWTStrategy(noRefreshConfig);
      
      expect(noRefreshStrategy.needsRefresh(soonToExpirePayload)).toBe(false);
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

  describe('Error Handling', () => {
    test('should handle malformed JWT tokens', async () => {
      const req = createMockRequest('Bearer malformed.jwt.token');
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token');
      expect(result.statusCode).toBe(401);
    });

    test('should handle JWT parsing errors gracefully', async () => {
      const req = createMockRequest('Bearer not-a-jwt-at-all');
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('Token Information Enrichment', () => {
    test('should enrich user with token information', async () => {
      const payload = createMockJWTPayload();
      const token = createValidJWTToken(payload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
      expect(result.user?.tokenInfo).toBeDefined();
      expect(result.user?.tokenInfo?.type).toBe('jwt');
      expect(result.user?.tokenInfo?.token).toBe(token);
      expect(result.user?.tokenInfo?.expiresAt).toBeDefined();
      expect(result.user?.tokenInfo?.issuedAt).toBeDefined();
    });

    test('should include JWT claims in user metadata', async () => {
      const payload = createMockJWTPayload({
        custom_claim: 'custom_value'
      });
      const token = createValidJWTToken(payload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result: AuthenticationResult = await strategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
      expect(result.user?.metadata?.iss).toBe('test-issuer');
      expect(result.user?.metadata?.aud).toBe('test-audience');
      expect(result.user?.metadata?.jwtClaims).toBeDefined();
      expect(result.user?.metadata?.jwtClaims.custom_claim).toBe('custom_value');
    });
  });

  describe('Configuration Edge Cases', () => {
    test('should handle multiple issuers', async () => {
      const multiIssuerConfig: JWTConfig = {
        ...mockConfig,
        issuer: ['issuer1', 'issuer2', 'test-issuer']
      };
      const multiStrategy = new JWTStrategy(multiIssuerConfig);
      
      const payload = createMockJWTPayload({ iss: 'issuer2' });
      const token = createValidJWTToken(payload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result = await multiStrategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
    });

    test('should handle multiple audiences', async () => {
      const multiAudienceConfig: JWTConfig = {
        ...mockConfig,
        audience: ['audience1', 'audience2', 'test-audience']
      };
      const multiStrategy = new JWTStrategy(multiAudienceConfig);
      
      const payload = createMockJWTPayload({ aud: ['audience2', 'other'] });
      const token = createValidJWTToken(payload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result = await multiStrategy.authenticate(req, context);
      
      expect(result.success).toBe(true);
    });

    test('should handle maxAge validation', async () => {
      const maxAgeConfig: JWTConfig = {
        ...mockConfig,
        maxAge: 300 // 5 minutes
      };
      const maxAgeStrategy = new JWTStrategy(maxAgeConfig);
      
      const oldPayload = createMockJWTPayload({
        iat: Math.floor(Date.now() / 1000) - 600 // 10 minutes ago
      });
      const token = createValidJWTToken(oldPayload);
      const req = createMockRequest(`Bearer ${token}`);
      const context = createMockHandlerContext();
      
      const result = await maxAgeStrategy.authenticate(req, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token too old');
    });
  });
});