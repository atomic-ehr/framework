import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Atomic, defineResource, defineOperation, defineMiddleware } from '../src/index.js';

describe('Atomic Framework', () => {
  let app;
  let server;

  beforeAll(() => {
    app = new Atomic({
      server: {
        name: 'Test Server',
        version: '1.0.0'
      },
      storage: {
        adapter: 'sqlite',
        config: {
          database: ':memory:'
        }
      },
      autoload: {
        enabled: false // Disable autoload for tests
      }
    });
  });

  afterAll(() => {
    if (server) {
      server.stop();
    }
  });

  describe('Core functionality', () => {
    test('should create an Atomic instance', () => {
      expect(app).toBeDefined();
      expect(app.config.server.name).toBe('Test Server');
    });

    test('should register a resource', () => {
      const patientResource = defineResource({
        resourceType: 'Patient',
        hooks: {
          beforeCreate: async resource => resource
        }
      });

      app.registerResource('Patient', patientResource);
      expect(app.resources.has('Patient')).toBe(true);
    });

    test('should register an operation', () => {
      const testOperation = defineOperation({
        name: 'test',
        resource: 'Patient',
        type: 'type',
        async handler() {
          return { success: true };
        }
      });

      app.registerOperation(testOperation);
      expect(app.operations.get('Patient', 'test', 'type')).toBeDefined();
    });

    test('should register middleware', () => {
      const testMiddleware = defineMiddleware({
        name: 'test-middleware',
        async before() {},
        async after(response) {
          return response;
        }
      });

      app.use(testMiddleware);
      expect(app.middleware.middleware.length).toBeGreaterThan(0);
    });
  });

  describe('Resource CRUD operations', () => {
    test('should create a resource', async () => {
      const patientResource = defineResource({
        resourceType: 'Patient',
        hooks: {
          beforeCreate: async resource => {
            resource.active = true;
            return resource;
          }
        }
      });

      app.registerResource('Patient', patientResource);

      const patient = {
        resourceType: 'Patient',
        name: [{ family: 'Test', given: ['John'] }]
      };

      const created = await app.storage.create('Patient', patient);
      expect(created.id).toBeDefined();
      expect(created.resourceType).toBe('Patient');
      expect(created.meta).toBeDefined();
      expect(created.meta.versionId).toBeDefined();
    });

    test('should read a resource', async () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ family: 'Test', given: ['Jane'] }]
      };

      const created = await app.storage.create('Patient', patient);
      const read = await app.storage.read('Patient', created.id);

      expect(read).toBeDefined();
      expect(read.id).toBe(created.id);
      expect(read.name[0].family).toBe('Test');
    });

    test('should update a resource', async () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ family: 'Test', given: ['Bob'] }]
      };

      const created = await app.storage.create('Patient', patient);
      
      const updated = await app.storage.update('Patient', created.id, {
        ...created,
        name: [{ family: 'Updated', given: ['Bob'] }]
      });

      expect(updated.name[0].family).toBe('Updated');
      expect(updated.meta.versionId).not.toBe(created.meta.versionId);
    });

    test('should delete a resource', async () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ family: 'ToDelete', given: ['Test'] }]
      };

      const created = await app.storage.create('Patient', patient);
      await app.storage.delete('Patient', created.id);

      const read = await app.storage.read('Patient', created.id);
      expect(read).toBeNull();
    });

    test('should search resources', async () => {
      // Create multiple patients
      await app.storage.create('Patient', {
        resourceType: 'Patient',
        name: [{ family: 'Search1' }]
      });
      await app.storage.create('Patient', {
        resourceType: 'Patient',
        name: [{ family: 'Search2' }]
      });

      const results = await app.storage.search('Patient', {});
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Server functionality', () => {
    test('should start server', async () => {
      server = await app.start(3333);
      expect(server).toBeDefined();
      expect(server.port).toBe(3333);
    });

    test('should respond to metadata endpoint', async () => {
      const response = await fetch('http://localhost:3333/metadata');
      expect(response.status).toBe(200);
      
      const metadata = await response.json();
      expect(metadata.resourceType).toBe('CapabilityStatement');
      expect(metadata.status).toBe('active');
    });

    test('should create resource via HTTP', async () => {
      const response = await fetch('http://localhost:3333/Patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: 'Patient',
          name: [{ family: 'HTTPTest' }]
        })
      });

      expect(response.status).toBe(201);
      const created = await response.json();
      expect(created.id).toBeDefined();
      expect(created.name[0].family).toBe('HTTPTest');
    });

    test('should handle errors gracefully', async () => {
      const response = await fetch('http://localhost:3333/InvalidResource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' })
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });
  });
});

describe('Filesystem Loader', () => {
  test('should detect resource exports', () => {
    const resource = defineResource({
      resourceType: 'TestResource',
      hooks: {}
    });

    expect(resource.resourceType).toBe('TestResource');
    expect(resource.hooks).toBeDefined();
  });

  test('should detect operation exports', () => {
    const operation = defineOperation({
      name: 'testOp',
      resource: 'Patient',
      type: 'type',
      async handler() {
        return { success: true };
      }
    });

    expect(operation.name).toBe('testOp');
    expect(operation.resource).toBe('Patient');
    expect(operation.type).toBe('type');
    expect(operation.handler).toBeDefined();
  });

  test('should detect middleware exports', () => {
    const middleware = defineMiddleware({
      name: 'testMiddleware',
      async before() {},
      async after(response) {
        return response;
      }
    });

    expect(middleware.name).toBe('testMiddleware');
    expect(middleware.before).toBeDefined();
    expect(middleware.after).toBeDefined();
  });
});