import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { HandlerContext } from "../types/index.js";

export interface SeedBundle {
  resourceType: 'Bundle';
  id: string;
  type: 'collection' | 'transaction';
  timestamp: string;
  entry: SeedBundleEntry[];
  metadata?: {
    name: string;
    version: string;
    description?: string;
    dependencies?: string[];
  };
}

export interface SeedBundleEntry {
  fullUrl?: string;
  resource: any;
  request?: {
    method: string;
    url: string;
    ifNoneExist?: string;
  };
}

export interface SeedingOptions {
  force?: boolean;
  skipExisting?: boolean;
  validateOnly?: boolean;
  sources?: string[];
}

export interface SeedingResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  bundles: string[];
}

export interface SeedProvider {
  name: string;
  version: string;
  getSeedBundles(): Promise<SeedBundle[]>;
  preprocessResource?(resource: any): Promise<any>;
  validateResource?(resource: any): Promise<void>;
}

export class SeedingManager {
  private providers: Map<string, SeedProvider> = new Map();
  private processedBundles: Set<string> = new Set();

  registerProvider(provider: SeedProvider): void {
    console.log(`[Seeding] Registering provider: ${provider.name}@${provider.version}`);
    this.providers.set(provider.name, provider);
  }

  async seedAll(context: HandlerContext, options: SeedingOptions = {}): Promise<SeedingResult> {
    const result: SeedingResult = {
      success: false,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      bundles: []
    };

    try {
      console.log('[Seeding] Starting seeding process...');
      
      // Collect all bundles from providers
      const allBundles: { provider: string; bundle: SeedBundle }[] = [];
      
      for (const [name, provider] of this.providers) {
        if (options.sources && !options.sources.includes(name)) {
          continue;
        }

        try {
          const bundles = await provider.getSeedBundles();
          for (const bundle of bundles) {
            allBundles.push({ provider: name, bundle });
          }
        } catch (error) {
          result.errors.push(`Failed to get bundles from provider ${name}: ${error.message}`);
        }
      }

      // Sort bundles by dependencies (basic topological sort)
      const sortedBundles = this.sortBundlesByDependencies(allBundles);

      // Process each bundle
      for (const { provider, bundle } of sortedBundles) {
        if (!options.force && this.processedBundles.has(`${provider}:${bundle.id}`)) {
          console.log(`[Seeding] Skipping already processed bundle: ${provider}:${bundle.id}`);
          continue;
        }

        try {
          const bundleResult = await this.processSeedBundle(
            bundle, 
            provider,
            context, 
            options
          );
          
          // Aggregate results
          result.processed += bundleResult.processed;
          result.created += bundleResult.created;
          result.updated += bundleResult.updated;
          result.skipped += bundleResult.skipped;
          result.errors.push(...bundleResult.errors);
          result.bundles.push(`${provider}:${bundle.id}`);
          
          this.processedBundles.add(`${provider}:${bundle.id}`);
          
        } catch (error) {
          result.errors.push(`Failed to process bundle ${provider}:${bundle.id}: ${error.message}`);
        }
      }

      result.success = result.errors.length === 0;
      
      console.log(`[Seeding] Completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);
      
      return result;

    } catch (error) {
      console.error('[Seeding] Fatal error:', error);
      result.errors.push(`Seeding failed: ${error.message}`);
      return result;
    }
  }

  private sortBundlesByDependencies(bundles: { provider: string; bundle: SeedBundle }[]): { provider: string; bundle: SeedBundle }[] {
    // Simple dependency resolution - in production this would be more sophisticated
    const withDeps = bundles.filter(({ bundle }) => bundle.metadata?.dependencies?.length);
    const withoutDeps = bundles.filter(({ bundle }) => !bundle.metadata?.dependencies?.length);
    
    return [...withoutDeps, ...withDeps];
  }

  private async processSeedBundle(
    bundle: SeedBundle,
    providerName: string,
    context: HandlerContext,
    options: SeedingOptions
  ): Promise<SeedingResult> {
    const result: SeedingResult = {
      success: false,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      bundles: []
    };

    console.log(`[Seeding] Processing bundle: ${providerName}:${bundle.id} (${bundle.entry?.length || 0} entries)`);

    if (!bundle.entry || bundle.entry.length === 0) {
      console.log(`[Seeding] Empty bundle: ${providerName}:${bundle.id}`);
      result.success = true;
      return result;
    }

    const provider = this.providers.get(providerName);

    for (const entry of bundle.entry) {
      if (!entry.resource) {
        result.errors.push(`Bundle entry missing resource in ${providerName}:${bundle.id}`);
        continue;
      }

      try {
        result.processed++;
        const resource = entry.resource;

        // Validate resource
        if (provider?.validateResource) {
          await provider.validateResource(resource);
        }

        if (options.validateOnly) {
          console.log(`[Seeding] Validated ${resource.resourceType}/${resource.id}`);
          continue;
        }

        // Preprocess resource
        let processedResource = resource;
        if (provider?.preprocessResource) {
          processedResource = await provider.preprocessResource(resource);
        }

        // Handle the seeding request
        if (entry.request?.ifNoneExist) {
          // Conditional create - only create if doesn't exist
          const existing = await this.findExistingResource(
            processedResource,
            entry.request.ifNoneExist,
            context
          );

          if (existing && !options.force) {
            result.skipped++;
            continue;
          }
        }

        // Check for existing resource by ID
        const existingById = await this.findResourceById(processedResource, context);
        
        if (existingById && !options.force) {
          if (options.skipExisting !== false) {
            result.skipped++;
            console.log(`[Seeding] Skipping existing ${processedResource.resourceType}/${processedResource.id}`);
            continue;
          }
        }

        // Create or update
        if (existingById && !options.force) {
          await context.storage.update(
            processedResource.resourceType,
            processedResource.id,
            processedResource
          );
          result.updated++;
          console.log(`[Seeding] Updated ${processedResource.resourceType}/${processedResource.id}`);
        } else {
          await context.storage.create(processedResource.resourceType, processedResource);
          result.created++;
          console.log(`[Seeding] Created ${processedResource.resourceType}/${processedResource.id}`);
        }

      } catch (error) {
        const errorMessage = `Failed to process resource ${entry.resource?.resourceType}/${entry.resource?.id}: ${error.message}`;
        result.errors.push(errorMessage);
        console.error(`[Seeding] ${errorMessage}`);
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  private async findExistingResource(resource: any, searchCriteria: string, context: HandlerContext): Promise<any> {
    try {
      // Parse search criteria (simplified - would be more robust in production)
      const params: Record<string, any> = {};
      const pairs = searchCriteria.split('&');
      
      for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
          params[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      }

      const bundle = await context.storage.search(resource.resourceType, params);
      return bundle?.entry?.[0]?.resource || null;

    } catch (error) {
      console.warn(`[Seeding] Search failed for ${resource.resourceType}: ${error.message}`);
      return null;
    }
  }

  private async findResourceById(resource: any, context: HandlerContext): Promise<any> {
    try {
      return await context.storage.read(resource.resourceType, resource.id);
    } catch (error) {
      return null;
    }
  }

  async checkAutoSeed(context: HandlerContext): Promise<boolean> {
    // Check if any provider indicates auto-seeding is needed
    for (const [name, provider] of this.providers) {
      try {
        const bundles = await provider.getSeedBundles();
        
        for (const bundle of bundles) {
          // Check if any resource from this bundle exists
          const hasExistingResources = await this.bundleHasExistingResources(bundle, context);
          
          if (!hasExistingResources) {
            console.log(`[Seeding] Auto-seeding needed for provider: ${name}`);
            const result = await this.seedAll(context, { skipExisting: true });
            return result.success && (result.created > 0 || result.updated > 0);
          }
        }
      } catch (error) {
        console.warn(`[Seeding] Auto-seed check failed for ${name}: ${error.message}`);
      }
    }

    return false;
  }

  private async bundleHasExistingResources(bundle: SeedBundle, context: HandlerContext): Promise<boolean> {
    if (!bundle.entry?.length) return true;

    // Check first few resources to see if bundle has been processed
    const samplesToCheck = bundle.entry.slice(0, Math.min(3, bundle.entry.length));
    
    for (const entry of samplesToCheck) {
      if (!entry.resource?.id) continue;
      
      try {
        const existing = await context.storage.read(entry.resource.resourceType, entry.resource.id);
        if (existing) return true;
      } catch {
        // Resource doesn't exist
      }
    }

    return false;
  }

  // CLI integration helpers
  shouldRunSeeding(args: string[]): boolean {
    return args.includes('--seed') || args.includes('--force-seed') || args.includes('--validate-seeds');
  }

  getSeedingOptions(args: string[]): SeedingOptions {
    const options: SeedingOptions = {
      force: args.includes('--force-seed'),
      skipExisting: !args.includes('--force-seed'),
      validateOnly: args.includes('--validate-seeds')
    };

    // Extract specific sources if provided
    const sourcesIndex = args.findIndex(arg => arg === '--seed-sources');
    if (sourcesIndex !== -1 && args[sourcesIndex + 1]) {
      options.sources = args[sourcesIndex + 1].split(',');
    }

    return options;
  }
}