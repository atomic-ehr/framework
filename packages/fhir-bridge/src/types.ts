/**
 * Type definitions for FHIR Bridge
 */

import type { CanonicalManager, Resource, PackageId, SearchParameter } from '@atomic-ehr/fhir-canonical-manager';
import type { FHIRSchema, StructureDefinition } from '@atomic-ehr/fhirschema';

/**
 * Configuration for FhirBridge
 */
export interface FhirBridgeConfig {
  /** Directory for package caching */
  packageCacheDir?: string;

  /** Registry URLs for package resolution */
  registryUrls?: string[];

  /** Timeout for package operations in milliseconds */
  timeout?: number;

  /** Working directory for canonical manager */
  workingDir?: string;

  /** Custom registry URL for canonical manager */
  registry?: string;
}

/**
 * FHIR Package interface
 */
export interface FhirPackage {
  /** Package metadata */
  id: PackageId;

  /** Package file path */
  path: string;

  /** Canonical URL */
  canonical?: string;

  /** Supported FHIR versions */
  fhirVersions?: string[];

  /** All resources in the package */
  resources: Resource[];

  /** Structure definitions in the package */
  structureDefinitions: StructureDefinition[];

  /** Search parameters in the package */
  searchParameters: SearchParameter[];
}

/**
 * Package loading diagnostic information
 */
export interface PackageLoadDiagnostic {
  /** Package name */
  packageName: string;

  /** Package version */
  version?: string;

  /** Loading status */
  status: 'loading' | 'loaded' | 'failed';

  /** Number of resources loaded */
  resourceCount?: number;

  /** Time taken to load in milliseconds */
  loadTime?: number;

  /** Error message if failed */
  error?: string;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Bridge error types
 */
export class FhirBridgeError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'FhirBridgeError';
  }
}

export class PackageLoadError extends FhirBridgeError {
  constructor(
    public readonly packageName: string,
    public readonly version: string | undefined,
    message: string,
    cause?: Error
  ) {
    super(`Failed to load package ${packageName}${version ? `@${version}` : ''}: ${message}`, cause, 'PACKAGE_LOAD_ERROR');
    this.name = 'PackageLoadError';
  }
}

export class SchemaConversionError extends FhirBridgeError {
  constructor(
    public readonly resourceType: string,
    message: string,
    cause?: Error
  ) {
    super(`Failed to convert schema for ${resourceType}: ${message}`, cause, 'SCHEMA_CONVERSION_ERROR');
    this.name = 'SchemaConversionError';
  }
}

/**
 * Schema conversion result
 */
export interface SchemaConversionResult {
  /** Successfully converted schemas */
  schemas: Map<string, FHIRSchema>;

  /** Conversion errors */
  errors: SchemaConversionError[];

  /** Resource types that were processed */
  resourceTypes: string[];
}