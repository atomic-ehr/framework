import type { PackageDefinition } from '../types/index.js';

/**
 * Configuration for an Atomic Module
 */
export interface AtomicModuleConfig {
  name: string;
  version: string;
  description?: string;
  packages?: PackageDefinition[];
  init?: (AtomicModule: AtomicModule) => void;
}

/**
 * AtomicModule class for encapsulating FHIR functionality
 */
export interface AtomicModule {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly packages?: PackageDefinition[];
}

