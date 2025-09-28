/**
 * Main exports for @atomic-ehr/server package
 * HTTP server functionality with FHIR hooks integration
 */

// Main server class
export { FhirServer } from './server.js';

// Import types for internal use
import type { FhirServerConfig } from './types.js';
import { FhirServer } from './server.js';

// Context management
export { ContextManager } from './context.js';

// Response handling
export { ResponseHandler } from './response.js';

// FHIR routing system
export * from './routing/index.js';

// Package integration
export { PackageIntegration, createPackageIntegration } from './integration/packages.js';
export type {
  ExtendedRequestContext,
  ExtendedResponseContext,
  PackageHookContext
} from './integration/context.js';
export { ContextUtils, ExtendedContextFactory } from './integration/context.js';

// Type definitions
export type {
  FhirServerConfig,
  HttpRequestContext,
  HttpResponseContext,
  ErrorContext,
  ServerEvent,
  ServerEventData,
  RequestHandler,
  MiddlewareFunction,
  ServerStats,
  OperationOutcome,
  OperationOutcomeIssue
} from './types.js';

// Utility functions
export {
  generateRequestId,
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
} from './utils.js';

// Re-export hooks functionality from core
export {
  HooksManager,
  HookRegistry,
  HookExecutor,
  defineHook,
  HookUtils,
  defaultHooksManager,
  registerHook,
  unregisterHook,
  executeHooks,
  ContextFactory,
  generateRequestId as coreGenerateRequestId
} from '@atomic-ehr/core';

// Re-export core types that are commonly used with server
export type {
  HookDefinition,
  HookPhase,
  HookFilters,
  HookExecutionResult,
  HookContext,
  NextFunction,
  Diagnostic,
  AppContext,
  RequestContext,
  ResponseContext,
  BaseContext
} from '@atomic-ehr/core';

// Re-export bridge and package types
export type {
  FhirBridge,
  FhirPackage,
  FhirBridgeConfig,
  PackageLoadDiagnostic
} from '@atomic-ehr/fhir-bridge';

export type {
  PackageLoader,
  LoadedPackage,
  PackageLoaderConfig,
  PackageLoadStats,
  ResourceDiscovery
} from '@atomic-ehr/packages';

export type {
  FHIRSchema
} from '@atomic-ehr/fhirschema';

/**
 * Create a new FHIR server with default configuration
 */
export function createFhirServer(config: FhirServerConfig): FhirServer {
  return new FhirServer(config);
}

/**
 * Default export is the FhirServer class
 */
export default FhirServer;