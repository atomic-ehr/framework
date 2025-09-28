/**
 * Tests for FHIR routing functionality
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  FhirRouter,
  FhirUrlPattern,
  FhirOperation,
  parseFhirUrl,
  compilePattern,
  matchPattern,
  isValidResourceType,
  isValidFhirId,
  createRoute,
  RouteHelpers
} from '../src/routing/index.js';
import type { FhirRoute, FhirOperationHandler } from '../src/routing/types.js';

describe('FHIR Router', () => {
  let router: FhirRouter;

  beforeEach(() => {
    router = new FhirRouter();
  });

  describe('URL Pattern Matching', () => {
    test('should match read operation', () => {
      const match = router.match('GET', '/Patient/123');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.READ);
      expect(match?.params.resourceType).toBe('Patient');
      expect(match?.params.id).toBe('123');
      expect(match?.level).toBe('instance');
    });

    test('should match vread operation', () => {
      const match = router.match('GET', '/Patient/123/_history/1');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.VREAD);
      expect(match?.params.resourceType).toBe('Patient');
      expect(match?.params.id).toBe('123');
      expect(match?.params.vid).toBe('1');
    });

    test('should match create operation', () => {
      const match = router.match('POST', '/Patient');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.CREATE);
      expect(match?.params.resourceType).toBe('Patient');
      expect(match?.level).toBe('type');
    });

    test('should match update operation', () => {
      const match = router.match('PUT', '/Patient/123');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.UPDATE);
      expect(match?.params.resourceType).toBe('Patient');
      expect(match?.params.id).toBe('123');
    });

    test('should match delete operation', () => {
      const match = router.match('DELETE', '/Patient/123');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.DELETE);
      expect(match?.params.resourceType).toBe('Patient');
      expect(match?.params.id).toBe('123');
    });

    test('should match search operation', () => {
      const match = router.match('GET', '/Patient?name=john');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.SEARCH_TYPE);
      expect(match?.params.resourceType).toBe('Patient');
      expect(match?.query?.name).toBe('john');
    });

    test('should match capabilities operation', () => {
      const match = router.match('GET', '/metadata');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.CAPABILITIES);
      expect(match?.level).toBe('system');
    });

    test('should match system search', () => {
      const match = router.match('GET', '/?_type=Patient');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.SEARCH_SYSTEM);
      expect(match?.level).toBe('system');
    });

    test('should match batch operation', () => {
      const match = router.match('POST', '/');
      expect(match).toBeTruthy();
      expect(match?.operation).toBe(FhirOperation.BATCH);
      expect(match?.level).toBe('system');
    });

    test('should match custom operations', () => {
      const systemMatch = router.match('POST', '/$validate');
      expect(systemMatch?.operation).toBe(FhirOperation.OPERATION);
      expect(systemMatch?.level).toBe('system');
      expect(systemMatch?.params.operation).toBe('validate');

      const typeMatch = router.match('POST', '/Patient/$validate');
      expect(typeMatch?.operation).toBe(FhirOperation.OPERATION);
      expect(typeMatch?.level).toBe('type');
      expect(typeMatch?.params.resourceType).toBe('Patient');
      expect(typeMatch?.params.operation).toBe('validate');

      const instanceMatch = router.match('POST', '/Patient/123/$everything');
      expect(instanceMatch?.operation).toBe(FhirOperation.OPERATION);
      expect(instanceMatch?.level).toBe('instance');
      expect(instanceMatch?.params.resourceType).toBe('Patient');
      expect(instanceMatch?.params.id).toBe('123');
      expect(instanceMatch?.params.operation).toBe('everything');
    });
  });

  describe('URL Parsing', () => {
    test('should parse read URLs', () => {
      const parsed = parseFhirUrl('GET', '/Patient/123');
      expect(parsed.operation).toBe(FhirOperation.READ);
      expect(parsed.level).toBe('instance');
      expect(parsed.resourceType).toBe('Patient');
      expect(parsed.id).toBe('123');
    });

    test('should parse search URLs with parameters', () => {
      const parsed = parseFhirUrl('GET', '/Patient?name=john&gender=male');
      expect(parsed.operation).toBe(FhirOperation.SEARCH_TYPE);
      expect(parsed.level).toBe('type');
      expect(parsed.resourceType).toBe('Patient');
      expect(parsed.searchParams?.name).toBe('john');
      expect(parsed.searchParams?.gender).toBe('male');
    });

    test('should parse history URLs', () => {
      const typeHistory = parseFhirUrl('GET', '/Patient/_history');
      expect(typeHistory.operation).toBe(FhirOperation.HISTORY_TYPE);
      expect(typeHistory.level).toBe('type');
      expect(typeHistory.resourceType).toBe('Patient');

      const instanceHistory = parseFhirUrl('GET', '/Patient/123/_history');
      expect(instanceHistory.operation).toBe(FhirOperation.HISTORY_INSTANCE);
      expect(instanceHistory.level).toBe('instance');
      expect(instanceHistory.resourceType).toBe('Patient');
      expect(instanceHistory.id).toBe('123');

      const vread = parseFhirUrl('GET', '/Patient/123/_history/1');
      expect(vread.operation).toBe(FhirOperation.VREAD);
      expect(vread.vid).toBe('1');
    });

    test('should parse custom operation URLs', () => {
      const systemOp = parseFhirUrl('POST', '/$validate');
      expect(systemOp.operation).toBe(FhirOperation.OPERATION);
      expect(systemOp.level).toBe('system');
      expect(systemOp.operationName).toBe('validate');

      const typeOp = parseFhirUrl('POST', '/Patient/$validate');
      expect(typeOp.operation).toBe(FhirOperation.OPERATION);
      expect(typeOp.level).toBe('type');
      expect(typeOp.resourceType).toBe('Patient');
      expect(typeOp.operationName).toBe('validate');
    });

    test('should handle invalid URLs', () => {
      expect(() => parseFhirUrl('GET', '/invalid-resource/123')).toThrow();
      expect(() => parseFhirUrl('GET', '/Patient/123/invalid')).toThrow();
      expect(() => parseFhirUrl('INVALID', '/Patient')).toThrow();
    });
  });

  describe('Pattern Compilation and Matching', () => {
    test('should compile simple patterns', () => {
      const compiled = compilePattern('/:resourceType/:id');
      expect(compiled.paramNames).toEqual(['resourceType', 'id']);
      expect(compiled.pattern).toBe('/:resourceType/:id');
    });

    test('should match compiled patterns', () => {
      const compiled = compilePattern('/:resourceType/:id');
      const params = matchPattern(compiled, '/Patient/123');
      expect(params).toEqual({
        resourceType: 'Patient',
        id: '123'
      });
    });

    test('should handle complex patterns', () => {
      const compiled = compilePattern('/:resourceType/:id/_history/:vid');
      const params = matchPattern(compiled, '/Patient/123/_history/1');
      expect(params).toEqual({
        resourceType: 'Patient',
        id: '123',
        vid: '1'
      });
    });

    test('should return null for non-matching patterns', () => {
      const compiled = compilePattern('/:resourceType/:id');
      const params = matchPattern(compiled, '/Patient');
      expect(params).toBeNull();
    });
  });

  describe('Resource Type Validation', () => {
    test('should validate FHIR resource types', () => {
      expect(isValidResourceType('Patient')).toBe(true);
      expect(isValidResourceType('Observation')).toBe(true);
      expect(isValidResourceType('DiagnosticReport')).toBe(true);
      expect(isValidResourceType('StructureDefinition')).toBe(true);

      expect(isValidResourceType('patient')).toBe(false);
      expect(isValidResourceType('Patient123')).toBe(false);
      expect(isValidResourceType('Patient-Report')).toBe(false);
      expect(isValidResourceType('123Patient')).toBe(false);
      expect(isValidResourceType('')).toBe(false);
    });
  });

  describe('FHIR ID Validation', () => {
    test('should validate FHIR IDs', () => {
      expect(isValidFhirId('123')).toBe(true);
      expect(isValidFhirId('abc-123')).toBe(true);
      expect(isValidFhirId('patient.123')).toBe(true);
      expect(isValidFhirId('a1b2c3')).toBe(true);
      expect(isValidFhirId('A1B2C3')).toBe(true);

      expect(isValidFhirId('')).toBe(false);
      expect(isValidFhirId('a'.repeat(65))).toBe(false);
      expect(isValidFhirId('abc/123')).toBe(false);
      expect(isValidFhirId('abc 123')).toBe(false);
      expect(isValidFhirId('abc@123')).toBe(false);
    });
  });

  describe('Route Management', () => {
    test('should add custom routes', () => {
      const handler: FhirOperationHandler = async () => ({
        statusCode: 200,
        responseHeaders: {},
        responseBody: { test: true }
      });

      const route: FhirRoute = {
        method: 'GET',
        pattern: FhirUrlPattern.READ,
        operation: FhirOperation.READ,
        level: 'instance',
        handler,
        priority: 150
      };

      router.addRoute(route);
      expect(router.hasRoute('GET', FhirUrlPattern.READ)).toBe(true);
    });

    test('should prevent duplicate routes', () => {
      const handler: FhirOperationHandler = async () => ({
        statusCode: 200,
        responseHeaders: {},
        responseBody: {}
      });

      const route: FhirRoute = {
        method: 'GET',
        pattern: FhirUrlPattern.READ,
        operation: FhirOperation.READ,
        level: 'instance',
        handler
      };

      // First add should succeed
      router.addRoute(route);

      // Second add should fail
      expect(() => router.addRoute(route)).toThrow();
    });

    test('should remove routes', () => {
      router.removeRoute('GET', FhirUrlPattern.READ);
      expect(router.hasRoute('GET', FhirUrlPattern.READ)).toBe(false);
    });

    test('should get routes by method', () => {
      const getRoutes = router.getRoutes('GET');
      expect(getRoutes.length).toBeGreaterThan(0);
      expect(getRoutes.every(r => r.method === 'GET')).toBe(true);

      const postRoutes = router.getRoutes('POST');
      expect(postRoutes.length).toBeGreaterThan(0);
      expect(postRoutes.every(r => r.method === 'POST')).toBe(true);
    });
  });

  describe('Route Builders', () => {
    test('should build routes with fluent API', () => {
      const handler: FhirOperationHandler = async () => ({
        statusCode: 200,
        responseHeaders: {},
        responseBody: {}
      });

      const route = createRoute()
        .method('GET')
        .pattern(FhirUrlPattern.READ)
        .operation(FhirOperation.READ)
        .level('instance')
        .handler(handler)
        .priority(150)
        .description('Custom read handler')
        .build();

      expect(route.method).toBe('GET');
      expect(route.pattern).toBe(FhirUrlPattern.READ);
      expect(route.operation).toBe(FhirOperation.READ);
      expect(route.priority).toBe(150);
      expect(route.description).toBe('Custom read handler');
    });

    test('should use route helpers', () => {
      const handler: FhirOperationHandler = async () => ({
        statusCode: 200,
        responseHeaders: {},
        responseBody: {}
      });

      const readRoute = RouteHelpers.read('Patient', handler);
      expect(readRoute.method).toBe('GET');
      expect(readRoute.operation).toBe(FhirOperation.READ);
      expect(readRoute.level).toBe('instance');

      const createRoute = RouteHelpers.create('Patient', handler);
      expect(createRoute.method).toBe('POST');
      expect(createRoute.operation).toBe(FhirOperation.CREATE);
      expect(createRoute.level).toBe('type');

      const searchRoute = RouteHelpers.search('Patient', handler);
      expect(searchRoute.method).toBe('GET');
      expect(searchRoute.operation).toBe(FhirOperation.SEARCH_TYPE);
      expect(searchRoute.level).toBe('type');
    });
  });

  describe('Router Statistics', () => {
    test('should collect statistics', () => {
      const stats = router.getStats();
      expect(stats.totalRoutes).toBeGreaterThan(0);
      expect(stats.routesByMethod.GET).toBeGreaterThan(0);
      expect(stats.routesByMethod.POST).toBeGreaterThan(0);
      expect(stats.totalMatches).toBe(0);
    });

    test('should update match statistics', () => {
      // Perform some matches
      router.match('GET', '/Patient/123');
      router.match('POST', '/Patient');
      router.match('GET', '/invalid/url');

      const stats = router.getStats();
      expect(stats.totalMatches).toBe(3);
      expect(stats.successfulMatches).toBe(2);
      expect(stats.failedMatches).toBe(1);
      expect(stats.averageMatchTime).toBeGreaterThan(0);
    });

    test('should track popular routes', () => {
      // Perform multiple matches on the same route
      for (let i = 0; i < 5; i++) {
        router.match('GET', '/Patient/123');
      }

      const stats = router.getStats();
      expect(stats.popularRoutes.length).toBeGreaterThan(0);
      const topRoute = stats.popularRoutes[0];
      expect(topRoute.count).toBeGreaterThan(0);
    });

    test('should reset statistics', () => {
      router.match('GET', '/Patient/123');
      router.resetStats();

      const stats = router.getStats();
      expect(stats.totalMatches).toBe(0);
      expect(stats.successfulMatches).toBe(0);
      expect(stats.failedMatches).toBe(0);
      expect(stats.popularRoutes).toHaveLength(0);
    });
  });

  describe('Priority-based Routing', () => {
    test('should match routes by priority', () => {
      const highPriorityHandler: FhirOperationHandler = async () => ({
        statusCode: 200,
        responseHeaders: {},
        responseBody: { priority: 'high' }
      });

      const lowPriorityHandler: FhirOperationHandler = async () => ({
        statusCode: 200,
        responseHeaders: {},
        responseBody: { priority: 'low' }
      });

      // Add high priority route that matches same pattern
      const highPriorityRoute: FhirRoute = {
        method: 'GET',
        pattern: FhirUrlPattern.SEARCH_TYPE,
        operation: FhirOperation.SEARCH_TYPE,
        level: 'type',
        handler: highPriorityHandler,
        priority: 200
      };

      router.addRoute(highPriorityRoute);

      // Match should return the higher priority route
      const match = router.match('GET', '/Patient');
      expect(match?.route.priority).toBe(200);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid route configurations', () => {
      const invalidRoute = {
        method: '',
        pattern: FhirUrlPattern.READ,
        operation: FhirOperation.READ,
        level: 'instance' as const,
        handler: async () => ({ statusCode: 200, responseHeaders: {}, responseBody: {} })
      };

      expect(() => router.addRoute(invalidRoute as FhirRoute)).toThrow();
    });

    test('should handle mismatched levels', () => {
      const mismatchedRoute: FhirRoute = {
        method: 'GET',
        pattern: FhirUrlPattern.READ, // instance level pattern
        operation: FhirOperation.READ,
        level: 'type', // but declared as type level
        handler: async () => ({ statusCode: 200, responseHeaders: {}, responseBody: {} })
      };

      expect(() => router.addRoute(mismatchedRoute)).toThrow();
    });
  });
});