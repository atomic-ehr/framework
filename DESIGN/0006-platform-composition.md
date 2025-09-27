# ADR-0006: Platform Composition

## Status
Proposed

## Context
The `@atomic-ehr/platform` package must provide a cohesive, DX-friendly composition layer that wires together hook-core, adapters, FHIR plugins, and dynamic routing into preset configurations. This requires careful orchestration of dependencies, configuration merging, type re-exports, and preset management while maintaining strict separation of concerns.

## Decision

### Platform Architecture
```typescript
// @atomic-ehr/platform - main composition package
interface Platform {
  // Core composition
  core: HookCore;
  adapter: HttpAdapter;
  bridge: CanonicalBridge;
  routing: RoutingSystem;

  // Configuration management
  config: PlatformConfig;
  presets: PresetManager;

  // Lifecycle management
  lifecycle: PlatformLifecycle;

  // Type re-exports from @atomic-ehr/core
  types: PlatformTypes;
}

interface PlatformConfig {
  // Core configuration
  core: HookCoreConfig;

  // Adapter configuration
  adapter: {
    type: AdapterType;
    config: AdapterConfig;
  };

  // Routing configuration
  routing: {
    static: StaticRoutingConfig;
    dynamic: DynamicRoutingConfig;
    overrides: OverrideConfig;
  };

  // FHIR configuration
  fhir: {
    packages: PackageReference[];
    validation: ValidationConfig;
    constraints: ConstraintConfig;
    operations: OperationConfig;
  };

  // Platform features
  features: {
    hotReload: boolean;
    metrics: boolean;
    tracing: boolean;
    debugging: boolean;
  };

  // Environment-specific overrides
  environments: Record<string, Partial<PlatformConfig>>;
}

type AdapterType = 'node-http' | 'fetch' | 'bun-http' | 'deno-http';
```

### Preset System
```typescript
interface PresetManager {
  // Built-in presets
  getBuiltinPresets(): PresetDefinition[];

  // Preset operations
  register(preset: PresetDefinition): void;
  unregister(presetId: string): void;
  get(presetId: string): PresetDefinition | undefined;

  // Preset composition
  compose(presetIds: string[], overrides?: Partial<PlatformConfig>): PlatformConfig;
  validate(config: PlatformConfig): ValidationResult;

  // Preset utilities
  createCustomPreset(base: string, customizations: PresetCustomization): PresetDefinition;
  exportPreset(config: PlatformConfig): PresetDefinition;
}

interface PresetDefinition {
  // Preset metadata
  id: string;
  name: string;
  version: string;
  description: string;
  tags: string[];

  // Configuration
  config: Partial<PlatformConfig>;

  // Dependencies
  dependencies: PresetDependency[];
  extends?: string; // Base preset to extend

  // Hooks and plugins
  hooks: HookDefinition[];
  plugins: PluginReference[];
  bundles: HookBundleReference[];

  // Customization points
  customization: PresetCustomization;

  // Metadata
  author?: string;
  license?: string;
  repository?: string;
}

interface PresetCustomization {
  // Allowed overrides
  allowedOverrides: string[]; // Config paths that can be overridden
  requiredConfig: string[];   // Config paths that must be provided

  // Extension points
  extensionPoints: ExtensionPoint[];

  // Validation rules
  validation: CustomValidationRule[];
}

interface ExtensionPoint {
  name: string;
  type: 'hook' | 'plugin' | 'config' | 'route';
  required: boolean;
  description: string;
  schema?: JSONSchema7;
}
```

