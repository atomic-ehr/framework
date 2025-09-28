/**
 * Server-specific types for @atomic-ehr/server package
 */

import type { HookDefinition } from '@atomic-ehr/core';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Configuration interface for the FHIR server
 */
export interface FhirServerConfig {
  /** Port number for the server */
  port: number;

  /** Host address (defaults to localhost) */
  host?: string;

  /** FHIR packages to load automatically */
  packages?: string[];

  /** Package loading configuration */
  packageConfig?: {
    cacheDir?: string;
    registryUrls?: string[];
    timeout?: number;
    workingDir?: string;
    registry?: string;
    autoLoadBaseResources?: boolean;
    enableProgressLogging?: boolean;
    failOnPackageLoadError?: boolean;
  };

  /** Pre-configured hooks to register on startup */
  hooks?: HookDefinition[];

  /** Express-style middleware (for future implementation) */
  middleware?: any[];

  /** CORS configuration */
  cors?: {
    enabled: boolean;
    origins?: string[];
    methods?: string[];
    headers?: string[];
  };

  /** Logging configuration */
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'text';
  };

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Maximum request body size in bytes */
  maxBodySize?: number;
}

/**
 * HTTP request context extending base request context from core
 */
export interface HttpRequestContext {
  /** Unique request identifier */
  requestId: string;

  /** Request start timestamp */
  startTime: number;

  /** HTTP method */
  method: string;

  /** Request URL */
  url: string;

  /** Request headers */
  headers: Record<string, string>;

  /** URL parameters (from routing) */
  params: Record<string, string>;

  /** Query string parameters */
  query: Record<string, string>;

  /** Request body (parsed) */
  body?: any;

  /** Raw Node.js request object */
  raw: {
    req: IncomingMessage;
    res: ServerResponse;
  };

  /** FHIR-specific context */
  resourceType?: string;
  operation?: string;
  operationId?: string;

  /** Hook control state */
  _hookState?: {
    stopped: boolean;
    takenOver: boolean;
    skipped: boolean;
    response?: HttpResponseContext;
    diagnostics: any[];
  };
}

/**
 * HTTP response context
 */
export interface HttpResponseContext {
  /** HTTP status code */
  statusCode: number;

  /** Response headers */
  responseHeaders: Record<string, string>;

  /** Response body */
  responseBody?: any;

  /** Response timing information */
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
    hookDuration: number;
  };

  /** Diagnostics collected during processing */
  diagnostics?: any[];
}

/**
 * Error context for error handling hooks
 */
export interface ErrorContext extends HttpRequestContext {
  /** The error that occurred */
  error: Error;

  /** Whether the error has been handled */
  handled: boolean;

  /** Custom error response if provided */
  errorResponse?: HttpResponseContext;
}

/**
 * Server lifecycle events
 */
export type ServerEvent =
  | 'server:starting'
  | 'server:started'
  | 'server:stopping'
  | 'server:stopped'
  | 'request:received'
  | 'request:completed'
  | 'request:error';

/**
 * Server event data
 */
export interface ServerEventData {
  timestamp: number;
  requestId?: string;
  data?: any;
}

/**
 * Handler function type for HTTP requests
 */
export type RequestHandler = (
  context: HttpRequestContext
) => Promise<HttpResponseContext>;

/**
 * Middleware function type (for future implementation)
 */
export type MiddlewareFunction = (
  context: HttpRequestContext,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Server statistics
 */
export interface ServerStats {
  /** Total requests processed */
  totalRequests: number;

  /** Active connections */
  activeConnections: number;

  /** Average response time in ms */
  averageResponseTime: number;

  /** Requests per second */
  requestsPerSecond: number;

  /** Error rate */
  errorRate: number;

  /** Server uptime in ms */
  uptime: number;
}

/**
 * FHIR Operation Outcome for error responses
 */
export interface OperationOutcome {
  resourceType: 'OperationOutcome';
  issue: OperationOutcomeIssue[];
}

export interface OperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  details?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}