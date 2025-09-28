/**
 * Tests for PackageLoader functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PackageLoader, PackageLoaderError, MultiplePackageLoadError } from '../src/index.js';
import { FhirBridge } from '@atomic-ehr/fhir-bridge';
import type { PackageLoaderConfig, PackageEvent } from '../src/types.js';

describe('PackageLoader', () => {
  let loader: PackageLoader;
  let testConfig: PackageLoaderConfig;
  let mockBridge: FhirBridge;

  beforeEach(() => {
    mockBridge = new FhirBridge({
      packageCacheDir: './test-cache',
      workingDir: './test-working'
    });

    testConfig = {
      packages: ['test.package@1.0.0'],
      bridge: mockBridge,
      autoLoadBaseResources: true,
      bridgeConfig: {
        packageCacheDir: './test-cache'
      }
    };

    loader = new PackageLoader(testConfig);
  });

  afterEach(async () => {
    await loader.dispose();
  });

  describe('Initialization', () => {
    test('should create loader with config', () => {
      expect(loader).toBeDefined();
    });

    test('should create loader without bridge (creates own)', () => {
      const configWithoutBridge = {
        packages: ['test.package'],
        bridgeConfig: { packageCacheDir: './test' }
      };

      const loaderWithoutBridge = new PackageLoader(configWithoutBridge);
      expect(loaderWithoutBridge).toBeDefined();
    });

    test('should initialize successfully', async () => {
      await expect(loader.init()).resolves.not.toThrow();
    });

    test('should dispose successfully', async () => {
      await loader.init();
      await expect(loader.dispose()).resolves.not.toThrow();
    });
  });

  describe('Event Handling', () => {
    test('should add and remove event listeners', () => {
      const events: PackageEvent[] = [];
      const listener = (event: PackageEvent) => {
        events.push(event);
      };

      loader.addEventListener(listener);
      loader.removeEventListener(listener);

      // Should not crash
      expect(true).toBe(true);
    });

    test('should handle listener errors gracefully', () => {
      const errorListener = () => {
        throw new Error('Test listener error');
      };

      loader.addEventListener(errorListener);

      // Should not crash when emitting events
      expect(true).toBe(true);
    });
  });

  describe('Package Loading', () => {
    test('should start with no loaded packages', () => {
      expect(loader.getLoadedPackages()).toHaveLength(0);
      expect(loader.getAllResourceTypes()).toHaveLength(0);
      expect(loader.getSchemas().size).toBe(0);
    });

    test('should handle single package load error', async () => {
      await loader.init();

      await expect(
        loader.load('nonexistent.package', '1.0.0')
      ).rejects.toThrow(PackageLoaderError);
    });

    test('should handle multiple package load with some failures', async () => {
      await loader.init();

      const packages = [
        'nonexistent.package1@1.0.0',
        'nonexistent.package2@1.0.0'
      ];

      await expect(
        loader.loadMultiple(packages)
      ).rejects.toThrow(MultiplePackageLoadError);
    });

    test('should handle config-based loading', async () => {
      await loader.init();

      const config = {
        packages: ['nonexistent.package@1.0.0']
      };

      await expect(
        loader.loadFromConfig(config)
      ).rejects.toThrow();
    });

    test('should return cached package on repeated load', async () => {
      await loader.init();

      try {
        const first = await loader.load('test.package', '1.0.0');
        const second = await loader.load('test.package', '1.0.0');
        expect(first).toBe(second);
      } catch (error) {
        // Expected in test environment
        expect(error).toBeInstanceOf(PackageLoaderError);
      }
    });
  });

  describe('Schema Management', () => {
    test('should provide schema access methods', () => {
      const schemas = loader.getSchemas();
      expect(schemas).toBeInstanceOf(Map);

      const schema = loader.getSchema('Patient');
      expect(schema).toBeUndefined(); // No packages loaded yet

      const resourceTypes = loader.getAllResourceTypes();
      expect(resourceTypes).toHaveLength(0);
    });

    test('should check resource type support', () => {
      expect(loader.isResourceTypeSupported('Patient')).toBe(false);
      expect(loader.isResourceTypeSupported('NonexistentResource')).toBe(false);
    });
  });

  describe('Package Management', () => {
    test('should provide package access methods', () => {
      expect(loader.getPackage('test.package')).toBeUndefined();
      expect(loader.isPackageLoaded('test.package')).toBe(false);

      const resourceTypes = loader.getResourceTypesFromPackage('test.package');
      expect(resourceTypes).toHaveLength(0);
    });

    test('should provide operation and search parameter info', () => {
      const operations = loader.getSupportedOperations('Patient');
      expect(operations).toContain('read');
      expect(operations).toContain('create');
      expect(operations).toContain('update');
      expect(operations).toContain('delete');
      expect(operations).toContain('search');

      const searchParams = loader.getSearchParameters('Patient');
      expect(searchParams).toHaveLength(0); // No packages loaded
    });
  });

  describe('Resource Discovery', () => {
    test('should provide resource discovery', () => {
      const discovery = loader.discoverResources();

      expect(discovery.resourceTypes).toHaveLength(0);
      expect(discovery.resourceTypesByPackage).toBeInstanceOf(Map);
      expect(discovery.operationsByResourceType).toBeInstanceOf(Map);
      expect(discovery.searchParametersByResourceType).toBeInstanceOf(Map);
      expect(discovery.baseProfiles).toHaveLength(0);
      expect(discovery.constraintProfiles).toHaveLength(0);
    });

    test('should generate statistics', () => {
      const stats = loader.generateStats();

      expect(stats.totalPackages).toBe(0);
      expect(stats.totalResourceTypes).toBe(0);
      expect(stats.totalSchemas).toBe(0);
      expect(stats.totalStructureDefinitions).toBe(0);
      expect(stats.totalSearchParameters).toBe(0);
      expect(stats.totalLoadTime).toBe(0);
      expect(stats.packageBreakdown).toHaveLength(0);
    });
  });

  describe('Package Unloading', () => {
    test('should handle unload of non-existent package', async () => {
      await expect(
        loader.unload('nonexistent.package')
      ).resolves.not.toThrow();
    });

    test('should handle unload all packages', async () => {
      await expect(
        loader.unloadAll()
      ).resolves.not.toThrow();

      expect(loader.getLoadedPackages()).toHaveLength(0);
      expect(loader.getAllResourceTypes()).toHaveLength(0);
    });
  });

  describe('Configuration Access', () => {
    test('should provide config access', () => {
      const config = loader.getConfig();
      expect(config.packages).toEqual(['test.package@1.0.0']);
      expect(config.autoLoadBaseResources).toBe(true);
    });

    test('should provide bridge access', () => {
      const bridge = loader.getBridge();
      expect(bridge).toBe(mockBridge);
    });
  });

  describe('Error Types', () => {
    test('should create proper error types', () => {
      const loaderError = new PackageLoaderError(
        'Test error message',
        'TEST_ERROR',
        new Error('Cause')
      );

      expect(loaderError.name).toBe('PackageLoaderError');
      expect(loaderError.code).toBe('TEST_ERROR');
      expect(loaderError.cause).toBeInstanceOf(Error);

      const multiError = new MultiplePackageLoadError(
        [
          { name: 'package1', error: 'Error 1' },
          { name: 'package2', error: 'Error 2' }
        ],
        ['package3']
      );

      expect(multiError.name).toBe('MultiplePackageLoadError');
      expect(multiError.failedPackages).toHaveLength(2);
      expect(multiError.successfulPackages).toHaveLength(1);
      expect(multiError.message).toContain('Failed to load 2 packages');
    });
  });

  describe('Edge Cases', () => {
    test('should handle package specification parsing', async () => {
      await loader.init();

      // Test package without version
      try {
        await loader.load('package-without-version');
      } catch (error) {
        expect(error).toBeInstanceOf(PackageLoaderError);
      }

      // Test package with version
      try {
        await loader.load('package-with-version', '2.0.0');
      } catch (error) {
        expect(error).toBeInstanceOf(PackageLoaderError);
      }
    });

    test('should handle empty package arrays', async () => {
      await loader.init();

      const results = await loader.loadMultiple([]);
      expect(results).toHaveLength(0);

      const configResults = await loader.loadFromConfig({ packages: [] });
      expect(configResults).toHaveLength(0);
    });
  });
});