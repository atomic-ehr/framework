/**
 * Main exports for @atomic-ehr/fhir-bridge
 */

// Main bridge class
export { FhirBridge } from './bridge.js';

// Types and interfaces
export type {
  FhirBridgeConfig,
  FhirPackage,
  PackageLoadDiagnostic,
  SchemaConversionResult
} from './types.js';

// Error classes
export {
  FhirBridgeError,
  PackageLoadError,
  SchemaConversionError
} from './types.js';

// Re-export useful types from dependencies
export type {
  CanonicalManager,
  Resource,
  PackageId,
  SearchParameter,
  Reference
} from '@atomic-ehr/fhir-canonical-manager';

export type {
  FHIRSchema,
  StructureDefinition
} from '@atomic-ehr/fhirschema';

// Import types and classes for factory function
import { FhirBridge } from './bridge.js';
import type { FhirBridgeConfig } from './types.js';

/**
 * Create a new FHIR bridge with optional configuration
 */
export function createFhirBridge(config?: FhirBridgeConfig): FhirBridge {
  return new FhirBridge(config);
}

/**
 * Default export is the FhirBridge class
 */
export default FhirBridge;