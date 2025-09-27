# ADR-0004: Static/Dynamic Routing and Override System

## Status
Proposed

## Context
The routing system must support both static platform routes (health, metadata, capability statements) and dynamic routes sourced from FHIR packages discovered via the canonical manager. The system requires deterministic merge strategies with per-route override capabilities, allowing applications to replace or specialize operations while maintaining consistent behavior.

## Decision

### Dual Router Architecture
```typescript
interface RoutingSystem {
  staticRouter: StaticRouter;
  dynamicRouter: DynamicRouter;
  overrideManager: OverrideManager;
  routeResolver: RouteResolver;
}

// Static router for platform/core/system routes
interface StaticRouter {
  routes: Map<string, StaticRoute>;

  register(route: StaticRoute): void;
  unregister(routeId: string): void;
  match(method: string, path: string): StaticRoute | null;

  // Platform routes are always present
  getHealthRoute(): StaticRoute;
  getMetadataRoute(): StaticRoute;
  getCapabilityRoute(): StaticRoute;
}

// Dynamic router for FHIR package-sourced routes
interface DynamicRouter {
  routes: Map<string, DynamicRoute>;
  packageSources: Map<string, PackageRouteSource>;

  register(route: DynamicRoute, source: PackageRouteSource): void;
  unregister(routeId: string): void;
  reload(packageId: string): Promise<void>;
  match(method: string, path: string): DynamicRoute | null;

  // Discovery integration
  discoverRoutes(packages: CanonicalPackage[]): Promise<DynamicRoute[]>;
}
```

### Route Definitions
```typescript
// Base route interface
interface BaseRoute {
  id: string;
  method: HttpMethod;
  path: string; // Path pattern with parameters
  tags: string[];
  metadata: RouteMetadata;
}

// Static routes - platform/core functionality
interface StaticRoute extends BaseRoute {
  type: 'static';
  handler: RouteHandler;
  hooks: HookDefinition[];
  schema?: RouteSchema;
  config: StaticRouteConfig;
}

// Dynamic routes - FHIR package sourced
interface DynamicRoute extends BaseRoute {
  type: 'dynamic';
  resourceType: string;
  operation: FhirOperation;
  profiles: string[]; // Supported profiles
  source: PackageRouteSource;
  capabilities: OperationCapabilities;
  handlers: DynamicRouteHandlers;
  constraints: RouteConstraints;
}

interface RouteMetadata {
  description?: string;
  summary?: string;
  tags: string[];
  deprecated?: boolean;
  version: string;
  documentation?: string;
}

interface StaticRouteConfig {
  cached: boolean;
  timeout: number;
  rateLimit?: RateLimitConfig;
  auth?: AuthConfig;
}

interface DynamicRouteHandlers {
  default: RouteHandler; // Generated from FHIR spec
  custom?: RouteHandler; // App-provided override
  hooks: HookBundle[]; // Package-provided hooks
}
```

### FHIR Package Route Discovery
```typescript
interface PackageRouteSource {
  packageId: string;
  version: string;
  namespace: string;
  canonicalUrl: string;

  // Source metadata
  structureDefinitions: StructureDefinition[];
  capabilityStatements: CapabilityStatement[];
  operationDefinitions: OperationDefinition[];
  searchParameters: SearchParameter[];
}

interface RouteDiscoveryEngine {
  // Primary discovery method
  discoverRoutes(packages: CanonicalPackage[]): Promise<DiscoveredRoutes>;

  // Specific discovery methods
  discoverResourceRoutes(structureDef: StructureDefinition): DynamicRoute[];
  discoverOperationRoutes(operationDef: OperationDefinition): DynamicRoute[];
  discoverSearchRoutes(searchParams: SearchParameter[]): DynamicRoute[];

  // Route generation
  generateCrudRoutes(resourceType: string, capabilities: ResourceCapabilities): DynamicRoute[];
  generateOperationRoute(operation: OperationDefinition): DynamicRoute;
}

interface DiscoveredRoutes {
  routes: DynamicRoute[];
  conflicts: RouteConflict[];
  warnings: RouteWarning[];
  statistics: DiscoveryStatistics;
}

// FHIR operation types
type FhirOperation =
  | 'create'      // POST /{type}
  | 'read'        // GET /{type}/{id}
  | 'vread'       // GET /{type}/{id}/_history/{vid}
  | 'update'      // PUT /{type}/{id}
  | 'patch'       // PATCH /{type}/{id}
  | 'delete'      // DELETE /{type}/{id}
  | 'history'     // GET /{type}/{id}/_history
  | 'search'      // GET /{type}?...
  | 'batch'       // POST / (Bundle)
  | 'transaction' // POST / (Bundle)
  | 'operation'   // POST /{type}/${operation}
  | 'capability'; // GET /metadata

interface OperationCapabilities {
  interactions: FhirInteraction[];
  searchParams: SearchParameterInfo[];
  profiles: string[];
  conditionalOps: ConditionalOperation[];
  versioning: VersioningSupport;
}

interface FhirInteraction {
  code: string; // 'read', 'create', etc.
  documentation?: string;
}
```

