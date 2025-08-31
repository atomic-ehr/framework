// Type definitions for @atomic-fhir/core
// FHIR-native web framework for JavaScript/Bun

/// <reference types="bun" />

import { AtomicModule } from "../core/atomic-module";

// ============================================================================
// Core Server Types
// ============================================================================

/**
 * Main server configuration for Atomic FHIR Server
 */
export interface AtomicConfig {
  server?: ServerConfig;
  modules?: Record<string, AtomicModule>;
  storage?: StorageConfig;
  validation?: ValidationConfig;
  features?: FeaturesConfig;
  autoload?: AutoloadConfig | false;
  packages?: PackagesConfig | PackageDefinition[] | false;
}

export interface ServerConfig {
  name?: string;
  version?: string;
  fhirVersion?: string;
  port?: number;
  url?: string;
}

export interface StorageConfig {
  adapter?: 'sqlite' | 'postgresql' | 'mongodb' | string;
  config?: Record<string, any>;
}

export interface ValidationConfig {
  strict?: boolean;
  profiles?: string[];
}

export interface FeaturesConfig {
  bulkData?: boolean;
  subscription?: boolean;
}

export interface AutoloadConfig {
  enabled?: boolean;
  paths?: {
    resources?: string;
    operations?: string;
    middleware?: string;
    hooks?: string;
    implementationGuides?: string;
  };
}

export interface PackagesConfig {
  enabled?: boolean;
  path?: string;
  list?: (string | PackageDefinition)[];
}

export interface PackageDefinition {
  package: string;
  version?: string;
  npmRegistry?: string;
  remoteUrl?: string;
}

// ============================================================================
// Resource Definition Types
// ============================================================================

/**
 * FHIR interaction capabilities for a resource
 */
export interface ResourceCapabilities {
  // Instance level operations
  read?: boolean;
  vread?: boolean;
  update?: boolean;
  'update-conditional'?: boolean;
  patch?: boolean;
  'patch-conditional'?: boolean;
  delete?: boolean;
  'delete-conditional-single'?: boolean;
  'delete-conditional-multiple'?: boolean;
  'delete-history'?: boolean;
  'delete-history-version'?: boolean;
  'history-instance'?: boolean;
  
  // Type level operations
  'history-type'?: boolean;
  create?: boolean;
  'create-conditional'?: boolean;
  'search-type'?: boolean;
}

/**
 * Custom handler response
 */
export interface HandlerResponse {
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Context passed to handlers and hooks
 */
export interface HandlerContext {
  storage: any; // Will be properly typed when we convert StorageManager
  hooks: any; // Will be properly typed when we convert HooksManager
  validator: any; // Will be properly typed when we convert Validator
  config: AtomicConfig;
  packageManager?: any; // Will be properly typed when we convert PackageManager
}

/**
 * Custom resource handlers
 */
export interface ResourceHandlers {
  create?: (req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  read?: (id: string, req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  vread?: (id: string, versionId: string, req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  update?: (id: string, req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  'update-conditional'?: (req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  patch?: (id: string, req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  'patch-conditional'?: (req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  delete?: (id: string, req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  'delete-conditional'?: (req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  search?: (req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  history?: (id: string, req: Request, context: HandlerContext) => Promise<HandlerResponse>;
  'history-type'?: (req: Request, context: HandlerContext) => Promise<HandlerResponse>;
}

/**
 * Resource lifecycle hooks
 */
export interface ResourceHooks {
  beforeCreate?: (resource: any, context: HandlerContext) => Promise<any>;
  afterCreate?: (resource: any, context: HandlerContext) => Promise<void>;
  beforeUpdate?: (resource: any, previous: any, context: HandlerContext) => Promise<any>;
  afterUpdate?: (resource: any, previous: any, context: HandlerContext) => Promise<void>;
  beforeDelete?: (resource: any, context: HandlerContext) => Promise<void>;
  afterDelete?: (resource: any, context: HandlerContext) => Promise<void>;
  beforeRead?: (id: string, context: HandlerContext) => Promise<void>;
  afterRead?: (resource: any, context: HandlerContext) => Promise<any>;
  beforeSearch?: (params: any, context: HandlerContext) => Promise<any>;
  afterSearch?: (bundle: any, context: HandlerContext) => Promise<any>;
}

/**
 * Search parameter definition
 */
export interface SearchParameter {
  name: string;
  type: 'number' | 'date' | 'string' | 'token' | 'reference' | 'composite' | 'quantity' | 'uri' | 'special';
  path?: string;
  documentation?: string;
}

/**
 * Resource definition
 */
export interface ResourceDefinition {
  resourceType: string;
  structureDefinition?: any;
  capabilities?: ResourceCapabilities;
  handlers?: ResourceHandlers;
  hooks?: ResourceHooks;
  searches?: Record<string, SearchParameter>;
  validators?: Record<string, (resource: any) => Promise<boolean>>;
  middleware?: any[];
}

// ============================================================================
// Operation Definition Types
// ============================================================================

/**
 * Operation parameter definition
 */
export interface OperationParameter {
  name: string;
  use?: 'in' | 'out';
  min: number;
  max: string;
  type?: string;
  documentation?: string;
  searchType?: string;
  profile?: string[];
  targetProfile?: string[];
  part?: OperationParameter[];
}

/**
 * Operation definition
 */
export interface OperationDefinition {
  name: string;
  resource?: string | string[];
  system?: boolean;
  type?: boolean;
  instance?: boolean;
  kind?: 'operation' | 'query';
  status?: 'draft' | 'active' | 'retired' | 'unknown';
  code?: string;
  title?: string;
  description?: string;
  affectsState?: boolean;
  comment?: string;
  parameters?: {
    input?: OperationParameter[];
    output?: OperationParameter[];
  };
  handler: (params: any, context: HandlerContext) => Promise<any>;
}

// ============================================================================
// Hook Definition Types
// ============================================================================

export type HookType = 
  | 'beforeCreate' | 'afterCreate'
  | 'beforeUpdate' | 'afterUpdate'
  | 'beforeDelete' | 'afterDelete'
  | 'beforeRead' | 'afterRead'
  | 'beforeSearch' | 'afterSearch'
  | 'beforeValidate' | 'afterValidate';

/**
 * Hook definition
 */
export interface HookDefinition {
  name: string;
  type: HookType;
  resources: '*' | string | string[];
  priority?: number;
  ignoreErrors?: boolean;
  handler: (...args: any[]) => Promise<any>;
}

// ============================================================================
// Middleware Definition Types
// ============================================================================

/**
 * Middleware definition
 */
export interface MiddlewareDefinition {
  name?: string;
  before?: (req: Request, context: HandlerContext) => Promise<Request | void>;
  after?: (res: Response, context: HandlerContext) => Promise<Response | void>;
}