### Built-in Presets
```typescript
// Minimal FHIR server preset
const fhirMinimalPreset: PresetDefinition = {
  id: '@atomic-ehr/preset-fhir-minimal',
  name: 'FHIR Minimal',
  version: '1.0.0',
  description: 'Minimal FHIR R4 server with basic CRUD operations',
  tags: ['fhir', 'minimal', 'r4'],

  config: {
    core: {
      hooks: { enabled: true },
      plugins: { enabled: true }
    },
    adapter: {
      type: 'node-http',
      config: {
        maxBodySize: 50 * 1024 * 1024, // 50MB
        enableCompression: true,
        requestTimeout: 30000
      }
    },
    routing: {
      static: {
        health: { enabled: true, path: '/health' },
        metadata: { enabled: true, path: '/metadata' },
        capability: { enabled: true, path: '/metadata' }
      },
      dynamic: {
        enabled: true,
        autoDiscovery: true,
        packageSources: ['canonical-manager']
      },
      overrides: {
        enabled: true,
        allowAppOverrides: true
      }
    },
    fhir: {
      packages: [
        { package: 'hl7.fhir.r4.core', version: '4.0.1' }
      ],
      validation: {
        enabled: true,
        strict: false,
        profiles: 'auto'
      },
      constraints: {
        enabled: true,
        invariants: true,
        searchCoercion: true
      },
      operations: {
        crud: 'auto',
        search: 'auto',
        history: 'auto',
        batch: false,
        transaction: false
      }
    },
    features: {
      hotReload: false,
      metrics: false,
      tracing: false,
      debugging: process.env.NODE_ENV === 'development'
    }
  },

  dependencies: [],
  hooks: [], // Will be populated by bundles
  plugins: [],
  bundles: [
    { id: '@atomic-ehr/fhir-validation', version: '^1.0.0' },
    { id: '@atomic-ehr/fhir-constraints', version: '^1.0.0' }
  ],

  customization: {
    allowedOverrides: [
      'adapter.config',
      'fhir.packages',
      'features',
      'routing.overrides'
    ],
    requiredConfig: [],
    extensionPoints: [
      {
        name: 'custom-hooks',
        type: 'hook',
        required: false,
        description: 'Add custom hooks to the application'
      },
      {
        name: 'custom-packages',
        type: 'config',
        required: false,
        description: 'Additional FHIR packages to load'
      }
    ],
    validation: []
  }
};

// Full-featured FHIR server preset
const fhirFullPreset: PresetDefinition = {
  id: '@atomic-ehr/preset-fhir-full',
  name: 'FHIR Full',
  version: '1.0.0',
  description: 'Full-featured FHIR R4 server with all operations and observability',
  tags: ['fhir', 'full', 'r4', 'production'],

  extends: '@atomic-ehr/preset-fhir-minimal',

  config: {
    // Inherits from minimal preset and overrides specific parts
    fhir: {
      operations: {
        crud: 'auto',
        search: 'auto',
        history: 'auto',
        batch: true,
        transaction: true,
        operations: 'auto'
      },
      validation: {
        enabled: true,
        strict: true,
        profiles: 'auto'
      }
    },
    features: {
      hotReload: false,
      metrics: true,
      tracing: true,
      debugging: false
    },
    adapter: {
      type: 'node-http',
      config: {
        maxBodySize: 100 * 1024 * 1024, // 100MB
        enableCompression: true,
        requestTimeout: 60000,
        keepAliveTimeout: 30000
      }
    }
  },

  bundles: [
    // Inherits validation and constraints from minimal
    { id: '@atomic-ehr/observability', version: '^1.0.0' },
    { id: '@atomic-ehr/auth-smart', version: '^1.0.0', optional: true }
  ],

  customization: {
    allowedOverrides: [
      'adapter.config',
      'fhir.packages',
      'features',
      'routing.overrides',
      'auth'
    ],
    requiredConfig: [],
    extensionPoints: [
      {
        name: 'auth-strategy',
        type: 'plugin',
        required: false,
        description: 'Authentication strategy plugin'
      },
      {
        name: 'storage-adapter',
        type: 'plugin',
        required: false,
        description: 'Custom storage adapter'
      }
    ],
    validation: []
  }
};

// US Core preset
const usCorePreset: PresetDefinition = {
  id: '@atomic-ehr/preset-us-core',
  name: 'US Core FHIR',
  version: '1.0.0',
  description: 'US Core FHIR server with ONC compliance',
  tags: ['fhir', 'us-core', 'onc', 'uscdi'],

  extends: '@atomic-ehr/preset-fhir-full',

  config: {
    fhir: {
      packages: [
        { package: 'hl7.fhir.r4.core', version: '4.0.1' },
        { package: 'hl7.fhir.us.core', version: '7.0.0' }
      ],
      validation: {
        enabled: true,
        strict: true,
        profiles: ['us-core']
      },
      constraints: {
        enabled: true,
        invariants: true,
        searchCoercion: true,
        mustSupport: true
      }
    }
  },

  bundles: [
    // Inherits from full preset
    { id: '@atomic-ehr/us-core-validation', version: '^1.0.0' },
    { id: '@atomic-ehr/smart-on-fhir', version: '^1.0.0' },
    { id: '@atomic-ehr/bulk-data', version: '^1.0.0' }
  ],

  customization: {
    allowedOverrides: [
      'adapter.config',
      'features',
      'routing.overrides',
      'auth.smart'
    ],
    requiredConfig: [
      'auth.smart.clientId',
      'auth.smart.issuer'
    ],
    extensionPoints: [
      {
        name: 'patient-access-api',
        type: 'route',
        required: false,
        description: 'Patient access API endpoints'
      }
    ],
    validation: [
      {
        path: 'auth.smart',
        rule: 'required',
        message: 'SMART on FHIR authentication is required for US Core'
      }
    ]
  }
};
```

