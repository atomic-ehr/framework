/**
 * Type definitions for Package Loader
 */

import type { FhirBridge, FhirPackage } from '@atomic-ehr/fhir-bridge';
import type { FHIRSchema, StructureDefinition } from '@atomic-ehr/fhirschema';
import type { SearchParameter } from '@atomic-ehr/fhir-canonical-manager';

/**
 * Configuration for PackageLoader
 */
export interface PackageLoaderConfig {
  /** Array of packages to load (name@version format) */
  packages: string[];

  /** Optional FhirBridge instance to use */
  bridge?: FhirBridge;

  /** Automatically load base FHIR resources */
  autoLoadBaseResources?: boolean;

  /** Bridge configuration if creating new bridge */
  bridgeConfig?: {
    packageCacheDir?: string;
    registryUrls?: string[];
    timeout?: number;
    workingDir?: string;
    registry?: string;
  };
}

/**
 * Information about a loaded package
 */
export interface LoadedPackage {
  /** Package name */
  name: string;

  /** Package version */
  version: string;

  /** Raw FHIR package data */
  package: FhirPackage;

  /** Converted schemas */
  schemas: Map<string, FHIRSchema>;

  /** Resources indexed by canonical URL */
  resources: Record<string, FHIRSchema>;

  /** Resource types available in this package */
  resourceTypes: string[];

  /** Structure definitions */
  structureDefinitions: StructureDefinition[];

  /** Search parameters */
  searchParameters: SearchParameter[];

  /** Load time in milliseconds */
  loadTime: number;

  /** Load timestamp */
  loadedAt: Date;
}

/**
 * Package loading progress information
 */
export interface PackageLoadProgress {
  /** Current package being loaded */
  currentPackage: string;

  /** Current step in loading process */
  currentStep: string;

  /** Progress percentage (0-100) */
  progress: number;

  /** Completed packages */
  completedPackages: string[];

  /** Failed packages */
  failedPackages: Array<{
    name: string;
    error: string;
  }>;

  /** Total packages to load */
  totalPackages: number;
}

/**
 * Package loading statistics
 */
export interface PackageLoadStats {
  /** Total packages loaded */
  totalPackages: number;

  /** Total resource types available */
  totalResourceTypes: number;

  /** Total schemas converted */
  totalSchemas: number;

  /** Total structure definitions */
  totalStructureDefinitions: number;

  /** Total search parameters */
  totalSearchParameters: number;

  /** Total load time in milliseconds */
  totalLoadTime: number;

  /** Package breakdown */
  packageBreakdown: Array<{
    name: string;
    version: string;
    resourceTypes: number;
    schemas: number;
    loadTime: number;
  }>;
}

/**
 * Resource discovery result
 */
export interface ResourceDiscovery {
  /** All available resource types */
  resourceTypes: string[];

  /** Resource types by package */
  resourceTypesByPackage: Map<string, string[]>;

  /** Supported operations by resource type */
  operationsByResourceType: Map<string, string[]>;

  /** Search parameters by resource type */
  searchParametersByResourceType: Map<string, SearchParameter[]>;

  /** Base profiles (core FHIR definitions) */
  baseProfiles: string[];

  /** Constraint profiles (implementation guides) */
  constraintProfiles: string[];
}

/**
 * Package loader error types
 */
export class PackageLoaderError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'PackageLoaderError';
  }
}

export class MultiplePackageLoadError extends PackageLoaderError {
  constructor(
    public readonly failedPackages: Array<{
      name: string;
      error: string;
    }>,
    public readonly successfulPackages: string[]
  ) {
    const message = `Failed to load ${failedPackages.length} packages: ${failedPackages.map(p => p.name).join(', ')}`;
    super(message, 'MULTIPLE_PACKAGE_LOAD_ERROR');
    this.name = 'MultiplePackageLoadError';
  }
}

/**
 * Package event types
 */
export type PackageEvent =
  | { type: 'loadStart'; packageName: string }
  | { type: 'loadProgress'; packageName: string; progress: number }
  | { type: 'loadComplete'; packageName: string; loadTime: number }
  | { type: 'loadError'; packageName: string; error: string }
  | { type: 'allComplete'; stats: PackageLoadStats }
  | { type: 'allError'; errors: Array<{ name: string; error: string }> };

/**
 * Package event listener
 */
export type PackageEventListener = (event: PackageEvent) => void;

/**
 * Package cache entry
 */
export interface PackageCacheEntry {
  /** Package identifier */
  packageId: string;

  /** Cached package data */
  package: LoadedPackage;

  /** Cache timestamp */
  cachedAt: Date;

  /** Cache expiry */
  expiresAt?: Date;

  /** Cache metadata */
  metadata: {
    cacheVersion: string;
    packageVersion: string;
    checksum?: string;
  };
}