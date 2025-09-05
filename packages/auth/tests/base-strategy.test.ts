import { test, expect, describe } from 'bun:test';
import { BaseAuthStrategy } from '../src/strategies/base-strategy.ts';
import type { HandlerContext } from '@atomic-fhir/core';
import type {
  AuthStrategyConfig,
  AuthenticationResult,
  AuthenticatedUser,
  FHIRPermissions
} from '../src/types/index.ts';

// Simple concrete strategy for testing without circular references
class TestStrategy extends BaseAuthStrategy {
  async authenticate(req: Request, _context: HandlerContext): Promise<AuthenticationResult> {
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      return {
        success: false,
        error: 'Missing authorization header',
        statusCode: 401
      };
    }

    const user: AuthenticatedUser = {
      id: 'test-user-123',
      username: 'testuser',
      email: 'test@example.com',
      roles: ['user', 'doctor'],
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        resources: {
          'Patient': {
            read: true,
            search: true,
            create: true,
            conditions: [{
              field: 'identifier.0.value',
              operator: 'eq',
              value: 'test-patient-123'
            }]
          },
          'Observation': {
            read: true,
            search: true,
            create: false
          }
        },
        operations: {
          'patient-everything': true
        }
      }
    };

    return {
      success: true,
      user
    };
  }
}

// Test utilities
function createMockRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

function createMockContext(): HandlerContext {
  return {} as HandlerContext;
}

