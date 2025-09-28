/**
 * Main exports for @atomic-ehr/packages
 */

// Main loader class
export { PackageLoader } from './loader.js';

// Cache functionality
export { PackageCache } from './cache.js';
export type { CacheConfig } from './cache.js';

// Types and interfaces
export type {
  PackageLoaderConfig,
  LoadedPackage,
  PackageLoadProgress,
  PackageLoadStats,
  ResourceDiscovery,
  PackageEvent,
  PackageEventListener,
  PackageCacheEntry
} from './types.js';

// Error classes
export {
  PackageLoaderError,
  MultiplePackageLoadError
} from './types.js';

// Re-export useful types from bridge
export type {
  FhirBridge,
  FhirPackage,
  FhirBridgeConfig,
  PackageLoadDiagnostic
} from '@atomic-ehr/fhir-bridge';

// Re-export schema types
export type {
  FHIRSchema
} from '@atomic-ehr/fhirschema';

/**
 * Create a new package loader with configuration
 */
export function createPackageLoader(config: PackageLoaderConfig): PackageLoader {
  return new PackageLoader(config);
}

/**
 * Default export is the PackageLoader class
 */
export default PackageLoader;