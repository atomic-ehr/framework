/**
 * Routing-specific types for FHIR URL handling
 */

import type { HttpRequestContext, HttpResponseContext } from '../types.js';

/**
 * FHIR URL patterns according to the FHIR HTTP specification
 */
export enum FhirUrlPattern {
  // Instance level: [base]/[type]/[id]
  READ = '/:resourceType/:id',
  VREAD = '/:resourceType/:id/_history/:vid',
  UPDATE = '/:resourceType/:id',
  PATCH = '/:resourceType/:id',
  DELETE = '/:resourceType/:id',
  HISTORY_INSTANCE = '/:resourceType/:id/_history',

  // Type level: [base]/[type]
  CREATE = '/:resourceType',
  SEARCH_TYPE = '/:resourceType',
  HISTORY_TYPE = '/:resourceType/_history',

  // Type level operations: [base]/[type]/$[operation]
  TYPE_OPERATION = '/:resourceType/$:operation',

  // Instance level operations: [base]/[type]/[id]/$[operation]
  INSTANCE_OPERATION = '/:resourceType/:id/$:operation',

  // System level: [base]
  SEARCH_SYSTEM = '/',
  BATCH = '/',
  TRANSACTION = '/',
  HISTORY_SYSTEM = '/_history',
  CAPABILITIES = '/metadata',

  // System level operations: [base]/$[operation]
  SYSTEM_OPERATION = '/$:operation'
}

/**
 * FHIR operations corresponding to HTTP interactions
 */
export enum FhirOperation {
  READ = 'read',
  VREAD = 'vread',
  UPDATE = 'update',
  PATCH = 'patch',
  CREATE = 'create',
  DELETE = 'delete',
  SEARCH_TYPE = 'search-type',
  SEARCH_SYSTEM = 'search-system',
  HISTORY_INSTANCE = 'history-instance',
  HISTORY_TYPE = 'history-type',
  HISTORY_SYSTEM = 'history-system',
  CAPABILITIES = 'capabilities',
  BATCH = 'batch',
  TRANSACTION = 'transaction',
  OPERATION = 'operation'
}

/**
 * FHIR operation levels
 */
export type FhirOperationLevel = 'system' | 'type' | 'instance';

/**
 * FHIR operation handler function type
 */
export type FhirOperationHandler = (context: HttpRequestContext) => Promise<HttpResponseContext>;

/**
 * FHIR route definition
 */
export interface FhirRoute {
  /** HTTP method */
  method: string;

  /** URL pattern to match */
  pattern: FhirUrlPattern;

  /** FHIR operation type */
  operation: FhirOperation;

  /** Operation level (system, type, or instance) */
  level: FhirOperationLevel;

  /** Handler function for this route */
  handler: FhirOperationHandler;

  /** Optional middleware (for future use) */
  middleware?: any[];

  /** Route priority (higher = earlier matching) */
  priority?: number;

  /** Route description */
  description?: string;
}

/**
 * Result of matching a route
 */
export interface FhirRouteMatch {
  /** The matched route */
  route: FhirRoute;

  /** Extracted URL parameters */
  params: Record<string, string>;

  /** The FHIR operation */
  operation: FhirOperation;

  /** Operation level */
  level: FhirOperationLevel;

  /** Resource type (if applicable) */
  resourceType?: string;

  /** Resource ID (if applicable) */
  id?: string;

  /** Version ID (if applicable) */
  vid?: string;

  /** Operation name (if applicable) */
  operationName?: string;

  /** Query parameters */
  query?: Record<string, string>;
}

/**
 * Parsed FHIR URL information
 */
export interface ParsedFhirUrl {
  /** The FHIR operation */
  operation: FhirOperation;

  /** Operation level */
  level: FhirOperationLevel;

  /** Resource type (if applicable) */
  resourceType?: string;

  /** Resource ID (if applicable) */
  id?: string;

  /** Version ID (if applicable) */
  vid?: string;

  /** Operation name (if applicable) */
  operationName?: string;

  /** Search/query parameters */
  searchParams?: Record<string, string>;

  /** Original URL path */
  path: string;

  /** HTTP method */
  method: string;
}

/**
 * Route pattern compilation result
 */
export interface CompiledPattern {
  /** Regular expression for matching */
  regex: RegExp;

  /** Parameter names in order */
  paramNames: string[];

  /** Original pattern string */
  pattern: string;

  /** Whether pattern has wildcards */
  hasWildcards: boolean;
}

/**
 * Route matching options
 */
export interface RouteMatchOptions {
  /** Case sensitive matching */
  caseSensitive?: boolean;

  /** Strict matching (no trailing slash tolerance) */
  strict?: boolean;

  /** End matching (pattern must match to end of URL) */
  end?: boolean;
}

/**
 * FHIR error for routing issues
 */
export class FhirRoutingError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly severity: 'fatal' | 'error' | 'warning' | 'information';

  constructor(
    statusCode: number,
    code: string,
    message: string,
    severity: 'fatal' | 'error' | 'warning' | 'information' = 'error'
  ) {
    super(message);
    this.name = 'FhirRoutingError';
    this.statusCode = statusCode;
    this.code = code;
    this.severity = severity;
  }

  /**
   * Convert to FHIR OperationOutcome
   */
  toOperationOutcome(): any {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: this.severity,
        code: this.code,
        diagnostics: this.message
      }]
    };
  }
}

/**
 * Route building helper interface
 */
export interface RouteBuilder {
  method(method: string): RouteBuilder;
  pattern(pattern: FhirUrlPattern): RouteBuilder;
  operation(operation: FhirOperation): RouteBuilder;
  level(level: FhirOperationLevel): RouteBuilder;
  handler(handler: FhirOperationHandler): RouteBuilder;
  priority(priority: number): RouteBuilder;
  description(description: string): RouteBuilder;
  build(): FhirRoute;
}

/**
 * Router statistics
 */
export interface RouterStats {
  /** Total number of registered routes */
  totalRoutes: number;

  /** Routes by method */
  routesByMethod: Record<string, number>;

  /** Routes by operation */
  routesByOperation: Record<string, number>;

  /** Total route matches attempted */
  totalMatches: number;

  /** Successful route matches */
  successfulMatches: number;

  /** Failed route matches */
  failedMatches: number;

  /** Average match time in milliseconds */
  averageMatchTime: number;

  /** Most frequently matched routes */
  popularRoutes: Array<{
    route: string;
    count: number;
  }>;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  /** Case sensitive route matching */
  caseSensitive?: boolean;

  /** Strict route matching */
  strict?: boolean;

  /** Enable route statistics collection */
  enableStats?: boolean;

  /** Maximum number of routes to allow */
  maxRoutes?: number;

  /** Default route priority */
  defaultPriority?: number;
}