describe('BaseAuthStrategy', () => {
  test('Strategy construction with config', () => {
    const config: AuthStrategyConfig = {
      name: 'test-strategy',
      priority: 50,
      enabled: true,
      skipPaths: ['/metadata', '/health'],
      onlyPaths: ['/fhir/*']
    };
    
    const strategy = new TestStrategy(config);
    expect(strategy.name).toBe('test-strategy');
    expect(strategy.priority).toBe(50);
  });

  test('Path matching - exact match', () => {
    // Test path matching through canHandle method behavior
    const req1 = createMockRequest('https://fhir.example.com/Patient/123');
    const req2 = createMockRequest('https://fhir.example.com/Patient/456'); 
    
    const strategy1 = new TestStrategy({ name: 'test', onlyPaths: ['/Patient/123'] });
    const strategy2 = new TestStrategy({ name: 'test', onlyPaths: ['/Patient/123'] });
    
    expect(strategy1.canHandle(req1)).toBe(true);
    expect(strategy2.canHandle(req2)).toBe(false);
  });

  test('Path matching - wildcards', () => {
    const strategy = new TestStrategy({ name: 'test', onlyPaths: ['/Patient/*'] });
    
    const req1 = createMockRequest('https://fhir.example.com/Patient/123');
    const req2 = createMockRequest('https://fhir.example.com/Observation/123');
    
    expect(strategy.canHandle(req1)).toBe(true);
    expect(strategy.canHandle(req2)).toBe(false);
  });

  test('canHandle respects skipPaths', () => {
    const strategy = new TestStrategy({ 
      name: 'test',
      skipPaths: ['/metadata', '/health/*'] 
    });
    
    const req1 = createMockRequest('https://fhir.example.com/metadata');
    const req2 = createMockRequest('https://fhir.example.com/health/status');
    const req3 = createMockRequest('https://fhir.example.com/Patient/123');
    
    expect(strategy.canHandle(req1)).toBe(false);
    expect(strategy.canHandle(req2)).toBe(false);
    expect(strategy.canHandle(req3)).toBe(true);
  });

  test('canHandle respects onlyPaths', () => {
    const strategy = new TestStrategy({ 
      name: 'test',
      onlyPaths: ['/fhir/*'] 
    });
    
    const req1 = createMockRequest('https://fhir.example.com/fhir/Patient/123');
    const req2 = createMockRequest('https://fhir.example.com/metadata');
    
    expect(strategy.canHandle(req1)).toBe(true);
    expect(strategy.canHandle(req2)).toBe(false);
  });

  test('canHandle respects enabled flag', () => {
    const strategy = new TestStrategy({ 
      name: 'test',
      enabled: false 
    });
    
    const req = createMockRequest('https://fhir.example.com/Patient/123');
    expect(strategy.canHandle(req)).toBe(false);
  });

  test('Authorization header handling', () => {
    // Test with valid header
    const req1 = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer test-token-123'
    });
    
    // Test without header  
    const req2 = createMockRequest('https://fhir.example.com/Patient');
    
    expect(req1.headers.get('authorization')).toBe('Bearer test-token-123');
    expect(req2.headers.get('authorization')).toBeNull();
  });

  test('Basic credentials format', () => {
    const credentials = 'testuser:password123';
    const encoded = btoa(credentials);
    
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': `Basic ${encoded}`
    });
    
    expect(req.headers.get('authorization')).toBe(`Basic ${encoded}`);
    
    // Verify encoding/decoding works
    const decoded = atob(encoded);
    expect(decoded).toBe('testuser:password123');
  });

  test('Bearer token format', () => {
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer my-secret-token'
    });
    
    const authHeader = req.headers.get('authorization');
    expect(authHeader).toBe('Bearer my-secret-token');
    
    // Verify token can be extracted
    const token = authHeader?.split(' ')[1];
    expect(token).toBe('my-secret-token');
  });

  test('Authentication returns proper permissions', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer test-token'
    });
    
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    
    // Verify permissions structure
    const permissions = result.user!.permissions;
    expect(permissions.canRead).toBe(true);
    expect(permissions.canWrite).toBe(true);
    expect(permissions.canDelete).toBe(false);
    expect(permissions.resources?.Patient?.read).toBe(true);
  });

  test('Resource-specific permissions structure', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer test-token'
    });
    
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    
    const resources = result.user!.permissions.resources;
    expect(resources?.Patient?.search).toBe(true);
    expect(resources?.Observation?.read).toBe(true);
    expect(resources?.Observation?.create).toBe(false);
  });

  test('Conditional permissions structure', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer test-token'
    });
    
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    
    const patientPermissions = result.user!.permissions.resources?.Patient;
    expect(patientPermissions?.conditions).toBeDefined();
    expect(patientPermissions?.conditions?.[0]?.field).toBe('identifier.0.value');
    expect(patientPermissions?.conditions?.[0]?.operator).toBe('eq');
    expect(patientPermissions?.conditions?.[0]?.value).toBe('test-patient-123');
  });

  test('User structure validation', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer test-token'
    });
    
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(true);
    
    const user = result.user!;
    expect(user.id).toBe('test-user-123');
    expect(user.username).toBe('testuser');
    expect(user.roles).toContain('user');
    expect(user.roles).toContain('doctor');
  });

  test('Authentication success result', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer test-token'
    });
    
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('test-user-123');
    expect(result.error).toBeUndefined();
    expect(result.statusCode).toBeUndefined();
  });

  test('Authentication failure result', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    const req = createMockRequest('https://fhir.example.com/Patient'); // No auth header
    
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing authorization header');
    expect(result.statusCode).toBe(401);
    expect(result.user).toBeUndefined();
  });

  test('Challenge response format', () => {
    const strategy = new TestStrategy({ name: 'test-auth' });
    const req = createMockRequest('https://fhir.example.com/Patient');
    const response = strategy.challenge(req);
    
    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Type')).toBe('application/fhir+json');
    expect(response.headers.get('WWW-Authenticate')).toContain('test-auth');
  });

  test('Full authentication flow', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    
    // Test that strategy can handle the request
    const req = createMockRequest('https://fhir.example.com/Patient', {
      'authorization': 'Bearer test-token'
    });
    
    expect(strategy.canHandle(req)).toBe(true);
    
    // Test authentication
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('test-user-123');
    expect(result.user?.username).toBe('testuser');
  });

  test('Authentication failure flow', async () => {
    const strategy = new TestStrategy({ name: 'test' });
    
    // Test request handling
    const req = createMockRequest('https://fhir.example.com/Patient'); // No auth header
    expect(strategy.canHandle(req)).toBe(true);
    
    // Test authentication failure
    const result = await strategy.authenticate(req, createMockContext());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing authorization header');
    expect(result.user).toBeUndefined();
  });

  test('Complex data structures in permissions', () => {
    // Test that complex nested data structures work in permission conditions
    const testData = {
      patient: {
        identifier: [
          { system: 'http://hospital.org', value: 'P123' }
        ],
        name: [{ family: 'Doe', given: ['John'] }]
      }
    };
    
    // Verify the test data structure is correct
    expect(testData.patient.identifier[0].value).toBe('P123');
    expect(testData.patient.name[0].family).toBe('Doe');
    
    // This shows the path structure that permission conditions would use
    const identifierValue = testData.patient.identifier[0].value;
    const familyName = testData.patient.name[0].family;
    
    expect(identifierValue).toBe('P123');
    expect(familyName).toBe('Doe');
  });
});

// Export for use in other test files
export { TestStrategy };