### Configuration Merging Strategy
```typescript
interface ConfigMerger {
  // Main merge method
  merge(
    base: Partial<PlatformConfig>,
    overrides: Partial<PlatformConfig>[],
    strategy: MergeStrategy
  ): PlatformConfig;

  // Merge strategies
  deepMerge(base: unknown, override: unknown): unknown;
  arrayMerge(base: unknown[], override: unknown[], strategy: ArrayMergeStrategy): unknown[];
  objectMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown>;

  // Validation
  validateMergedConfig(config: PlatformConfig): ValidationResult;
  detectConflicts(configs: Partial<PlatformConfig>[]): ConfigConflict[];
}

type MergeStrategy = 'deep' | 'shallow' | 'replace' | 'append';
type ArrayMergeStrategy = 'replace' | 'append' | 'prepend' | 'merge';

interface ConfigConflict {
  path: string;
  type: 'type_mismatch' | 'array_conflict' | 'required_override';
  values: unknown[];
  resolution?: ConflictResolution;
}

// Deterministic resolution order
enum ConfigPrecedence {
  USER_EXPLICIT = 1000,    // User-provided overrides
  ENVIRONMENT = 900,       // Environment-specific config
  PRESET_EXTENSION = 800,  // Preset extension points
  PRESET_CONFIG = 700,     // Preset configuration
  PRESET_BASE = 600,       // Base preset (if extending)
  DEFAULTS = 500           // Platform defaults
}
```

### Platform Lifecycle
```typescript
interface PlatformLifecycle {
  // Lifecycle phases
  phases: LifecyclePhase[];
  currentPhase: LifecyclePhase;

  // Main lifecycle methods
  initialize(config: PlatformConfig): Promise<InitializationResult>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;

  // Phase management
  executePhase(phase: LifecyclePhase): Promise<void>;
  skipPhase(phase: LifecyclePhase): void;
  rollbackToPhase(phase: LifecyclePhase): Promise<void>;

  // Event handling
  onPhaseStart: (phase: LifecyclePhase) => void;
  onPhaseComplete: (phase: LifecyclePhase) => void;
  onPhaseError: (phase: LifecyclePhase, error: Error) => void;
}

type LifecyclePhase =
  | 'config_resolution'
  | 'adapter_initialization'
  | 'core_initialization'
  | 'package_discovery'
  | 'route_generation'
  | 'hook_registration'
  | 'plugin_loading'
  | 'route_activation'
  | 'service_start'
  | 'health_check'
  | 'ready';

class PlatformInitializer {
  async initialize(config: PlatformConfig): Promise<InitializationResult> {
    const phases: InitializationPhase[] = [
      {
        name: 'config_resolution',
        handler: () => this.resolveConfiguration(config),
        required: true,
        timeout: 5000
      },
      {
        name: 'adapter_initialization',
        handler: () => this.initializeAdapter(config.adapter),
        required: true,
        timeout: 10000
      },
      {
        name: 'core_initialization',
        handler: () => this.initializeHookCore(config.core),
        required: true,
        timeout: 5000
      },
      {
        name: 'package_discovery',
        handler: () => this.discoverPackages(config.fhir.packages),
        required: true,
        timeout: 30000
      },
      {
        name: 'route_generation',
        handler: () => this.generateRoutes(),
        required: true,
        timeout: 15000
      },
      {
        name: 'hook_registration',
        handler: () => this.registerHooks(),
        required: true,
        timeout: 10000
      },
      {
        name: 'plugin_loading',
        handler: () => this.loadPlugins(),
        required: false,
        timeout: 20000
      },
      {
        name: 'route_activation',
        handler: () => this.activateRoutes(),
        required: true,
        timeout: 10000
      },
      {
        name: 'service_start',
        handler: () => this.startServices(),
        required: true,
        timeout: 5000
      },
      {
        name: 'health_check',
        handler: () => this.performHealthCheck(),
        required: true,
        timeout: 5000
      }
    ];

    const results: PhaseResult[] = [];
    let currentPhase: LifecyclePhase = phases[0].name;

    try {
      for (const phase of phases) {
        currentPhase = phase.name;
        this.onPhaseStart?.(phase.name);

        const result = await this.executePhaseWithTimeout(phase);
        results.push(result);

        if (!result.success && phase.required) {
          throw new InitializationError(
            `Required phase ${phase.name} failed: ${result.error?.message}`,
            phase.name,
            result.error
          );
        }

        this.onPhaseComplete?.(phase.name);
      }

      return {
        success: true,
        phases: results,
        duration: results.reduce((sum, r) => sum + r.duration, 0),
        config: this.finalConfig
      };

    } catch (error) {
      this.onPhaseError?.(currentPhase, error as Error);

      return {
        success: false,
        phases: results,
        duration: results.reduce((sum, r) => sum + r.duration, 0),
        error: error as Error,
        failedPhase: currentPhase
      };
    }
  }

  private async executePhaseWithTimeout(phase: InitializationPhase): Promise<PhaseResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Phase ${phase.name} timed out`)), phase.timeout);
      });

      await Promise.race([phase.handler(), timeoutPromise]);

      return {
        phase: phase.name,
        success: true,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        phase: phase.name,
        success: false,
        duration: Date.now() - startTime,
        error: error as Error
      };
    }
  }
}
```

### Type Re-exports
```typescript
// @atomic-ehr/platform re-exports all types from @atomic-ehr/core
// to avoid type duplication and provide a single import point

