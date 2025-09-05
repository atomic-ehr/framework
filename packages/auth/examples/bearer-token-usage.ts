/**
 * BearerTokenStrategy Usage Examples
 * 
 * Demonstrates various configurations and use cases for Bearer Token authentication
 * in the Atomic FHIR framework, including static tokens, dynamic providers, 
 * token storage systems, and advanced security features.
 */

import { BearerTokenStrategy, type BearerTokenConfig } from '../src/strategies/bearer-token.ts';
import { AuthManager } from '../src/core/auth-manager.ts';
import type { AuthenticatedUser, TokenStorage } from '../src/types/index.ts';

// ============================================================================
// Example 1: Simple Static API Tokens
// ============================================================================

console.log('=== Example 1: Simple Static API Tokens ===');

const bearerAuthSimple = new BearerTokenStrategy({
  name: 'bearer-simple',
  priority: 200,
  tokens: {
    'api-admin-2024-abcd1234': {
      id: 'admin-api-1',
      username: 'admin-api',
      roles: ['admin', 'api-client'],
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: true,
        resources: {
          '*': { read: true, write: true, delete: true }
        },
        operations: {
          'everything': true,
          'match': true,
          'validate': true
        }
      },
      metadata: {
        description: 'Admin API token for system management'
      }
    },
    'api-readonly-2024-efgh5678': {
      id: 'readonly-api-1',
      username: 'readonly-api',
      roles: ['reader', 'api-client'],
      permissions: {
        canRead: true,
        canWrite: false,
        canDelete: false,
        resources: {
          'Patient': { read: true },
          'Observation': { read: true },
          'Practitioner': { read: true }
        },
        operations: {
          'everything': true
        }
      },
      metadata: {
        description: 'Read-only API token for data access'
      }
    }
  }
});

console.log('Simple Bearer Token Strategy created with 2 API tokens');

// ============================================================================
// Example 2: Secure Tokens with Prefix and Length Validation
// ============================================================================

console.log('\\n=== Example 2: Secure Token Validation ===');

const bearerAuthSecure = new BearerTokenStrategy({
  name: 'bearer-secure',
  priority: 250,
  tokens: {
    'sk-live_1234567890abcdef': {
      id: 'secure-api-1',
      username: 'secure-client',
      roles: ['api-client', 'premium'],
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        resources: {
          'Patient': { read: true, write: true, create: true },
          'Observation': { read: true, write: true, create: true },
          'DiagnosticReport': { read: true, write: true }
        }
      }
    },
    'sk-test_9876543210fedcba': {
      id: 'test-api-1',
      username: 'test-client',
      roles: ['api-client', 'test'],
      permissions: {
        canRead: true,
        canWrite: false,
        canDelete: false
      }
    }
  },
  // Security options
  tokenPrefix: 'sk-',
  minTokenLength: 20,
  validateExpiration: true
});

console.log('Secure Bearer Token Strategy created with prefix and length validation');

// ============================================================================
// Example 3: Dynamic Token Provider with Database Integration
// ============================================================================

console.log('\\n=== Example 3: Dynamic Token Provider ===');

// Mock database interface
interface APITokenDatabase {
  findTokenByValue(token: string): Promise<{
    id: string;
    token: string;
    userId: string;
    name: string;
    scopes: string[];
    active: boolean;
    expiresAt?: Date;
    lastUsedAt?: Date;
  } | null>;

  findUserById(userId: string): Promise<{
    id: string;
    username: string;
    email: string;
    roles: string[];
    active: boolean;
  } | null>;

  updateTokenUsage(tokenId: string): Promise<void>;
}

// Mock database implementation
const mockTokenDatabase: APITokenDatabase = {
  async findTokenByValue(token: string) {
    const tokens = {
      'dyn-production-abc123': {
        id: 'token-1',
        token: 'dyn-production-abc123',
        userId: 'user-1',
        name: 'Production API Access',
        scopes: ['read', 'write'],
        active: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        lastUsedAt: new Date()
      },
      'dyn-analytics-xyz789': {
        id: 'token-2',
        token: 'dyn-analytics-xyz789',
        userId: 'user-2',
        name: 'Analytics Dashboard',
        scopes: ['read'],
        active: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        lastUsedAt: new Date()
      }
    };
    
    return tokens[token as keyof typeof tokens] || null;
  },

  async findUserById(userId: string) {
    const users = {
      'user-1': {
        id: 'user-1',
        username: 'integration-team',
        email: 'integration@hospital.com',
        roles: ['integration', 'api-client'],
        active: true
      },
      'user-2': {
        id: 'user-2',
        username: 'analytics-team',
        email: 'analytics@hospital.com',
        roles: ['analytics', 'api-client'],
        active: true
      }
    };

    return users[userId as keyof typeof users] || null;
  },

  async updateTokenUsage(tokenId: string) {
    console.log(`Updated last used time for token ${tokenId}`);
  }
};

