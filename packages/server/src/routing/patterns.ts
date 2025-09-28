/**
 * URL pattern matching utilities for FHIR routing
 */

import type {
  FhirOperationLevel,
  ParsedFhirUrl,
  CompiledPattern,
  RouteMatchOptions
} from './types.js';

import {
  FhirUrlPattern,
  FhirOperation
} from './types.js';

/**
 * Compile a URL pattern into a regex with parameter extraction
 */
export function compilePattern(
  pattern: string,
  options: RouteMatchOptions = {}
): CompiledPattern {
  const {
    caseSensitive = false,
    strict = false,
    end = true
  } = options;

  const paramNames: string[] = [];
  let hasWildcards = false;

  // Escape special regex characters except our parameter syntax
  let regexPattern = pattern
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\$\\\*/g, '$*'); // Keep our $* syntax

  // Handle parameter patterns: :paramName
  regexPattern = regexPattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, paramName) => {
    paramNames.push(paramName);
    return '([^/]+)';
  });

  // Handle wildcard patterns: *
  regexPattern = regexPattern.replace(/\*/g, () => {
    hasWildcards = true;
    return '.*';
  });

  // Handle optional trailing slash
  if (!strict) {
    regexPattern = regexPattern.replace(/\/$/, '/?');
  }

  // Anchor pattern if end matching is required
  if (end) {
    regexPattern = `^${regexPattern}$`;
  } else {
    regexPattern = `^${regexPattern}`;
  }

  const flags = caseSensitive ? '' : 'i';
  const regex = new RegExp(regexPattern, flags);

  return {
    regex,
    paramNames,
    pattern,
    hasWildcards
  };
}

/**
 * Match a URL against a compiled pattern
 */
export function matchPattern(
  compiledPattern: CompiledPattern,
  url: string
): Record<string, string> | null {
  const match = compiledPattern.regex.exec(url);
  if (!match) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < compiledPattern.paramNames.length; i++) {
    const paramName = compiledPattern.paramNames[i];
    const paramValue = match[i + 1];
    if (paramValue !== undefined) {
      params[paramName] = decodeURIComponent(paramValue);
    }
  }

  return params;
}

/**
 * Parse a FHIR URL and extract operation information
 */
export function parseFhirUrl(method: string, url: string): ParsedFhirUrl {
  // Remove query parameters for path analysis
  const [path, queryString] = url.split('?');
  const cleanPath = path.replace(/\/$/, '') || '/'; // Remove trailing slash

  // Parse query parameters
  const searchParams: Record<string, string> = {};
  if (queryString) {
    const urlParams = new URLSearchParams(queryString);
    for (const [key, value] of urlParams.entries()) {
      searchParams[key] = value;
    }
  }

  // Analyze path segments
  const segments = cleanPath.split('/').filter(Boolean);

  // System level operations
  if (segments.length === 0 || cleanPath === '/') {
    return determineSystemOperation(method, searchParams, path);
  }

  // Special system endpoints
  if (segments[0] === 'metadata') {
    return {
      operation: FhirOperation.CAPABILITIES,
      level: 'system',
      path,
      method,
      searchParams
    };
  }

  if (segments[0] === '_history') {
    return {
      operation: FhirOperation.HISTORY_SYSTEM,
      level: 'system',
      path,
      method,
      searchParams
    };
  }

  // System level operations: /$operation
  if (segments[0].startsWith('$')) {
    return {
      operation: FhirOperation.OPERATION,
      level: 'system',
      operationName: segments[0].substring(1),
      path,
      method,
      searchParams
    };
  }

  // Must start with resource type
  const resourceType = segments[0];
  if (!isValidResourceType(resourceType)) {
    throw new Error(`Invalid resource type: ${resourceType}`);
  }

  // Type level operations
  if (segments.length === 1) {
    return determineTypeOperation(method, resourceType, searchParams, path);
  }

  // Type level with _history or $operation
  if (segments.length === 2) {
    if (segments[1] === '_history') {
      return {
        operation: FhirOperation.HISTORY_TYPE,
        level: 'type',
        resourceType,
        path,
        method,
        searchParams
      };
    }

    if (segments[1].startsWith('$')) {
      return {
        operation: FhirOperation.OPERATION,
        level: 'type',
        resourceType,
        operationName: segments[1].substring(1),
        path,
        method,
        searchParams
      };
    }

    // Instance level operations
    const id = segments[1];
    return determineInstanceOperation(method, resourceType, id, [], searchParams, path);
  }

  // Instance level with additional segments
  if (segments.length >= 3) {
    const id = segments[1];
    const remainingSegments = segments.slice(2);

    return determineInstanceOperation(method, resourceType, id, remainingSegments, searchParams, path);
  }

  throw new Error(`Unable to parse FHIR URL: ${url}`);
}

/**
 * Determine system level operation
 */
function determineSystemOperation(
  method: string,
  searchParams: Record<string, string>,
  path: string
): ParsedFhirUrl {
  switch (method.toUpperCase()) {
    case 'GET':
      return {
        operation: FhirOperation.SEARCH_SYSTEM,
        level: 'system',
        path,
        method,
        searchParams
      };

    case 'POST':
      // Check if it's a batch or transaction
      return {
        operation: FhirOperation.BATCH, // Could also be TRANSACTION based on Bundle.type
        level: 'system',
        path,
        method,
        searchParams
      };

    default:
      throw new Error(`Unsupported method for system level: ${method}`);
  }
}