// Core types
export type {
  // Base context types
  AppContext,
  RequestContext,
  ResponseContext,
  ErrorContext,

  // Service interfaces
  Logger,
  Clock,
  Config,
  EventEmitter,

  // Error types
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,

  // Configuration types
  BaseConfig,
  ServiceConfig,

  // Dependency injection
  Container,
  ServiceProvider,
  ServiceFactory
} from '@atomic-ehr/core';

// Hook core types
export type {
  HookDefinition,
  HookPhase,
  HookContext,
  HookRegistry,
  PluginDefinition,
  PluginManager
} from '@atomic-ehr/hook-core';

// Adapter types
export type {
  HttpAdapter,
  AdapterCapabilities,
  ParsedRequest,
  ResponseData,
  Headers
} from '@atomic-ehr/hook-core-http-node'; // or appropriate adapter

// FHIR types
export type {
  CanonicalBridge,
  CanonicalPackage,
  FhirRouteGenerator,
  HookBundle,
  FhirRequestContext,
  FhirResponse
} from '@atomic-ehr/canonical-bridge';

// Platform-specific types
export type {
  Platform,
  PlatformConfig,
  PresetDefinition,
  PresetManager,
  PlatformLifecycle
};

// Utility types
export type {
  DeepPartial,
  DeepMerge,
  TypedEventEmitter,
  AsyncFunction,
  Constructor
} from '@atomic-ehr/core';
```

### Platform Factory
```typescript
// Main platform factory function
export function createPlatform(options: PlatformOptions): Promise<Platform> {
  return new PlatformBuilder(options).build();
}

interface PlatformOptions {
  // Preset selection
  preset?: string | PresetDefinition;

  // Configuration overrides
  config?: Partial<PlatformConfig>;

  // Environment
  environment?: string;

  // Custom presets
  customPresets?: PresetDefinition[];

  // Initialization options
  initialization?: {
    timeout?: number;
    skipOptionalPhases?: boolean;
    rollbackOnError?: boolean;
  };
}

class PlatformBuilder {
  constructor(private options: PlatformOptions) {}

  async build(): Promise<Platform> {
    // 1. Resolve preset
    const preset = await this.resolvePreset(this.options.preset);

    // 2. Merge configuration
    const config = this.mergeConfiguration(preset, this.options.config);

    // 3. Create platform instance
    const platform = new PlatformImpl(config);

    // 4. Initialize platform
    await platform.initialize();

    return platform;
  }

  private async resolvePreset(preset?: string | PresetDefinition): Promise<PresetDefinition> {
    if (!preset) {
      return fhirMinimalPreset; // Default preset
    }

    if (typeof preset === 'string') {
      const presetDef = builtinPresets.get(preset);
      if (!presetDef) {
        throw new Error(`Unknown preset: ${preset}`);
      }
      return presetDef;
    }

    return preset;
  }

  private mergeConfiguration(
    preset: PresetDefinition,
    overrides?: Partial<PlatformConfig>
  ): PlatformConfig {
    const merger = new ConfigMerger();

    const configs: Partial<PlatformConfig>[] = [
      defaultPlatformConfig,
      preset.config
    ];

    if (preset.extends) {
      const basePreset = builtinPresets.get(preset.extends);
      if (basePreset) {
        configs.splice(-1, 0, basePreset.config);
      }
    }

    if (overrides) {
      configs.push(overrides);
    }

    return merger.merge({}, configs, 'deep');
  }
}