const bearerAuthDynamic = new BearerTokenStrategy({
  name: 'bearer-dynamic',
  priority: 300,
  tokenProvider: async (token: string) => {
    try {
      const tokenRecord = await mockTokenDatabase.findTokenByValue(token);
      if (!tokenRecord || !tokenRecord.active) {
        return null;
      }

      const user = await mockTokenDatabase.findUserById(tokenRecord.userId);
      if (!user || !user.active) {
        return null;
      }

      // Update token usage statistics
      await mockTokenDatabase.updateTokenUsage(tokenRecord.id);

      // Build permissions based on token scopes
      const permissions = {
        canRead: tokenRecord.scopes.includes('read'),
        canWrite: tokenRecord.scopes.includes('write'),
        canDelete: tokenRecord.scopes.includes('delete'),
        resources: {} as Record<string, any>,
        operations: {} as Record<string, boolean>
      };

      // Set resource permissions based on roles and scopes
      if (user.roles.includes('integration')) {
        permissions.resources = {
          'Patient': { 
            read: permissions.canRead, 
            write: permissions.canWrite,
            create: permissions.canWrite 
          },
          'Observation': { 
            read: permissions.canRead, 
            write: permissions.canWrite,
            create: permissions.canWrite 
          },
          'DiagnosticReport': { read: permissions.canRead }
        };
        permissions.operations = {
          'everything': permissions.canRead,
          'match': permissions.canRead
        };
      } else if (user.roles.includes('analytics')) {
        permissions.resources = {
          'Patient': { read: true, search: true },
          'Observation': { read: true, search: true },
          'DiagnosticReport': { read: true, search: true }
        };
        permissions.operations = {
          'everything': true,
          'summary': true
        };
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        permissions: permissions,
        tokenInfo: {
          type: 'bearer',
          token: token,
          issuedAt: new Date(),
          expiresAt: tokenRecord.expiresAt
        },
        metadata: {
          tokenName: tokenRecord.name,
          scopes: tokenRecord.scopes,
          lastUsedAt: tokenRecord.lastUsedAt,
          source: 'database'
        }
      } as AuthenticatedUser;
    } catch (error) {
      console.error('Token provider error:', error);
      return null;
    }
  },
  validateExpiration: true,
  allowExpiredGracePeriod: 300, // 5 minutes grace period
  minTokenLength: 16
});

console.log('Dynamic Bearer Token Strategy created with database integration');

// ============================================================================
// Example 4: Advanced Token Storage with Rate Limiting
// ============================================================================

console.log('\\n=== Example 4: Token Storage with Rate Limiting ===');

// Mock Token Storage implementation
class MockTokenStorage implements TokenStorage {
  private tokens = new Map<string, { user: AuthenticatedUser; expiresAt?: Date; revoked: boolean }>();

  async store(token: string, user: AuthenticatedUser, expiresAt?: Date): Promise<void> {
    this.tokens.set(token, { 
      user: { 
        ...user, 
        tokenInfo: {
          type: 'bearer',
          token,
          issuedAt: new Date(),
          expiresAt
        } 
      }, 
      expiresAt,
      revoked: false 
    });
  }

  async retrieve(token: string): Promise<AuthenticatedUser | null> {
    const entry = this.tokens.get(token);
    if (!entry || entry.revoked) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      return null;
    }

    return entry.user;
  }

  async revoke(token: string): Promise<void> {
    const entry = this.tokens.get(token);
    if (entry) {
      entry.revoked = true;
    }
  }

  async cleanup(): Promise<void> {
    const now = new Date();
    for (const [token, entry] of this.tokens.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.tokens.delete(token);
      }
    }
  }

  // Test utility methods
  getAllTokens(): string[] {
    return Array.from(this.tokens.keys()).filter(token => !this.tokens.get(token)?.revoked);
  }

  isTokenRevoked(token: string): boolean {
    return this.tokens.get(token)?.revoked ?? true;
  }
}

const tokenStorage = new MockTokenStorage();