### Route Override System
```typescript
interface OverrideManager {
  overrides: Map<string, RouteOverride>;

  // Override registration
  addOverride(override: RouteOverride): void;
  removeOverride(routeId: string): void;

  // Override resolution
  resolveOverrides(route: BaseRoute): ResolvedRoute;

  // Conflict detection
  detectConflicts(): OverrideConflict[];
  validateOverrides(): OverrideValidationResult;
}

interface RouteOverride {
  // Route identification
  method: HttpMethod;
  path: string;
  resourceType?: string;
  profiles?: string[]; // Profile-specific overrides

  // Override scope
  scope: OverrideScope;

  // Override type
  type: OverrideType;

  // Override data
  handler?: RouteHandler;
  hooks?: HookOverride[];
  schema?: RouteSchema;
  config?: Partial<RouteConfig>;

  // Metadata
  priority: number;
  reason: string;
  source: string; // App, plugin, etc.
}

type OverrideScope = 'route' | 'handler' | 'hooks' | 'schema' | 'config';
type OverrideType = 'replace' | 'extend' | 'modify' | 'disable';

interface HookOverride {
  phase: HookPhase;
  action: 'replace' | 'add' | 'remove' | 'modify';
  hook?: HookDefinition;
  priority?: number;
}

// Override precedence rules (highest to lowest)
enum OverridePrecedence {
  APP_EXPLICIT = 1000,     // App explicitly overrides
  PLUGIN_HIGH = 900,       // High-priority plugin
  PROFILE_SPECIFIC = 800,  // Profile-specific override
  PLUGIN_NORMAL = 700,     // Normal plugin priority
  PACKAGE_BUNDLE = 600,    // Package-provided bundle
  DYNAMIC_DEFAULT = 500,   // Default dynamic route
  STATIC_DEFAULT = 400     // Static platform route
}
```

### Route Resolution and Activation
```typescript
interface RouteResolver {
  // Main resolution method
  resolve(
    staticRoutes: StaticRoute[],
    dynamicRoutes: DynamicRoute[],
    overrides: RouteOverride[]
  ): ResolvedRoutingTable;

  // Conflict resolution
  resolveConflicts(conflicts: RouteConflict[]): ConflictResolution[];

  // Route activation
  activateRoutes(table: ResolvedRoutingTable): ActivatedRoutingTable;
}

interface ResolvedRoutingTable {
  routes: Map<string, ResolvedRoute>;
  conflicts: RouteConflict[];
  warnings: RouteWarning[];
  metadata: ResolutionMetadata;
}

interface ResolvedRoute {
  // Original route
  original: BaseRoute;

  // Final resolved properties
  handler: RouteHandler;
  hooks: HookDefinition[];
  schema: RouteSchema;
  config: RouteConfig;

  // Resolution metadata
  overrides: RouteOverride[];
  precedence: OverridePrecedence;
  source: RouteSource;
  conflicts: RouteConflict[];
}

interface RouteConflict {
  type: ConflictType;
  routes: BaseRoute[];
  severity: 'error' | 'warning' | 'info';
  resolution?: ConflictResolution;
  message: string;
}

type ConflictType =
  | 'path_collision'      // Same method + path
  | 'handler_conflict'    // Multiple handlers for same route
  | 'hook_conflict'       // Conflicting hooks
  | 'schema_mismatch'     // Incompatible schemas
  | 'profile_ambiguity';  // Ambiguous profile selection

interface ConflictResolution {
  strategy: ResolutionStrategy;
  selectedRoute: BaseRoute;
  reason: string;
  action: ResolutionAction;
}

type ResolutionStrategy =
  | 'precedence'     // Use highest precedence
  | 'merge'          // Merge compatible routes
  | 'first_wins'     // First registered wins
  | 'last_wins'      // Last registered wins
  | 'manual'         // Requires manual resolution
  | 'error';         // Cannot resolve - error

type ResolutionAction =
  | 'use_route'      // Use specific route
  | 'merge_routes'   // Create merged route
  | 'disable_route'  // Disable conflicting route
  | 'require_manual'; // Requires manual intervention
```

