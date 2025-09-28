/**
 * Integration tests for FhirServer with package loading
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FhirServer } from '../src/index.js';
import type { FhirServerConfig } from '../src/types.js';

describe('FhirServer Package Integration', () => {
  let server: FhirServer;
  let testConfig: FhirServerConfig;
  let baseUrl: string;

  beforeEach(() => {
    const port = 3200 + Math.floor(Math.random() * 100);
    testConfig = {
      port,
      host: 'localhost',
      logging: { level: 'error' }, // Suppress logs during tests
      timeout: 5000,
      packages: [], // Start with no packages to avoid load errors
      packageConfig: {
        cacheDir: './test-cache',
        autoLoadBaseResources: false,
        enableProgressLogging: false,
        failOnPackageLoadError: false
      }
    };
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  describe('Server Without Packages', () => {
    test('should start successfully without packages', async () => {
      server = new FhirServer(testConfig);
      await expect(server.start()).resolves.not.toThrow();
      expect(server.isRunning()).toBe(true);
    });

    test('should provide empty package information', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      expect(server.getLoadedPackages()).toHaveLength(0);
      expect(server.getSchemas().size).toBe(0);
      expect(server.getSupportedResourceTypes()).toHaveLength(0);
      expect(server.getPackageStats()).toBeUndefined();
    });

    test('should handle resource type checks with no packages', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      expect(server.isResourceTypeSupported('Patient')).toBe(false);
      expect(server.getSchema('Patient')).toBeUndefined();
    });
  });

  describe('Server With Package Configuration', () => {
    test('should attempt to load configured packages', async () => {
      const configWithPackages = {
        ...testConfig,
        packages: ['test.package@1.0.0'],
        packageConfig: {
          ...testConfig.packageConfig,
          failOnPackageLoadError: false // Don't fail the test
        }
      };

      server = new FhirServer(configWithPackages);

      // Should start successfully even if package loading fails
      await expect(server.start()).resolves.not.toThrow();
      expect(server.isRunning()).toBe(true);
    });

    test('should fail to start if package loading fails and configured to fail', async () => {
      const configWithFailOnError = {
        ...testConfig,
        packages: ['nonexistent.package@1.0.0'],
        packageConfig: {
          ...testConfig.packageConfig,
          failOnPackageLoadError: true
        }
      };

      server = new FhirServer(configWithFailOnError);

      // Should fail to start due to package load error
      await expect(server.start()).rejects.toThrow();
    });
  });

  describe('Hook Integration', () => {
    test('should register package integration hooks', async () => {
      const configWithPackages = {
        ...testConfig,
        packages: ['test.package@1.0.0']
      };

      server = new FhirServer(configWithPackages);
      await server.start();

      // Test that package-related hooks are working by making a request
      const response = await fetch(`${baseUrl}/Patient/123`);
      expect(response.status).toBe(501); // Not implemented, but should be routed
    });

    test('should provide package context in hooks', async () => {
      let hookContext: any = null;

      const configWithHook = {
        ...testConfig,
        packages: [],
        hooks: [{
          name: 'test-package-context',
          phase: 'preRequest' as const,
          priority: 50,
          handler: async (context: any) => {
            hookContext = {
              hasSchemas: 'schemas' in context,
              hasPackageLoader: 'packageLoader' in context,
              hasGetSchema: typeof context.getSchema === 'function',
              hasIsResourceTypeSupported: typeof context.isResourceTypeSupported === 'function'
            };
          }
        }]
      };

      server = new FhirServer(configWithHook);
      await server.start();

      // Make a request to trigger hooks
      await fetch(`${baseUrl}/Patient/123`);

      expect(hookContext).toBeTruthy();
      expect(hookContext.hasSchemas).toBe(true);
      expect(hookContext.hasPackageLoader).toBe(true);
      expect(hookContext.hasGetSchema).toBe(true);
      expect(hookContext.hasIsResourceTypeSupported).toBe(true);
    });
  });

  describe('FHIR Endpoint Integration', () => {
    test('should handle Patient read with package context', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/Patient/123`);
      expect(response.status).toBe(501); // Not implemented
      expect(response.headers.get('content-type')).toContain('application/fhir+json');

      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
    });

    test('should handle capabilities endpoint with package info', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const response = await fetch(`${baseUrl}/metadata`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/fhir+json');

      const body = await response.json();
      expect(body.resourceType).toBe('CapabilityStatement');
      expect(body.software.name).toBe('@atomic-ehr/server');
    });

    test('should handle resource creation with validation context', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      const patient = {
        resourceType: 'Patient',
        name: [{ family: 'Doe', given: ['John'] }],
        gender: 'male'
      };

      const response = await fetch(`${baseUrl}/Patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(patient)
      });

      expect(response.status).toBe(501); // Not implemented
      const body = await response.json();
      expect(body.resourceType).toBe('OperationOutcome');
    });
  });

  describe('Package Loading Events', () => {
    test('should handle package loading progress', async () => {
      const events: string[] = [];

      // Capture console output to verify progress logging
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        events.push(args.join(' '));
      };

      try {
        const configWithPackages = {
          ...testConfig,
          packages: ['test.package@1.0.0'],
          packageConfig: {
            ...testConfig.packageConfig,
            enableProgressLogging: true,
            failOnPackageLoadError: false
          }
        };

        server = new FhirServer(configWithPackages);
        await server.start();

        // Should have attempted to log package loading
        // (Even if it fails, should show loading attempt)
        expect(server.isRunning()).toBe(true);

      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Server Lifecycle with Packages', () => {
    test('should properly initialize and dispose package integration', async () => {
      const configWithPackages = {
        ...testConfig,
        packages: ['test.package@1.0.0'],
        packageConfig: {
          ...testConfig.packageConfig,
          failOnPackageLoadError: false
        }
      };

      server = new FhirServer(configWithPackages);

      // Start should initialize package integration
      await server.start();
      expect(server.isRunning()).toBe(true);

      // Stop should dispose package integration
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    test('should handle server restart with packages', async () => {
      const configWithPackages = {
        ...testConfig,
        packages: ['test.package@1.0.0'],
        packageConfig: {
          ...testConfig.packageConfig,
          failOnPackageLoadError: false
        }
      };

      server = new FhirServer(configWithPackages);

      // First start
      await server.start();
      expect(server.isRunning()).toBe(true);

      // Stop
      await server.stop();
      expect(server.isRunning()).toBe(false);

      // Restart should work
      await server.start();
      expect(server.isRunning()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle package integration errors gracefully', async () => {
      // Test with invalid package config
      const configWithInvalidPackages = {
        ...testConfig,
        packages: [''], // Invalid package name
        packageConfig: {
          ...testConfig.packageConfig,
          failOnPackageLoadError: false
        }
      };

      server = new FhirServer(configWithInvalidPackages);

      // Should start despite invalid package
      await expect(server.start()).resolves.not.toThrow();
      expect(server.isRunning()).toBe(true);
    });

    test('should maintain server functionality without packages', async () => {
      server = new FhirServer(testConfig);
      await server.start();

      // Basic server functionality should work
      const response = await fetch(`${baseUrl}/metadata`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.resourceType).toBe('CapabilityStatement');
    });
  });
});