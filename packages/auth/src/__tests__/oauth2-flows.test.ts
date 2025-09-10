import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import bcrypt from "bcrypt";
import { authorizeHandler } from "../http/authorize.js";
import { loginHandler } from "../http/login.js";
import { tokenHandler } from "../http/token.js";
import type { HandlerContext } from "@atomic-fhir/core";

// Mock storage implementation for testing
class MockStorage {
  private data: Map<string, Map<string, any>> = new Map();
  private searchIndexes: Map<string, Map<string, string[]>> = new Map();

  constructor() {
    // Initialize resource type maps
    this.data.set('Client', new Map());
    this.data.set('User', new Map());
    this.data.set('LoginSession', new Map());
    this.data.set('Token', new Map());
    this.data.set('Basic', new Map());
    
    // Initialize search indexes
    this.searchIndexes.set('Client', new Map());
    this.searchIndexes.set('User', new Map());
    this.searchIndexes.set('LoginSession', new Map());
    this.searchIndexes.set('Token', new Map());
    this.searchIndexes.set('Basic', new Map());
  }

  async create(resourceType: string, resource: any): Promise<any> {
    const resourceMap = this.data.get(resourceType) || new Map();
    resourceMap.set(resource.id, { ...resource });
    this.data.set(resourceType, resourceMap);
    
    // Update search indexes
    this.updateSearchIndexes(resourceType, resource);
    
    return resource;
  }

  async read(resourceType: string, id: string): Promise<any> {
    const resourceMap = this.data.get(resourceType);
    return resourceMap?.get(id) || null;
  }

  async update(resourceType: string, id: string, resource: any): Promise<any> {
    const resourceMap = this.data.get(resourceType) || new Map();
    const updated = { ...resource, id };
    resourceMap.set(id, updated);
    this.data.set(resourceType, resourceMap);
    
    // Update search indexes
    this.updateSearchIndexes(resourceType, updated);
    
    return updated;
  }

  async delete(resourceType: string, id: string): Promise<void> {
    const resourceMap = this.data.get(resourceType);
    if (resourceMap) {
      resourceMap.delete(id);
    }
  }

  async search(resourceType: string, params: Record<string, any>): Promise<{ entry: { resource: any }[] }> {
    const resourceMap = this.data.get(resourceType);
    if (!resourceMap) {
      return { entry: [] };
    }

    const resources = Array.from(resourceMap.values());
    const filtered = resources.filter(resource => {
      return Object.entries(params).every(([key, value]) => {
        return this.matchesSearchParam(resource, key, value);
      });
    });

    return {
      entry: filtered.map(resource => ({ resource }))
    };
  }

  private matchesSearchParam(resource: any, param: string, value: any): boolean {
    // Handle extension-based searches for Basic resources
    if (resource.resourceType === 'Basic' && resource.extension) {
      const urlSuffix = param.replace('-', '-');
      const fullUrl = `http://atomic-fhir.org/ig/auth/StructureDefinition/${urlSuffix}`;
      const extension = resource.extension.find((ext: any) => ext.url === fullUrl);
      
      if (extension) {
        return extension.valueString === value || extension.valueBoolean === value;
      }
    }

    // Direct property match
    return resource[param] === value;
  }

  private updateSearchIndexes(resourceType: string, resource: any): void {
    // This would be more sophisticated in a real implementation
    // For now, we rely on the search method to do filtering
  }

  // Test helper to seed data
  async seed(resourceType: string, resources: any[]): Promise<void> {
    for (const resource of resources) {
      await this.create(resourceType, resource);
    }
  }

  // Test helper to clear data
  clear(): void {
    this.data.clear();
    this.searchIndexes.clear();
    this.constructor.call(this);
  }
}