### Activation Flow
```typescript
interface ActivationEngine {
  // Main activation flow
  activateRouting(config: RoutingConfig): Promise<ActivatedRoutingTable>;

  // Activation phases
  phase1_bootstrap(): Promise<void>;
  phase2_configResolved(): Promise<void>;
  phase3_staticRegistration(): Promise<StaticRoute[]>;
  phase4_packageDiscovery(): Promise<DynamicRoute[]>;
  phase5_routeRegistration(): Promise<void>;
  phase6_overrideApplication(): Promise<ResolvedRoutingTable>;
  phase7_conflictResolution(): Promise<ResolvedRoutingTable>;
  phase8_routeActivation(): Promise<ActivatedRoutingTable>;
}

// Detailed activation flow
class RoutingActivationFlow {
  async execute(config: RoutingConfig): Promise<ActivatedRoutingTable> {
    // Phase 1: Bootstrap
    await this.initializeCore();

    // Phase 2: Config Resolution
    const resolvedConfig = await this.resolveConfig(config);

    // Phase 3: Static Route Registration
    const staticRoutes = await this.registerStaticRoutes(resolvedConfig);

    // Phase 4: Package Discovery
    const packages = await this.discoverPackages(resolvedConfig);
    const dynamicRoutes = await this.generateDynamicRoutes(packages);

    // Phase 5: Route Registration
    await this.registerDynamicRoutes(dynamicRoutes);

    // Phase 6: Override Application
    const overrides = await this.collectOverrides(resolvedConfig);
    const routesWithOverrides = await this.applyOverrides(
      [...staticRoutes, ...dynamicRoutes],
      overrides
    );

    // Phase 7: Conflict Resolution
    const conflicts = this.detectConflicts(routesWithOverrides);
    const resolvedRoutes = await this.resolveConflicts(routesWithOverrides, conflicts);

    // Phase 8: Route Activation
    const activatedTable = await this.activateRoutes(resolvedRoutes);

    // Immutable at runtime (unless hot-reload enabled)
    return Object.freeze(activatedTable);
  }
}
```

### Default FHIR Route Generation
```typescript
interface FhirRouteGenerator {
  // Generate standard FHIR CRUD routes
  generateResourceRoutes(
    resourceType: string,
    capabilities: ResourceCapabilities
  ): DynamicRoute[];

  // Generate operation routes
  generateOperationRoutes(
    operations: OperationDefinition[]
  ): DynamicRoute[];

  // Generate search routes
  generateSearchRoutes(
    resourceType: string,
    searchParams: SearchParameter[]
  ): DynamicRoute[];
}

// Example generated routes for Patient resource
const patientRoutes: DynamicRoute[] = [
  {
    id: 'patient-create',
    type: 'dynamic',
    method: 'POST',
    path: '/Patient',
    resourceType: 'Patient',
    operation: 'create',
    profiles: ['http://hl7.org/fhir/StructureDefinition/Patient'],
    source: { packageId: 'hl7.fhir.r4.core', version: '4.0.1', ... },
    capabilities: {
      interactions: [{ code: 'create' }],
      searchParams: [],
      profiles: ['http://hl7.org/fhir/StructureDefinition/Patient'],
      conditionalOps: ['create'],
      versioning: { enabled: true, type: 'versioned' }
    },
    handlers: {
      default: defaultCreateHandler,
      hooks: [fhirValidationHook, constraintsHook]
    },
    constraints: {
      requiredProfiles: ['http://hl7.org/fhir/StructureDefinition/Patient'],
      supportedFormats: ['application/fhir+json', 'application/fhir+xml']
    }
  },
  {
    id: 'patient-read',
    type: 'dynamic',
    method: 'GET',
    path: '/Patient/:id',
    resourceType: 'Patient',
    operation: 'read',
    // ... similar structure
  },
  {
    id: 'patient-search',
    type: 'dynamic',
    method: 'GET',
    path: '/Patient',
    resourceType: 'Patient',
    operation: 'search',
    // ... includes search parameter handling
  }
];
```

