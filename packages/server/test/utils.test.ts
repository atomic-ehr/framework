/**
 * Tests for utility functions
 */

import { describe, test, expect } from 'bun:test';
import {
  validateConfig,
  mergeConfig,
  isValidResourceType,
  isValidFhirId,
  parseFhirPath,
  createFhirTimestamp,
  createFhirMeta,
  extractSearchParams,
  acceptsJson,
  getPreferredFormat,
  sanitizeErrorMessage,
  shouldReportError,
  createSafeLogObject
} from '../src/utils.js';
import type { FhirServerConfig } from '../src/types.js';

describe('Utility Functions', () => {
  describe('validateConfig', () => {
    test('should accept valid config', () => {
      const config: FhirServerConfig = {
        port: 3000,
        host: 'localhost',
        timeout: 30000,
        maxBodySize: 1024 * 1024,
        cors: {
          enabled: true,
          origins: ['http://localhost:3000']
        },
        logging: {
          level: 'info',
          format: 'json'
        }
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    test('should reject invalid port', () => {
      expect(() => validateConfig({ port: -1 })).toThrow('Server port must be between 1 and 65535');
      expect(() => validateConfig({ port: 0 })).toThrow('Server port must be between 1 and 65535');
      expect(() => validateConfig({ port: 65536 })).toThrow('Server port must be between 1 and 65535');
      expect(() => validateConfig({ port: 'invalid' as any })).toThrow('Server port must be a valid number');
    });

    test('should reject invalid timeout', () => {
      expect(() => validateConfig({ port: 3000, timeout: -1 })).toThrow('Server timeout must be a positive number');
    });

    test('should reject invalid CORS config', () => {
      expect(() => validateConfig({
        port: 3000,
        cors: { enabled: 'true' as any }
      })).toThrow('CORS enabled must be a boolean');

      expect(() => validateConfig({
        port: 3000,
        cors: { enabled: true, origins: 'localhost' as any }
      })).toThrow('CORS origins must be an array of strings');
    });

    test('should reject invalid logging config', () => {
      expect(() => validateConfig({
        port: 3000,
        logging: { level: 'invalid' as any }
      })).toThrow('Logging level must be one of: debug, info, warn, error');

      expect(() => validateConfig({
        port: 3000,
        logging: { level: 'info', format: 'invalid' as any }
      })).toThrow('Logging format must be either "json" or "text"');
    });
  });

  describe('mergeConfig', () => {
    test('should merge with defaults', () => {
      const userConfig: FhirServerConfig = {
        port: 8080,
        cors: { enabled: true }
      };

      const merged = mergeConfig(userConfig);

      expect(merged.port).toBe(8080);
      expect(merged.host).toBe('localhost'); // Default
      expect(merged.cors.enabled).toBe(true);
      expect(merged.cors.origins).toEqual(['*']); // Default
      expect(merged.logging.level).toBe('info'); // Default
    });

    test('should deep merge nested objects', () => {
      const userConfig: FhirServerConfig = {
        port: 3000,
        cors: { enabled: true, origins: ['http://example.com'] },
        logging: { level: 'debug' }
      };

      const merged = mergeConfig(userConfig);

      expect(merged.cors.enabled).toBe(true);
      expect(merged.cors.origins).toEqual(['http://example.com']);
      expect(merged.cors.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']); // Default
      expect(merged.logging.level).toBe('debug');
      expect(merged.logging.format).toBe('text'); // Default
    });
  });

  describe('isValidResourceType', () => {
    test('should validate FHIR resource types', () => {
      expect(isValidResourceType('Patient')).toBe(true);
      expect(isValidResourceType('Observation')).toBe(true);
      expect(isValidResourceType('DiagnosticReport')).toBe(true);

      expect(isValidResourceType('patient')).toBe(false); // Must start with uppercase
      expect(isValidResourceType('Patient123')).toBe(false); // No numbers
      expect(isValidResourceType('Patient-Report')).toBe(false); // No hyphens
      expect(isValidResourceType('')).toBe(false);
      expect(isValidResourceType('123')).toBe(false);
    });
  });

  describe('isValidFhirId', () => {
    test('should validate FHIR IDs', () => {
      expect(isValidFhirId('123')).toBe(true);
      expect(isValidFhirId('abc-123')).toBe(true);
      expect(isValidFhirId('patient.123')).toBe(true);
      expect(isValidFhirId('a1b2c3')).toBe(true);

      expect(isValidFhirId('')).toBe(false); // Empty
      expect(isValidFhirId('a'.repeat(65))).toBe(false); // Too long
      expect(isValidFhirId('abc/123')).toBe(false); // Invalid character
      expect(isValidFhirId('abc 123')).toBe(false); // Space
    });
  });

  describe('parseFhirPath', () => {
    test('should parse basic resource paths', () => {
      expect(parseFhirPath('/Patient')).toEqual({ resourceType: 'Patient' });
      expect(parseFhirPath('/Patient/123')).toEqual({ resourceType: 'Patient', id: '123' });
      expect(parseFhirPath('/Observation/abc-123')).toEqual({ resourceType: 'Observation', id: 'abc-123' });
    });

    test('should parse history paths', () => {
      expect(parseFhirPath('/Patient/123/_history')).toEqual({
        resourceType: 'Patient',
        id: '123'
      });

      expect(parseFhirPath('/Patient/123/_history/2')).toEqual({
        resourceType: 'Patient',
        id: '123',
        versionId: '2'
      });
    });

    test('should parse operation paths', () => {
      expect(parseFhirPath('/Patient/$validate')).toEqual({
        resourceType: 'Patient',
        operation: '$validate'
      });

      expect(parseFhirPath('/Patient/123/$everything')).toEqual({
        resourceType: 'Patient',
        id: '123',
        operation: '$everything'
      });
    });

    test('should handle invalid paths', () => {
      expect(parseFhirPath('')).toEqual({});
      expect(parseFhirPath('/')).toEqual({});
      expect(parseFhirPath('/metadata')).toEqual({});
      expect(parseFhirPath('/invalid/path')).toEqual({});
    });
  });

  describe('createFhirTimestamp', () => {
    test('should create valid FHIR timestamp', () => {
      const timestamp = createFhirTimestamp();
      expect(timestamp).toMatch(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/);

      const date = new Date('2023-01-01T12:00:00Z');
      const fixedTimestamp = createFhirTimestamp(date);
      expect(fixedTimestamp).toBe('2023-01-01T12:00:00.000Z');
    });
  });

  describe('createFhirMeta', () => {
    test('should create minimal meta', () => {
      const meta = createFhirMeta();
      expect(meta.lastUpdated).toBeTruthy();
      expect(meta.versionId).toBeUndefined();
    });

    test('should create meta with all options', () => {
      const options = {
        versionId: '2',
        lastUpdated: new Date('2023-01-01T12:00:00Z'),
        profile: ['http://example.com/profile'],
        security: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: 'HTEST' }],
        tag: [{ system: 'http://example.com/tags', code: 'test' }]
      };

      const meta = createFhirMeta(options);
      expect(meta.versionId).toBe('2');
      expect(meta.lastUpdated).toBe('2023-01-01T12:00:00.000Z');
      expect(meta.profile).toEqual(['http://example.com/profile']);
      expect(meta.security).toEqual(options.security);
      expect(meta.tag).toEqual(options.tag);
    });
  });

  describe('extractSearchParams', () => {
    test('should extract search parameters', () => {
      const query = {
        name: 'John',
        family: 'Doe',
        gender: 'male',
        _format: 'json',
        _pretty: 'true',
        _summary: 'true'
      };

      const searchParams = extractSearchParams(query);
      expect(searchParams).toEqual({
        name: 'John',
        family: 'Doe',
        gender: 'male'
      });

      expect(searchParams._format).toBeUndefined();
      expect(searchParams._pretty).toBeUndefined();
      expect(searchParams._summary).toBeUndefined();
    });
  });

  describe('acceptsJson', () => {
    test('should detect JSON acceptance', () => {
      expect(acceptsJson('application/json')).toBe(true);
      expect(acceptsJson('application/fhir+json')).toBe(true);
      expect(acceptsJson('*/*')).toBe(true);
      expect(acceptsJson('text/html, application/json')).toBe(true);

      expect(acceptsJson('text/html')).toBe(false);
      expect(acceptsJson('application/xml')).toBe(false);

      expect(acceptsJson()).toBe(true); // Default to true
    });
  });

  describe('getPreferredFormat', () => {
    test('should detect preferred format', () => {
      expect(getPreferredFormat('application/fhir+json')).toBe('json');
      expect(getPreferredFormat('application/json')).toBe('json');
      expect(getPreferredFormat('application/fhir+xml')).toBe('xml');
      expect(getPreferredFormat('application/xml')).toBe('xml');
      expect(getPreferredFormat('text/plain')).toBe('text');
      expect(getPreferredFormat('text/html')).toBe('text');

      expect(getPreferredFormat()).toBe('json'); // Default
      expect(getPreferredFormat('unknown/type')).toBe('json'); // Default
    });
  });

  describe('sanitizeErrorMessage', () => {
    test('should sanitize error messages', () => {
      const error = new Error('Test error message');
      error.stack = 'Error: Test error\\n    at test.js:1:1';

      expect(sanitizeErrorMessage(error)).toBe('Test error message');
      expect(sanitizeErrorMessage(error, true)).toContain('Stack trace:');
      expect(sanitizeErrorMessage(error, true)).toContain('at test.js:1:1');

      const errorWithoutMessage = new Error();
      expect(sanitizeErrorMessage(errorWithoutMessage)).toBe('An unexpected error occurred');
    });
  });

  describe('shouldReportError', () => {
    test('should determine if error should be reported', () => {
      const error = new Error('Internal server error');

      // Don't report client errors (4xx)
      expect(shouldReportError(error, 400)).toBe(false);
      expect(shouldReportError(error, 404)).toBe(false);
      expect(shouldReportError(error, 499)).toBe(false);

      // Report server errors (5xx)
      expect(shouldReportError(error, 500)).toBe(true);
      expect(shouldReportError(error, 503)).toBe(true);

      // Don't report known user errors
      expect(shouldReportError(new Error('Request timeout'), 500)).toBe(false);
      expect(shouldReportError(new Error('Request body too large'), 500)).toBe(false);
      expect(shouldReportError(new Error('Invalid JSON in request body'), 500)).toBe(false);
    });
  });

  describe('createSafeLogObject', () => {
    test('should redact sensitive information', () => {
      const unsafeObject = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'secret123',
        authorization: 'Bearer token123',
        'x-api-key': 'apikey123',
        data: {
          public: 'visible',
          secret: 'hidden',
          token: 'redacted'
        },
        array: [
          { public: 'visible' },
          { password: 'hidden' }
        ]
      };

      const safe = createSafeLogObject(unsafeObject);

      expect(safe.name).toBe('John Doe');
      expect(safe.email).toBe('john@example.com');
      expect(safe.password).toBe('[REDACTED]');
      expect(safe.authorization).toBe('[REDACTED]');
      expect(safe['x-api-key']).toBe('[REDACTED]');
      expect(safe.data.public).toBe('visible');
      expect(safe.data.secret).toBe('[REDACTED]');
      expect(safe.data.token).toBe('[REDACTED]');
      expect(safe.array[0].public).toBe('visible');
      expect(safe.array[1].password).toBe('[REDACTED]');
    });

    test('should handle null and primitive values', () => {
      expect(createSafeLogObject(null)).toBe(null);
      expect(createSafeLogObject(undefined)).toBe(undefined);
      expect(createSafeLogObject('string')).toBe('string');
      expect(createSafeLogObject(123)).toBe(123);
      expect(createSafeLogObject(true)).toBe(true);
    });

    test('should handle arrays', () => {
      const array = ['public', { password: 'secret' }, null, 123];
      const safe = createSafeLogObject(array);

      expect(safe[0]).toBe('public');
      expect(safe[1].password).toBe('[REDACTED]');
      expect(safe[2]).toBe(null);
      expect(safe[3]).toBe(123);
    });
  });
});