// Convenience functions for common presets
export const createMinimalFhirServer = (overrides?: Partial<PlatformConfig>) =>
  createPlatform({ preset: '@atomic-ehr/preset-fhir-minimal', config: overrides });

export const createFullFhirServer = (overrides?: Partial<PlatformConfig>) =>
  createPlatform({ preset: '@atomic-ehr/preset-fhir-full', config: overrides });

export const createUsCoreServer = (overrides?: Partial<PlatformConfig>) =>
  createPlatform({ preset: '@atomic-ehr/preset-us-core', config: overrides });
```

### Example Usage
```typescript
// Simple minimal server
const app = await createMinimalFhirServer({
  fhir: {
    packages: [
      { package: 'hl7.fhir.r4.core', version: '4.0.1' }
    ]
  }
});

await app.start();

// Full-featured server with custom configuration
const app = await createPlatform({
  preset: '@atomic-ehr/preset-fhir-full',
  config: {
    adapter: {
      type: 'bun-http',
      config: {
        port: 3000,
        maxBodySize: 100 * 1024 * 1024
      }
    },
    fhir: {
      packages: [
        { package: 'hl7.fhir.r4.core', version: '4.0.1' },
        { package: 'hl7.fhir.us.core', version: '7.0.0' }
      ],
      validation: {
        strict: true,
        profiles: ['us-core']
      }
    },
    features: {
      metrics: true,
      tracing: true,
      debugging: true
    }
  }
});

// Custom preset
const customPreset: PresetDefinition = {
  id: 'my-custom-preset',
  name: 'My Custom FHIR Server',
  version: '1.0.0',
  description: 'Custom FHIR server for my organization',
  tags: ['custom', 'organization'],
  extends: '@atomic-ehr/preset-fhir-full',
  config: {
    // Custom configuration
  },
  bundles: [
    { id: '@my-org/custom-validation', version: '^1.0.0' }
  ],
  customization: {
    allowedOverrides: ['features'],
    requiredConfig: [],
    extensionPoints: [],
    validation: []
  }
};

const app = await createPlatform({
  preset: customPreset,
  customPresets: [customPreset]
});
```

## Implementation Guidelines

### Preset Development Best Practices
1. **Single Purpose**: Each preset should target a specific use case or compliance requirement
2. **Composition**: Use preset extension to build on existing presets rather than duplicating configuration
3. **Validation**: Include comprehensive validation rules for preset-specific requirements
4. **Documentation**: Provide clear documentation and examples for preset usage
5. **Testing**: Include integration tests that validate preset functionality end-to-end

### Configuration Management
1. **Immutability**: Treat configuration as immutable after initialization
2. **Validation**: Validate configuration at multiple levels (syntax, semantics, runtime)
3. **Environment Separation**: Support environment-specific configuration overrides
4. **Secrets Management**: Provide secure handling of sensitive configuration values
5. **Hot Reload**: Support dynamic configuration updates where appropriate

### Type Safety Guidelines
1. **No Duplication**: Re-export types from core packages rather than duplicating
2. **Strict Types**: Use strict TypeScript configuration with no implicit any
3. **Generic Constraints**: Use generic constraints to ensure type safety across composition
4. **Runtime Validation**: Validate types at runtime to catch configuration errors
5. **Documentation**: Provide comprehensive type documentation and examples

## Consequences

### Benefits
- **Developer Experience**: Simple, preset-based approach reduces configuration complexity
- **Type Safety**: Complete TypeScript support with no type duplication
- **Flexibility**: Support for custom presets and extensive customization
- **Compliance**: Built-in presets for common compliance requirements (US Core, etc.)
- **Maintainability**: Clear separation of concerns and modular architecture
- **Performance**: Optimized initialization and configuration merging

### Trade-offs
- **Complexity**: Sophisticated preset system adds complexity to platform layer
- **Learning Curve**: Developers need to understand preset concepts and composition
- **Bundle Size**: Platform package includes all preset definitions and dependencies
- **Startup Time**: Configuration resolution and initialization add startup latency
- **Memory Usage**: Platform maintains references to all loaded presets and configurations

### Migration Strategy
- Provide migration utilities for existing configuration formats
- Support gradual adoption with compatibility layers
- Comprehensive documentation and examples for preset migration
- Tools to analyze and optimize preset composition
- Clear deprecation path for legacy configuration patterns