// Pre-populate some tokens
await tokenStorage.store('storage-admin-token-2024', {
  id: 'storage-admin-1',
  username: 'storage-admin',
  roles: ['admin', 'api-client'],
  permissions: {
    canRead: true,
    canWrite: true,
    canDelete: true,
    resources: { '*': { read: true, write: true, delete: true } }
  }
}, new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 hours

await tokenStorage.store('storage-service-token-2024', {
  id: 'storage-service-1',
  username: 'background-service',
  roles: ['service', 'api-client'],
  permissions: {
    canRead: true,
    canWrite: true,
    canDelete: false,
    resources: {
      'Patient': { read: true, write: true, create: true },
      'Observation': { read: true, write: true, create: true }
    }
  }
});

const bearerAuthStorage = new BearerTokenStrategy({
  name: 'bearer-storage',
  priority: 400,
  tokenStorage: tokenStorage,
  validateExpiration: true,
  // Rate limiting configuration
  maxRequestsPerToken: 1000,
  rateLimitWindow: 3600, // 1 hour
  // Security settings
  minTokenLength: 20,
  allowExpiredGracePeriod: 120 // 2 minutes grace period
});

console.log('Bearer Token Strategy with storage and rate limiting created');

// ============================================================================
// Usage Demonstration
// ============================================================================

console.log('\\n=== Usage Demonstration ===');

// Example API request simulation
async function simulateAPIRequest(strategy: BearerTokenStrategy, token: string, description: string) {
  console.log(`\\nTesting ${description}:`);
  
  const req = new Request('http://localhost:3000/fhir/Patient', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/fhir+json'
    }
  });

  try {
    if (strategy.canHandle(req)) {
      const result = await strategy.authenticate(req, {} as any);
      
      if (result.success && result.user) {
        console.log(`✅ Authentication successful for ${result.user.username}`);
        console.log(`   User ID: ${result.user.id}`);
        console.log(`   Roles: ${result.user.roles.join(', ')}`);
        console.log(`   Can Read: ${result.user.permissions.canRead}`);
        console.log(`   Can Write: ${result.user.permissions.canWrite}`);
        
        // Check rate limit status if available
        const rateLimitStatus = strategy.getRateLimitStatus?.(token);
        if (rateLimitStatus) {
          console.log(`   Rate limit: ${rateLimitStatus.remaining} requests remaining`);
        }
      } else {
        console.log(`❌ Authentication failed: ${result.error}`);
      }
    } else {
      console.log('❌ Strategy cannot handle this request');
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }
}

// Test different scenarios
await simulateAPIRequest(bearerAuthSimple, 'api-admin-2024-abcd1234', 'Simple Admin Token');
await simulateAPIRequest(bearerAuthSecure, 'sk-live_1234567890abcdef', 'Secure Token with Prefix');
await simulateAPIRequest(bearerAuthDynamic, 'dyn-production-abc123', 'Dynamic Database Token');
await simulateAPIRequest(bearerAuthStorage, 'storage-admin-token-2024', 'Storage-based Token');

// Test invalid token
await simulateAPIRequest(bearerAuthSimple, 'invalid-token', 'Invalid Token');

// Test rate limiting
console.log('\\n=== Rate Limiting Test ===');
const rateLimitStrategy = new BearerTokenStrategy({
  name: 'rate-limit-test',
  tokens: { 'test-token': { id: 'test-user', roles: ['test'] } },
  maxRequestsPerToken: 2,
  rateLimitWindow: 60
});

for (let i = 1; i <= 4; i++) {
  console.log(`\\nRequest ${i}:`);
  await simulateAPIRequest(rateLimitStrategy, 'test-token', `Rate Limit Test Request ${i}`);
}

// ============================================================================
// Integration with AuthManager
// ============================================================================

console.log('\\n=== AuthManager Integration ===');

// Create AuthManager with multiple Bearer token strategies
const authManager = new AuthManager({
  strategies: [
    bearerAuthSimple,
    bearerAuthSecure,
    bearerAuthDynamic,
    bearerAuthStorage
  ]
});

console.log('AuthManager configured with 4 Bearer token strategies');
console.log('Strategies will be tried in priority order (highest first)');

// ============================================================================
// Export for use in other modules
// ============================================================================

export {
  bearerAuthSimple,
  bearerAuthSecure,
  bearerAuthDynamic,
  bearerAuthStorage,
  tokenStorage,
  mockTokenDatabase
};