/**
 * Determine type level operation
 */
function determineTypeOperation(
  method: string,
  resourceType: string,
  searchParams: Record<string, string>,
  path: string
): ParsedFhirUrl {
  switch (method.toUpperCase()) {
    case 'GET':
      return {
        operation: FhirOperation.SEARCH_TYPE,
        level: 'type',
        resourceType,
        path,
        method,
        searchParams
      };

    case 'POST':
      return {
        operation: FhirOperation.CREATE,
        level: 'type',
        resourceType,
        path,
        method,
        searchParams
      };

    default:
      throw new Error(`Unsupported method for type level: ${method}`);
  }
}

/**
 * Determine instance level operation
 */
function determineInstanceOperation(
  method: string,
  resourceType: string,
  id: string,
  remainingSegments: string[],
  searchParams: Record<string, string>,
  path: string
): ParsedFhirUrl {
  // Handle _history operations
  if (remainingSegments.length > 0 && remainingSegments[0] === '_history') {
    if (remainingSegments.length === 1) {
      return {
        operation: FhirOperation.HISTORY_INSTANCE,
        level: 'instance',
        resourceType,
        id,
        path,
        method,
        searchParams
      };
    }

    if (remainingSegments.length === 2) {
      return {
        operation: FhirOperation.VREAD,
        level: 'instance',
        resourceType,
        id,
        vid: remainingSegments[1],
        path,
        method,
        searchParams
      };
    }
  }

  // Handle $operations
  if (remainingSegments.length === 1 && remainingSegments[0].startsWith('$')) {
    return {
      operation: FhirOperation.OPERATION,
      level: 'instance',
      resourceType,
      id,
      operationName: remainingSegments[0].substring(1),
      path,
      method,
      searchParams
    };
  }

  // Standard instance operations
  if (remainingSegments.length === 0) {
    switch (method.toUpperCase()) {
      case 'GET':
        return {
          operation: FhirOperation.READ,
          level: 'instance',
          resourceType,
          id,
          path,
          method,
          searchParams
        };

      case 'PUT':
        return {
          operation: FhirOperation.UPDATE,
          level: 'instance',
          resourceType,
          id,
          path,
          method,
          searchParams
        };

      case 'PATCH':
        return {
          operation: FhirOperation.PATCH,
          level: 'instance',
          resourceType,
          id,
          path,
          method,
          searchParams
        };

      case 'DELETE':
        return {
          operation: FhirOperation.DELETE,
          level: 'instance',
          resourceType,
          id,
          path,
          method,
          searchParams
        };

      default:
        throw new Error(`Unsupported method for instance level: ${method}`);
    }
  }

  throw new Error(`Unable to parse instance URL with segments: ${remainingSegments.join('/')}`);
}

/**
 * Check if a string is a valid FHIR resource type
 */
export function isValidResourceType(resourceType: string): boolean {
  // FHIR resource types start with uppercase letter and contain only letters
  return /^[A-Z][a-zA-Z]+$/.test(resourceType);
}

/**
 * Check if a string is a valid FHIR ID
 */
export function isValidFhirId(id: string): boolean {
  // FHIR IDs are 1-64 characters, alphanumeric plus hyphens and dots
  return /^[a-zA-Z0-9\-\.]{1,64}$/.test(id);
}

/**
 * Normalize URL path for consistent matching
 */
export function normalizePath(path: string): string {
  // Remove trailing slash unless it's the root
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  // Ensure leading slash
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  // Decode URI components
  try {
    path = decodeURIComponent(path);
  } catch {
    // If decoding fails, use original path
  }

  return path;
}

/**
 * Extract query parameters from URL
 */
export function extractQueryParams(url: string): Record<string, string> {
  const [, queryString] = url.split('?');
  const params: Record<string, string> = {};

  if (queryString) {
    const urlParams = new URLSearchParams(queryString);
    for (const [key, value] of urlParams.entries()) {
      params[key] = value;
    }
  }

  return params;
}

/**
 * Build URL from pattern and parameters
 */
export function buildUrl(pattern: string, params: Record<string, string>): string {
  let url = pattern;

  // Replace parameters
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`:${key}`, encodeURIComponent(value));
  }

  return url;
}

/**
 * Get operation level from pattern
 */
export function getOperationLevel(pattern: FhirUrlPattern): FhirOperationLevel {
  switch (pattern) {
    case FhirUrlPattern.SEARCH_SYSTEM:
    case FhirUrlPattern.BATCH:
    case FhirUrlPattern.TRANSACTION:
    case FhirUrlPattern.HISTORY_SYSTEM:
    case FhirUrlPattern.CAPABILITIES:
    case FhirUrlPattern.SYSTEM_OPERATION:
      return 'system';

    case FhirUrlPattern.CREATE:
    case FhirUrlPattern.SEARCH_TYPE:
    case FhirUrlPattern.HISTORY_TYPE:
    case FhirUrlPattern.TYPE_OPERATION:
      return 'type';

    case FhirUrlPattern.READ:
    case FhirUrlPattern.VREAD:
    case FhirUrlPattern.UPDATE:
    case FhirUrlPattern.PATCH:
    case FhirUrlPattern.DELETE:
    case FhirUrlPattern.HISTORY_INSTANCE:
    case FhirUrlPattern.INSTANCE_OPERATION:
      return 'instance';

    default:
      throw new Error(`Unknown pattern: ${pattern}`);
  }
}