/**
 * Utility functions for the server package
 */

import type { FhirServerConfig } from './types.js';

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate server configuration
 */
export function validateConfig(config: FhirServerConfig): void {
  if (!config.port || typeof config.port !== 'number') {
    throw new Error('Server port must be a valid number');
  }

  if (config.port < 1 || config.port > 65535) {
    throw new Error('Server port must be between 1 and 65535');
  }

  if (config.host && typeof config.host !== 'string') {
    throw new Error('Server host must be a string');
  }

  if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 0)) {
    throw new Error('Server timeout must be a positive number');
  }

  if (config.maxBodySize && (typeof config.maxBodySize !== 'number' || config.maxBodySize < 0)) {
    throw new Error('Max body size must be a positive number');
  }

  if (config.cors) {
    validateCorsConfig(config.cors);
  }

  if (config.logging) {
    validateLoggingConfig(config.logging);
  }
}

/**
 * Validate CORS configuration
 */
function validateCorsConfig(cors: NonNullable<FhirServerConfig['cors']>): void {
  if (typeof cors.enabled !== 'boolean') {
    throw new Error('CORS enabled must be a boolean');
  }

  if (cors.origins && !Array.isArray(cors.origins)) {
    throw new Error('CORS origins must be an array of strings');
  }

  if (cors.methods && !Array.isArray(cors.methods)) {
    throw new Error('CORS methods must be an array of strings');
  }

  if (cors.headers && !Array.isArray(cors.headers)) {
    throw new Error('CORS headers must be an array of strings');
  }
}

/**
 * Validate logging configuration
 */
function validateLoggingConfig(logging: NonNullable<FhirServerConfig['logging']>): void {
  const validLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(logging.level)) {
    throw new Error(`Logging level must be one of: ${validLevels.join(', ')}`);
  }

  if (logging.format && !['json', 'text'].includes(logging.format)) {
    throw new Error('Logging format must be either "json" or "text"');
  }
}

/**
 * Merge default configuration with user configuration
 */
export function mergeConfig(userConfig: FhirServerConfig): Required<FhirServerConfig> {
  const defaultConfig: Required<FhirServerConfig> = {
    port: 3000,
    host: 'localhost',
    packages: [],
    hooks: [],
    middleware: [],
    cors: {
      enabled: false,
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
    },
    logging: {
      level: 'info',
      format: 'text'
    },
    timeout: 30000,
    maxBodySize: 10 * 1024 * 1024 // 10MB
  };

  return {
    ...defaultConfig,
    ...userConfig,
    cors: userConfig.cors ? { ...defaultConfig.cors, ...userConfig.cors } : defaultConfig.cors,
    logging: userConfig.logging ? { ...defaultConfig.logging, ...userConfig.logging } : defaultConfig.logging
  };
}

/**
 * Check if a string looks like a valid FHIR resource type
 */
export function isValidResourceType(resourceType: string): boolean {
  // FHIR resource types start with uppercase letter and contain only letters
  return /^[A-Z][a-zA-Z]+$/.test(resourceType);
}

/**
 * Check if a string looks like a valid FHIR ID
 */
export function isValidFhirId(id: string): boolean {
  // FHIR IDs are 1-64 characters, alphanumeric plus hyphens and dots
  return /^[a-zA-Z0-9\-\.]{1,64}$/.test(id);
}

/**
 * Parse FHIR URL path segments
 */
export function parseFhirPath(path: string): {
  resourceType?: string;
  id?: string;
  versionId?: string;
  operation?: string;
  compartment?: string;
} {
  const segments = path.split('/').filter(Boolean);
  const result: ReturnType<typeof parseFhirPath> = {};

  if (segments.length === 0) {
    return result;
  }

  // Check for resource type
  if (isValidResourceType(segments[0])) {
    result.resourceType = segments[0];

    // Check for ID
    if (segments.length > 1 && isValidFhirId(segments[1])) {
      result.id = segments[1];

      // Check for history
      if (segments.length > 2 && segments[2] === '_history') {
        if (segments.length > 3 && isValidFhirId(segments[3])) {
          result.versionId = segments[3];
        }
      }
      // Check for operation
      else if (segments.length > 2 && segments[2].startsWith('$')) {
        result.operation = segments[2];
      }
    }
    // Check for type-level operation
    else if (segments.length > 1 && segments[1].startsWith('$')) {
      result.operation = segments[1];
    }
  }

  return result;
}

/**
 * Create FHIR-compliant timestamp
 */
export function createFhirTimestamp(date?: Date): string {
  return (date || new Date()).toISOString();
}

/**
 * Create FHIR metadata for resources
 */
export function createFhirMeta(options: {
  versionId?: string;
  lastUpdated?: Date;
  profile?: string[];
  security?: any[];
  tag?: any[];
} = {}): any {
  const meta: any = {
    lastUpdated: createFhirTimestamp(options.lastUpdated)
  };

  if (options.versionId) {
    meta.versionId = options.versionId;
  }

  if (options.profile && options.profile.length > 0) {
    meta.profile = options.profile;
  }

  if (options.security && options.security.length > 0) {
    meta.security = options.security;
  }

  if (options.tag && options.tag.length > 0) {
    meta.tag = options.tag;
  }

  return meta;
}

/**
 * Extract query parameters as FHIR search parameters
 */
export function extractSearchParams(query: Record<string, string>): Record<string, string> {
  const searchParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    // Skip special parameters
    if (!['_format', '_pretty', '_summary', '_elements'].includes(key)) {
      searchParams[key] = value;
    }
  }

  return searchParams;
}

/**
 * Check if request accepts JSON
 */
export function acceptsJson(acceptHeader?: string): boolean {
  if (!acceptHeader) return true;

  return acceptHeader.includes('application/json') ||
         acceptHeader.includes('application/fhir+json') ||
         acceptHeader.includes('*/*');
}

/**
 * Get preferred response format from Accept header
 */
export function getPreferredFormat(acceptHeader?: string): 'json' | 'xml' | 'text' {
  if (!acceptHeader) return 'json';

  const header = acceptHeader.toLowerCase();

  if (header.includes('application/fhir+xml') || header.includes('application/xml')) {
    return 'xml';
  }

  if (header.includes('text/plain') || header.includes('text/')) {
    return 'text';
  }

  return 'json'; // Default to JSON
}

/**
 * Sanitize error message for public display
 */
export function sanitizeErrorMessage(error: Error, includeStack = false): string {
  // In production, we might want to hide internal error details
  const message = error.message || 'An unexpected error occurred';

  if (includeStack && error.stack) {
    return `${message}\n\nStack trace:\n${error.stack}`;
  }

  return message;
}

/**
 * Check if error should be reported to external monitoring
 */
export function shouldReportError(error: Error, statusCode: number): boolean {
  // Don't report client errors (4xx) as they're usually user errors
  if (statusCode >= 400 && statusCode < 500) {
    return false;
  }

  // Don't report certain known errors
  const knownErrors = [
    'Request timeout',
    'Request body too large',
    'Invalid JSON in request body'
  ];

  if (knownErrors.includes(error.message)) {
    return false;
  }

  return true;
}

/**
 * Create a safe object for logging (removes sensitive data)
 */
export function createSafeLogObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(createSafeLogObject);
  }

  const safe: any = {};
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'authorization',
    'x-api-key', 'x-auth-token', 'cookie', 'session'
  ];

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      safe[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      safe[key] = createSafeLogObject(value);
    } else {
      safe[key] = value;
    }
  }

  return safe;
}