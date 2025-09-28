/**
 * Tests for FhirBridge functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FhirBridge, PackageLoadError, SchemaConversionError } from '../src/index.js';
import type { FhirBridgeConfig } from '../src/types.js';

describe('FhirBridge', () => {
  let bridge: FhirBridge;
  let testConfig: FhirBridgeConfig;

  beforeEach(() => {
    testConfig = {
      packageCacheDir: './test-cache',
      registryUrls: ['https://packages.fhir.org'],
      timeout: 30000,
      workingDir: './test-working',
      registry: 'https://packages.fhir.org'
    };
    bridge = new FhirBridge(testConfig);
  });

  afterEach(async () => {
    await bridge.dispose();
  });

  describe('Initialization', () => {
    test('should create bridge with default config', () => {
      const defaultBridge = new FhirBridge();
      expect(defaultBridge).toBeDefined();
    });

    test('should create bridge with custom config', () => {
      expect(bridge).toBeDefined();
    });

    test('should initialize successfully', async () => {
      await expect(bridge.init()).resolves.not.toThrow();
    });

    test('should dispose successfully', async () => {
      await bridge.init();
      await expect(bridge.dispose()).resolves.not.toThrow();
    });
  });

  describe('Package Loading', () => {
    test('should track loading diagnostics', async () => {
      await bridge.init();

      // Clear any existing diagnostics
      bridge.clearDiagnostics();

      try {
        // This will likely fail in test environment, but should create diagnostic
        await bridge.loadPackage('test.package', '1.0.0');
      } catch (error) {
        // Expected to fail in test environment
      }

      const diagnostics = bridge.getDiagnostics();
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].packageName).toBe('test.package');
      expect(diagnostics[0].version).toBe('1.0.0');
    });

    test('should handle package load errors', async () => {
      await bridge.init();

      await expect(
        bridge.loadPackage('nonexistent.package', '1.0.0')
      ).rejects.toThrow(PackageLoadError);
    });

    test('should return cached package on second load', async () => {
      await bridge.init();

      // Mock a successful load by creating a minimal test scenario
      // In a real test, this would use test fixtures
      const packageName = 'test.cached.package';

      try {
        const first = await bridge.loadPackage(packageName);
        const second = await bridge.loadPackage(packageName);
        // If both succeed, they should be the same object
        expect(first).toBe(second);
      } catch (error) {
        // Expected in test environment without real packages
        expect(error).toBeInstanceOf(PackageLoadError);
      }
    });

    test('should clear cache successfully', async () => {
      await bridge.init();
      await bridge.clearCache();

      const diagnostics = bridge.getDiagnostics();
      expect(diagnostics).toHaveLength(0);

      expect(bridge.getLoadedPackages()).toHaveLength(0);
    });
  });

  describe('Schema Conversion', () => {
    test('should handle empty structure definitions', () => {
      const result = bridge.convertToSchemas([]);
      expect(result.schemas.size).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.resourceTypes).toHaveLength(0);
    });

    test('should handle structure definition conversion errors', () => {
      // Create invalid structure definition that should cause conversion error
      const invalidStructDef = {
        resourceType: 'StructureDefinition',
        // Missing required fields that will cause conversion to fail
      } as any;

      const result = bridge.convertToSchemas([invalidStructDef]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toBeInstanceOf(SchemaConversionError);
    });

    test('should handle single structure definition conversion error', () => {
      const invalidStructDef = {
        resourceType: 'StructureDefinition',
        type: 'TestResource'
        // Missing required fields
      } as any;

      expect(() => {
        bridge.convertStructureDefinition(invalidStructDef);
      }).toThrow(SchemaConversionError);
    });
  });

  describe('Package Management', () => {
    test('should start with no loaded packages', () => {
      expect(bridge.getLoadedPackages()).toHaveLength(0);
      expect(bridge.isPackageLoaded('any.package')).toBe(false);
      expect(bridge.getPackage('any.package')).toBeUndefined();
    });

    test('should provide package introspection methods', async () => {
      // Create a mock package for testing
      const mockPackage = {
        id: { name: 'test.package', version: '1.0.0' },
        path: '/test/path',
        resources: [
          { resourceType: 'StructureDefinition', type: 'Patient', kind: 'resource' },
          { resourceType: 'OperationDefinition', name: 'validate' },
          { resourceType: 'SearchParameter', base: ['Patient'], code: 'name' }
        ],
        structureDefinitions: [
          { resourceType: 'StructureDefinition', type: 'Patient', kind: 'resource' }
        ],
        searchParameters: [
          { resourceType: 'SearchParameter', base: ['Patient'], code: 'name' }
        ]
      } as any;

      const resourceTypes = bridge.getResourceTypes(mockPackage);
      expect(resourceTypes).toContain('Patient');

      const structDefs = bridge.getStructureDefinitions(mockPackage);
      expect(structDefs).toHaveLength(1);

      const operations = bridge.getOperationDefinitions(mockPackage);
      expect(operations).toHaveLength(1);

      const searchParams = bridge.getSearchParameters(mockPackage);
      expect(searchParams).toHaveLength(1);
    });
  });

  describe('Canonical Resolution', () => {
    test('should handle canonical resolution errors gracefully', async () => {
      await bridge.init();

      await expect(
        bridge.resolveCanonical('http://example.com/nonexistent')
      ).rejects.toThrow();
    });

    test('should handle resource search errors gracefully', async () => {
      await bridge.init();

      await expect(
        bridge.searchResources({ resourceType: 'NonexistentResource' })
      ).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should create proper error types', () => {
      const packageError = new PackageLoadError(
        'test.package',
        '1.0.0',
        'Test error message'
      );

      expect(packageError.name).toBe('PackageLoadError');
      expect(packageError.packageName).toBe('test.package');
      expect(packageError.version).toBe('1.0.0');
      expect(packageError.message).toContain('test.package@1.0.0');

      const schemaError = new SchemaConversionError(
        'TestResource',
        'Test conversion error'
      );

      expect(schemaError.name).toBe('SchemaConversionError');
      expect(schemaError.resourceType).toBe('TestResource');
      expect(schemaError.message).toContain('TestResource');
    });
  });

  describe('Alternative Loading Methods', () => {
    test('should handle URL-based loading', async () => {
      await bridge.init();

      await expect(
        bridge.loadPackageFromUrl('https://example.com/package.tgz')
      ).rejects.toThrow();
    });

    test('should handle file-based loading', async () => {
      await bridge.init();

      await expect(
        bridge.loadPackageFromFile('/path/to/package.tgz')
      ).rejects.toThrow();
    });
  });
});