describe("OAuth2 Authorization Flows", () => {
  let mockStorage: MockStorage;
  let mockContext: HandlerContext;

  beforeEach(async () => {
    mockStorage = new MockStorage();
    mockContext = {
      storage: mockStorage,
      hooks: {},
      validator: {},
      config: {},
      packageManager: {}
    };

    // Seed test data
    await seedTestData();
  });

  afterEach(() => {
    mockStorage.clear();
  });

  async function seedTestData() {
    // Create test client
    await mockStorage.create('Basic', {
      resourceType: 'Basic',
      id: 'test-client-1',
      code: {
        coding: [{
          system: 'http://atomic-fhir.org/ig/auth/CodeSystem/resource-types',
          code: 'client'
        }]
      },
      extension: [
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/client-id',
          valueString: 'test-client'
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/client-type',
          valueString: 'public'
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/redirect-uri',
          valueString: 'http://localhost:3000/callback'
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/grant-type',
          valueString: 'authorization_code'
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/response-type',
          valueString: 'code'
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/active-status',
          valueBoolean: true
        }
      ],
      subject: { display: 'Test Client' }
    });

    // Create test user
    const hashedPassword = await bcrypt.hash('testpass', 10);
    await mockStorage.create('Basic', {
      resourceType: 'Basic',
      id: 'test-user-1',
      code: {
        coding: [{
          system: 'http://atomic-fhir.org/ig/auth/CodeSystem/resource-types',
          code: 'user'
        }]
      },
      extension: [
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/username',
          valueString: 'testuser'
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/password-hash',
          valueString: hashedPassword
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/active-status',
          valueBoolean: true
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/user-role',
          valueString: 'user'
        },
        {
          url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/smart-scope',
          valueString: 'patient/*.read'
        }
      ]
    });
  }

  describe("Authorization Code Flow", () => {
    describe("GET /auth/authorize", () => {
      it("should redirect to login page for valid authorization request", async () => {
        const url = new URL('http://localhost/auth/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost:3000/callback&scope=patient/*.read&state=abc123');
        const request = new Request(url);

        const response = await authorizeHandler(request, mockContext);

        expect(response.status).toBe(302);
        expect(response.headers?.['Location']).toContain('/auth/static/login.html');
        expect(response.headers?.['Set-Cookie']).toContain('auth_session=');
      });

      it("should reject invalid client_id", async () => {
        const url = new URL('http://localhost/auth/authorize?response_type=code&client_id=invalid-client&redirect_uri=http://localhost:3000/callback');
        const request = new Request(url);

        const response = await authorizeHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('invalid_client');
      });

      it("should reject invalid redirect_uri", async () => {
        const url = new URL('http://localhost/auth/authorize?response_type=code&client_id=test-client&redirect_uri=http://evil.com/callback');
        const request = new Request(url);

        const response = await authorizeHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('invalid_request');
        expect(response.body?.error_description).toContain('Invalid redirect URI');
      });

      it("should reject missing required parameters", async () => {
        const url = new URL('http://localhost/auth/authorize?response_type=code');
        const request = new Request(url);

        const response = await authorizeHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('invalid_request');
      });

      it("should reject unsupported response type", async () => {
        const url = new URL('http://localhost/auth/authorize?response_type=token&client_id=test-client&redirect_uri=http://localhost:3000/callback');
        const request = new Request(url);

        const response = await authorizeHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('unsupported_response_type');
      });
    });

    describe("POST /auth/login", () => {
      let sessionId: string;

      beforeEach(async () => {
        // Create a test login session
        sessionId = 'test-session-123';
        await mockStorage.create('Basic', {
          resourceType: 'Basic',
          id: 'session-1',
          code: {
            coding: [{
              system: 'http://atomic-fhir.org/ig/auth/CodeSystem/resource-types',
              code: 'login-session'
            }]
          },
          extension: [
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-id',
              valueString: sessionId
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-client-id',
              valueString: 'test-client'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-redirect-uri',
              valueString: 'http://localhost:3000/callback'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/requested-scope',
              valueString: 'patient/*.read'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/is-authenticated',
              valueBoolean: false
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-expires-at',
              valueString: new Date(Date.now() + 30 * 60 * 1000).toISOString()
            }
          ]
        });
      });

      it("should authenticate user and redirect to authorize", async () => {
        const formData = new FormData();
        formData.append('username', 'testuser');
        formData.append('password', 'testpass');
        formData.append('session_id', sessionId);

        const request = new Request('http://localhost/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData
        });

        const response = await loginHandler(request, mockContext);

        expect(response.status).toBe(302);
        expect(response.headers?.['Location']).toContain('/auth/authorize');
      });

      it("should reject invalid credentials", async () => {
        const formData = new FormData();
        formData.append('username', 'testuser');
        formData.append('password', 'wrongpass');
        formData.append('session_id', sessionId);

        const request = new Request('http://localhost/auth/login', {
          method: 'POST',
          body: formData
        });

        const response = await loginHandler(request, mockContext);

        expect(response.status).toBe(401);
        expect(response.body?.error).toBe('invalid_credentials');
      });

      it("should reject invalid session", async () => {
        const formData = new FormData();
        formData.append('username', 'testuser');
        formData.append('password', 'testpass');
        formData.append('session_id', 'invalid-session');

        const request = new Request('http://localhost/auth/login', {
          method: 'POST',
          body: formData
        });

        const response = await loginHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('invalid_session');
      });

      it("should handle JSON request format", async () => {
        const request = new Request('http://localhost/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: 'testuser',
            password: 'testpass',
            session_id: sessionId
          })
        });

        const response = await loginHandler(request, mockContext);

        expect(response.status).toBe(200);
        expect(response.body?.success).toBe(true);
      });
    });

    describe("POST /auth/token", () => {
      let authorizationCode: string;

      beforeEach(async () => {
        // Create an authenticated login session with authorization code
        authorizationCode = 'test-auth-code-123';
        await mockStorage.create('Basic', {
          resourceType: 'Basic',
          id: 'session-with-code',
          code: {
            coding: [{
              system: 'http://atomic-fhir.org/ig/auth/CodeSystem/resource-types',
              code: 'login-session'
            }]
          },
          extension: [
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-id',
              valueString: 'authenticated-session'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-client-id',
              valueString: 'test-client'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-redirect-uri',
              valueString: 'http://localhost:3000/callback'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/requested-scope',
              valueString: 'patient/*.read'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/authenticated-user-id',
              valueString: 'test-user-1'
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/is-authenticated',
              valueBoolean: true
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/authorization-code',
              valueString: authorizationCode
            },
            {
              url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/session-expires-at',
              valueString: new Date(Date.now() + 10 * 60 * 1000).toISOString()
            }
          ]
        });
      });

      it("should exchange authorization code for access token", async () => {
        const formData = new FormData();
        formData.append('grant_type', 'authorization_code');
        formData.append('code', authorizationCode);
        formData.append('redirect_uri', 'http://localhost:3000/callback');
        formData.append('client_id', 'test-client');

        const request = new Request('http://localhost/auth/token', {
          method: 'POST',
          body: formData
        });

        const response = await tokenHandler(request, mockContext);

        expect(response.status).toBe(200);
        expect(response.body?.access_token).toBeDefined();
        expect(response.body?.token_type).toBe('Bearer');
        expect(response.body?.expires_in).toBeGreaterThan(0);
        expect(response.body?.scope).toBe('patient/*.read');
        expect(response.body?.refresh_token).toBeDefined();
      });

      it("should reject invalid authorization code", async () => {
        const formData = new FormData();
        formData.append('grant_type', 'authorization_code');
        formData.append('code', 'invalid-code');
        formData.append('redirect_uri', 'http://localhost:3000/callback');
        formData.append('client_id', 'test-client');

        const request = new Request('http://localhost/auth/token', {
          method: 'POST',
          body: formData
        });

        const response = await tokenHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('invalid_grant');
      });

      it("should reject mismatched redirect_uri", async () => {
        const formData = new FormData();
        formData.append('grant_type', 'authorization_code');
        formData.append('code', authorizationCode);
        formData.append('redirect_uri', 'http://different.com/callback');
        formData.append('client_id', 'test-client');

        const request = new Request('http://localhost/auth/token', {
          method: 'POST',
          body: formData
        });

        const response = await tokenHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('invalid_grant');
        expect(response.body?.error_description).toContain('Redirect URI mismatch');
      });

      it("should reject unsupported grant type", async () => {
        const formData = new FormData();
        formData.append('grant_type', 'client_credentials');
        formData.append('client_id', 'test-client');

        const request = new Request('http://localhost/auth/token', {
          method: 'POST',
          body: formData
        });

        const response = await tokenHandler(request, mockContext);

        expect(response.status).toBe(400);
        expect(response.body?.error).toBe('unsupported_grant_type');
      });

      it("should handle JSON request format", async () => {
        const request = new Request('http://localhost/auth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: 'http://localhost:3000/callback',
            client_id: 'test-client'
          })
        });

        const response = await tokenHandler(request, mockContext);

        expect(response.status).toBe(200);
        expect(response.body?.access_token).toBeDefined();
      });
    });
  });

  describe("Refresh Token Flow", () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create an existing token with refresh capability
      refreshToken = 'test-refresh-token-123';
      await mockStorage.create('Basic', {
        resourceType: 'Basic',
        id: 'existing-token',
        code: {
          coding: [{
            system: 'http://atomic-fhir.org/ig/auth/CodeSystem/resource-types',
            code: 'token'
          }]
        },
        extension: [
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/access-token',
            valueString: 'existing-access-token'
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/refresh-token',
            valueString: refreshToken
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/token-type',
            valueString: 'Bearer'
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/expires-at',
            valueString: new Date(Date.now() + 3600 * 1000).toISOString()
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/issued-at',
            valueString: new Date().toISOString()
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/token-scope',
            valueString: 'patient/*.read'
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/associated-client-id',
            valueString: 'test-client'
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/associated-user-id',
            valueString: 'test-user-1'
          },
          {
            url: 'http://atomic-fhir.org/ig/auth/StructureDefinition/active-status',
            valueBoolean: true
          }
        ]
      });
    });

    it("should refresh access token using refresh token", async () => {
      const formData = new FormData();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', refreshToken);
      formData.append('client_id', 'test-client');

      const request = new Request('http://localhost/auth/token', {
        method: 'POST',
        body: formData
      });

      const response = await tokenHandler(request, mockContext);

      expect(response.status).toBe(200);
      expect(response.body?.access_token).toBeDefined();
      expect(response.body?.access_token).not.toBe('existing-access-token'); // Should be new
      expect(response.body?.refresh_token).toBeDefined();
      expect(response.body?.refresh_token).not.toBe(refreshToken); // Should be new
      expect(response.body?.token_type).toBe('Bearer');
      expect(response.body?.scope).toBe('patient/*.read');
    });

    it("should reject invalid refresh token", async () => {
      const formData = new FormData();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', 'invalid-refresh-token');
      formData.append('client_id', 'test-client');

      const request = new Request('http://localhost/auth/token', {
        method: 'POST',
        body: formData
      });

      const response = await tokenHandler(request, mockContext);

      expect(response.status).toBe(400);
      expect(response.body?.error).toBe('invalid_grant');
    });
  });

  describe("PKCE Support", () => {
    it("should handle PKCE challenge in authorization request", async () => {
      const url = new URL('http://localhost/auth/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost:3000/callback&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256');
      const request = new Request(url);

      const response = await authorizeHandler(request, mockContext);

      expect(response.status).toBe(302);
      expect(response.headers?.['Location']).toContain('/auth/static/login.html');
    });

    it("should reject invalid PKCE challenge method", async () => {
      const url = new URL('http://localhost/auth/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost:3000/callback&code_challenge=test&code_challenge_method=invalid');
      const request = new Request(url);

      const response = await authorizeHandler(request, mockContext);

      expect(response.status).toBe(400);
      expect(response.body?.error).toBe('invalid_request');
      expect(response.body?.error_description).toContain('Unsupported code_challenge_method');
    });
  });

  describe("Error Handling", () => {
    it("should handle storage errors gracefully", async () => {
      // Mock storage to throw error
      const originalSearch = mockStorage.search;
      mockStorage.search = async () => {
        throw new Error('Storage error');
      };

      const url = new URL('http://localhost/auth/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost:3000/callback');
      const request = new Request(url);

      const response = await authorizeHandler(request, mockContext);

      expect(response.status).toBe(400);
      expect(response.body?.error).toBe('server_error');

      // Restore original method
      mockStorage.search = originalSearch;
    });

    it("should validate content type for token endpoint", async () => {
      const request = new Request('http://localhost/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'invalid data'
      });

      const response = await tokenHandler(request, mockContext);

      expect(response.status).toBe(400);
      expect(response.body?.error).toBe('invalid_request');
      expect(response.body?.error_description).toContain('Content-Type must be');
    });

    it("should require POST method for login endpoint", async () => {
      const request = new Request('http://localhost/auth/login', {
        method: 'GET'
      });

      const response = await loginHandler(request, mockContext);

      expect(response.status).toBe(405);
      expect(response.headers?.['Allow']).toBe('POST');
    });
  });
});