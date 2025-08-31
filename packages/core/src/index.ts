// Main exports for @atomic-fhir/core package
import Atomic from './core/atomic.js';

export { Atomic };
export type { AtomicModuleConfig, AtomicModule } from './core/atomic-module.js';
export { BaseAtomicModule } from './core/atomic-module.js';
export { defineResource } from './core/resource.js';
export { defineOperation } from './core/operation.js';
export { defineMiddleware } from './core/middleware.js';
export { defineHook } from './core/define-hook.js';

// Storage exports
export { default as StorageManager } from './storage/storage-manager.js';
export { default as SQLiteAdapter } from './storage/sqlite-adapter.js';
export { default as StorageAdapter } from './storage/adapter.js';

// Core utilities
export { Router } from './core/router.js';
export { ResourceRegistry } from './core/resource-registry.js';
export { OperationRegistry } from './core/operation-registry.js';
export { MiddlewareManager } from './core/middleware-manager.js';
export { HooksManager } from './core/hooks-manager.js';
export { FilesystemLoader } from './core/filesystem-loader.js';
export { PackageManager } from './core/package-manager.js';
export { Validator, ValidationError } from './core/validator.js';
export { CapabilityStatement } from './core/capability-statement.js';

// Export all types
export * from './types/index.js';

// Default export
export default Atomic;