### Override Examples
```typescript
// Example: Override Patient $validate operation
const validateOverride: RouteOverride = {
  method: 'POST',
  path: '/Patient/$validate',
  resourceType: 'Patient',
  scope: 'handler',
  type: 'replace',
  handler: customValidateHandler,
  priority: OverridePrecedence.APP_EXPLICIT,
  reason: 'Custom validation logic for Patient resources',
  source: 'app'
};

// Example: Add authentication hook to all routes
const authOverride: RouteOverride = {
  method: '*',
  path: '*',
  scope: 'hooks',
  type: 'add',
  hooks: [{
    phase: 'preRequest',
    action: 'add',
    hook: authenticationHook,
    priority: 1000
  }],
  priority: OverridePrecedence.APP_EXPLICIT,
  reason: 'Add authentication to all endpoints',
  source: 'auth-plugin'
};

// Example: Profile-specific override for US Core Patient
const usCorePatientOverride: RouteOverride = {
  method: 'POST',
  path: '/Patient',
  resourceType: 'Patient',
  profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
  scope: 'hooks',
  type: 'add',
  hooks: [{
    phase: 'preValidation',
    action: 'add',
    hook: usCoreValidationHook,
    priority: 850
  }],
  priority: OverridePrecedence.PROFILE_SPECIFIC,
  reason: 'US Core specific validation',
  source: 'us-core-plugin'
};
```

### Hot Reload Support
```typescript
interface HotReloadManager {
  enabled: boolean;

  // Package changes
  onPackageAdded(packageId: string): Promise<void>;
  onPackageRemoved(packageId: string): Promise<void>;
  onPackageUpdated(packageId: string): Promise<void>;

  // Override changes
  onOverrideAdded(override: RouteOverride): Promise<void>;
  onOverrideRemoved(routeId: string): Promise<void>;
  onOverrideUpdated(override: RouteOverride): Promise<void>;

  // Route table rebuild
  rebuildRoutingTable(): Promise<ActivatedRoutingTable>;

  // Change notifications
  onRoutingTableChanged: (table: ActivatedRoutingTable) => void;
}

// Hot reload flow
class HotReloadFlow {
  async handlePackageChange(changeType: 'add' | 'remove' | 'update', packageId: string) {
    // 1. Invalidate affected routes
    const affectedRoutes = this.findAffectedRoutes(packageId);

    // 2. Re-discover routes from updated packages
    const updatedRoutes = await this.rediscoverRoutes([packageId]);

    // 3. Re-apply overrides
    const routesWithOverrides = await this.reapplyOverrides(updatedRoutes);

    // 4. Re-resolve conflicts
    const resolvedRoutes = await this.resolveConflicts(routesWithOverrides);

    // 5. Update active routing table
    const newTable = await this.updateRoutingTable(resolvedRoutes);

    // 6. Notify listeners
    this.notifyRoutingTableChanged(newTable);
  }
}
```

## Implementation Guidelines

### Route Discovery Best Practices
1. **Incremental Discovery**: Support incremental package loading without full rebuilds
2. **Caching**: Cache discovered routes to avoid repeated processing
3. **Validation**: Validate discovered routes against FHIR specifications
4. **Error Handling**: Gracefully handle malformed or incomplete packages
5. **Performance**: Optimize discovery for large numbers of packages

### Override System Guidelines
1. **Clear Precedence**: Always use clear, documented precedence rules
2. **Conflict Detection**: Detect and report conflicts early in the process
3. **Documentation**: Require documentation for all overrides
4. **Testing**: Include tests for override scenarios
5. **Debugging**: Provide tools to debug override resolution

### Route Activation Best Practices
1. **Deterministic**: Ensure activation produces consistent results
2. **Atomic**: Route table updates should be atomic
3. **Rollback**: Support rollback on activation failures
4. **Monitoring**: Monitor activation performance and success rates
5. **Logging**: Log all significant activation events and decisions

## Consequences

### Benefits
- **Flexibility**: Apps can customize any aspect of routing behavior
- **FHIR Compliance**: Automatic generation of FHIR-compliant routes
- **Package Integration**: Seamless integration with canonical package system
- **Type Safety**: Strong typing throughout the routing system
- **Deterministic**: Predictable, reproducible routing behavior
- **Performance**: Optimized route resolution and activation

### Trade-offs
- **Complexity**: Multi-layered routing system is complex to understand
- **Learning Curve**: Developers need to understand override precedence rules
- **Performance**: Route resolution overhead during startup
- **Debugging**: Complex routing system can be challenging to debug
- **Memory Usage**: Maintaining multiple route representations uses memory

### Migration Strategy
- Provide compatibility layer for existing routing patterns
- Gradual migration from static to dynamic routing
- Tools to visualize and debug routing configuration
- Comprehensive examples for common override scenarios
- Clear documentation of precedence rules and conflict resolution