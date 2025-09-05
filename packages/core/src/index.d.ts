// Type definitions for @atomic-fhir/core
// FHIR-native web framework for JavaScript/Bun

/// <reference types="bun" />

// ============================================================================
// Core Server Types
// ============================================================================

/**
 * Main server configuration for Atomic FHIR Server
 */
export interface AtomicConfig {
  server?: ServerConfig;
  storage?: StorageConfig;
  validation?: ValidationConfig;
  features?: FeaturesConfig;
  autoload?: AutoloadConfig | false;
  packages?: PackagesConfig | PackageDefinition[] | false;
  middleware?: MiddlewareDefinition[];
  hooks?: HookDefinition[];
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
  storage: StorageManager;
  hooks: HooksManager;
  validator: Validator;
  config: AtomicConfig;
  packageManager?: PackageManager;
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
  handler: (resource: any, context: HandlerContext) => Promise<any>;
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

// ============================================================================
// Main Class Types
// ============================================================================

/**
 * Main Atomic FHIR Server class
 */
export declare class Atomic {
  constructor(config?: AtomicConfig);
  
  config: AtomicConfig;
  router: Router;
  resources: ResourceRegistry;
  operations: OperationRegistry;
  middleware: MiddlewareManager;
  hooks: HooksManager;
  storage: StorageManager;
  validator: Validator;
  capabilityStatement: CapabilityStatement;
  packageManager?: PackageManager;
  
  registerResource(type: string, definition: ResourceDefinition): void;
  registerOperation(definition: OperationDefinition): void;
  registerMiddleware(middleware: MiddlewareDefinition): void;
  registerHook(hook: HookDefinition): void;
  
  autoload(basePath?: string): Promise<void>;
  start(options?: { port?: number; autoload?: boolean; packages?: boolean; basePath?: string }): Promise<any>;
}

// ============================================================================
// Storage Types
// ============================================================================

export declare class StorageManager {
  constructor(config?: StorageConfig);
  
  create(resourceType: string, resource: any): Promise<any>;
  read(resourceType: string, id: string): Promise<any>;
  update(resourceType: string, id: string, resource: any): Promise<any>;
  delete(resourceType: string, id: string): Promise<boolean>;
  search(resourceType: string, params: any): Promise<any>;
  history(resourceType: string, id: string, options?: any): Promise<any>;
  transaction(bundle: any): Promise<any>;
}

export declare abstract class StorageAdapter {
  abstract initialize(): Promise<void>;
  abstract create(resourceType: string, resource: any): Promise<any>;
  abstract read(resourceType: string, id: string): Promise<any>;
  abstract update(resourceType: string, id: string, resource: any): Promise<any>;
  abstract delete(resourceType: string, id: string): Promise<boolean>;
  abstract search(resourceType: string, params: any): Promise<any>;
  abstract history(resourceType: string, id: string, options?: any): Promise<any>;
  abstract transaction(bundle: any): Promise<any>;
}

export declare class SQLiteAdapter extends StorageAdapter {
  constructor(config?: any);
}

// ============================================================================
// Registry Types
// ============================================================================

export declare class ResourceRegistry {
  register(type: string, definition: ResourceDefinition): void;
  get(type: string): ResourceDefinition | undefined;
  getAll(): Map<string, ResourceDefinition>;
  has(type: string): boolean;
}

export declare class OperationRegistry {
  register(definition: OperationDefinition): void;
  get(name: string): OperationDefinition | undefined;
  getAll(): OperationDefinition[];
  getForResource(resourceType: string): OperationDefinition[];
}

export declare class MiddlewareManager {
  register(middleware: MiddlewareDefinition): void;
  executeBefore(req: Request, context: HandlerContext): Promise<Request>;
  executeAfter(res: Response, context: HandlerContext): Promise<Response>;
}

export declare class HooksManager {
  register(hook: HookDefinition): void;
  executeBeforeCreate(resourceType: string, resource: any, context: HandlerContext): Promise<any>;
  executeAfterCreate(resourceType: string, resource: any, context: HandlerContext): Promise<void>;
  executeBeforeUpdate(resourceType: string, resource: any, previous: any, context: HandlerContext): Promise<any>;
  executeAfterUpdate(resourceType: string, resource: any, previous: any, context: HandlerContext): Promise<void>;
  executeBeforeDelete(resourceType: string, resource: any, context: HandlerContext): Promise<void>;
  executeAfterDelete(resourceType: string, resource: any, context: HandlerContext): Promise<void>;
}

// ============================================================================
// Other Core Types
// ============================================================================

export declare class Router {
  constructor();
  handle(req: Request, app: Atomic): Promise<Response>;
}

export declare class Validator {
  constructor(config?: ValidationConfig);
  validate(resource: any, profile?: string): Promise<{ valid: boolean; errors?: any[] }>;
}

export declare class CapabilityStatement {
  constructor(app: Atomic);
  generate(): Promise<any>;
}

export declare class PackageManager {
  constructor(packagesPath?: string, config?: PackagesConfig);
  
  loaded: boolean;
  
  loadPackages(): Promise<void>;
  downloadPackages(packageList: (string | PackageDefinition)[]): Promise<void>;
  getProfilesForResource(resourceType: string): string[];
  getProfile(url: string): any;
  getValueSet(url: string): any;
  getCodeSystem(url: string): any;
  getOperation(url: string): any;
  getSearchParameter(url: string): any;
  getBaseResourceDefinitions(): Map<string, any>;
}

export declare class FilesystemLoader {
  constructor(basePath: string, paths?: AutoloadConfig['paths']);
  
  loadAll(): Promise<{
    resources: Map<string, ResourceDefinition>;
    operations: OperationDefinition[];
    middleware: MiddlewareDefinition[];
    hooks: HookDefinition[];
    implementationGuides: any[];
  }>;
  loadResources(dirPath?: string): Promise<Map<string, ResourceDefinition>>;
  loadOperations(dirPath?: string): Promise<OperationDefinition[]>;
  loadMiddleware(dirPath?: string): Promise<MiddlewareDefinition[]>;
  loadHooks(dirPath?: string): Promise<HookDefinition[]>;
}

export declare class ValidationError extends Error {
  constructor(message: string, errors?: any[]);
  errors?: any[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Define a FHIR resource with full TypeScript support
 */
export declare function defineResource(definition: ResourceDefinition): ResourceDefinition;

/**
 * Define a FHIR operation with full TypeScript support
 */
export declare function defineOperation(definition: OperationDefinition): OperationDefinition;

/**
 * Define middleware with full TypeScript support
 */
export declare function defineMiddleware(definition: MiddlewareDefinition): MiddlewareDefinition;

/**
 * Define a hook with full TypeScript support
 */
export declare function defineHook(definition: HookDefinition): HookDefinition;

// Default export
export default Atomic;