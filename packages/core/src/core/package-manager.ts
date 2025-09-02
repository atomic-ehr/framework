import { join } from "node:path";
import {
  createCanonicalManager,
  type PackageId,
} from "@atomic-ehr/fhir-canonical-manager";
import type {
  PackageDefinition,
  ResourceDefinition,
  SearchParameter,
} from "../types/index.js";

interface FHIRResource {
  resourceType: string;
  id?: string;
  url?: string;
  type?: string;
  name?: string;
  derivation?: string;
  kind?: string;
  base?: string[];
  code?: string;
  expression?: string;
  xpath?: string;
  description?: string;
  baseDefinition?: string;
  [key: string]: any;
}

export class PackageManager {
  private canonicalManager: ReturnType<typeof createCanonicalManager> | null =
    null;
  private packagesPath: string;
  private packages: Map<string, PackageId> = new Map();
  private canonicalResources: Map<string, FHIRResource> = new Map();
  private resourcesByType: Map<string, Map<string, FHIRResource>> = new Map();
  private profiles: Map<string, FHIRResource> = new Map();
  private operations: Map<string, FHIRResource> = new Map();
  private valueSets: Map<string, FHIRResource> = new Map();
  private codeSystems: Map<string, FHIRResource> = new Map();
  private searchParameters: Map<string, FHIRResource> = new Map();
  private baseResourceDefinitions: Map<string, FHIRResource> = new Map();
  public loaded: boolean = false;

  constructor(
    packagesPath: string = ".packages",
    _config: Record<string, any> = {},
  ) {
    this.packagesPath = packagesPath;
  }

  async downloadPackages(
    packageList: (string | PackageDefinition)[] = [],
  ): Promise<void> {
    if (!packageList || packageList.length === 0) {
      return;
    }

    console.log(`📦 Processing ${packageList.length} FHIR packages...`);

    // Convert package definitions to simple package names for fhir-canonical-manager
    const packageNames: string[] = [];

    for (const packageConfig of packageList) {
      if (typeof packageConfig === "string") {
        // Legacy string format: 'package@version' or just 'package'
        if (packageConfig.includes("@")) {
          const [name] = packageConfig.split("@");
          packageNames.push(name);
        } else {
          packageNames.push(packageConfig);
        }
      } else {
        // Package definition object
        packageNames.push(packageConfig.package);
      }
    }

    // Create canonical manager with package list
    const workingDir = join(process.cwd(), this.packagesPath);
    this.canonicalManager = createCanonicalManager({
      packages: packageNames,
      workingDir: workingDir,
      registry: "https://fs.get-ig.org/pkgs/",
    });

    // Initialize will handle downloading and installing packages
    await this.canonicalManager.init();

    console.log(`✅ Packages processed successfully`);
  }

  async loadPackages(): Promise<void> {
    console.log("📦 Loading FHIR IG packages from canonical manager...\n");

    try {
      if (!this.canonicalManager) {
        console.log(
          "📦 No canonical manager initialized, skipping package loading",
        );
        return;
      }

      // Get all packages from canonical manager
      const packageIds = await this.canonicalManager.packages();

      for (const packageId of packageIds) {
        this.packages.set(packageId.name, packageId);
      }

      // Load and index all resources from canonical manager
      await this.indexAllResources();

      this.loaded = true;

      console.log(
        `\n✅ Loaded ${this.packages.size} packages with ${this.canonicalResources.size} canonical resources`,
      );
      this.printSummary();
    } catch (error: unknown) {
      console.error("Error loading packages:", error);
      throw error;
    }
  }

  private async indexAllResources(): Promise<void> {
    if (!this.canonicalManager) {
      return;
    }

    // Only load StructureDefinitions for base resources to speed up startup
    console.log(`    • Loading StructureDefinitions for base resources...`);

    const structureDefEntries = await this.canonicalManager.searchEntries({
    });

    console.log(`    • Found ${structureDefEntries.length} StructureDefinition entries`);

    const manager = this.canonicalManager;
    let resourceCount = 0;

    // Process StructureDefinitions in smaller batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < structureDefEntries.length; i += BATCH_SIZE) {
      const batch = structureDefEntries.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (entry) => {
          try {
            const resource = await manager.read(entry);
            const fhirResource = resource as unknown as FHIRResource;

            // Only index StructureDefinitions (includes base resources and profiles)
            this.indexResource(
              fhirResource,
              entry.package?.name || "unknown",
            );
            resourceCount++;
          } catch (error) {
            // Skip resources that can't be loaded
            console.debug(`Skipping resource ${entry.id}:`, error);
          }
        }),
      );
    }

    // Load SearchParameters for better search functionality
    console.log(`    • Loading SearchParameters...`);
    const searchParamEntries = await this.canonicalManager.searchEntries({
      type: 'SearchParameter'
    });

    for (let i = 0; i < searchParamEntries.length; i += BATCH_SIZE) {
      const batch = searchParamEntries.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (entry) => {
          try {
            const resource = await manager.read(entry);
            const fhirResource = resource as unknown as FHIRResource;

            this.indexResource(
              fhirResource,
              entry.package?.name || "unknown",
            );
            resourceCount++;
          } catch (error) {
            console.debug(`Skipping resource ${entry.id}:`, error);
          }
        }),
      );
    }

    console.log(
      `    ✓ Indexed ${resourceCount} essential resources from canonical manager`,
    );
    console.log(`    • Other resources (ValueSets, CodeSystems, etc.) can be loaded on-demand`);
  }

  private indexResource(resource: FHIRResource, _packageId: string): void {
    // Index by canonical URL if available
    if (resource.url) {
      this.canonicalResources.set(resource.url, resource);
    }

    // Index by resource type
    if (!this.resourcesByType.has(resource.resourceType)) {
      this.resourcesByType.set(resource.resourceType, new Map());
    }
    if (resource.id) {
      this.resourcesByType
        .get(resource.resourceType)!
        .set(resource.id, resource);
    }

    // Index specific resource types for quick access
    switch (resource.resourceType) {
      case "StructureDefinition":
        // Check for base resource definitions (derivation=specialization)
        if (
          resource.derivation === "specialization" &&
          resource.kind === "resource"
        ) {
          // This is a base resource definition (like Patient, Observation, etc.)
          this.baseResourceDefinitions.set(
            resource.type || resource.name || "",
            resource,
          );
        } else if (
          resource.type !== "Extension" &&
          resource.derivation === "constraint"
        ) {
          // This is a profile (constraint on a base resource)
          if (resource.url) {
            this.profiles.set(resource.url, resource);
          }
        }
        break;
      case "OperationDefinition":
        if (resource.url) {
          this.operations.set(resource.url, resource);
        }
        break;
      case "ValueSet":
        if (resource.url) {
          this.valueSets.set(resource.url, resource);
        }
        break;
      case "CodeSystem":
        if (resource.url) {
          this.codeSystems.set(resource.url, resource);
        }
        break;
      case "SearchParameter":
        if (resource.url) {
          this.searchParameters.set(resource.url, resource);
        }
        break;
    }
  }

  private printSummary(): void {
    console.log("\n📊 Package Summary:");
    console.log(`  • Base Resources: ${this.baseResourceDefinitions.size}`);
    console.log(`  • Profiles: ${this.profiles.size}`);
    console.log(`  • Operations: ${this.operations.size}`);
    console.log(`  • ValueSets: ${this.valueSets.size}`);
    console.log(`  • CodeSystems: ${this.codeSystems.size}`);
    console.log(`  • SearchParameters: ${this.searchParameters.size}`);

    // Show base resources if any
    if (this.baseResourceDefinitions.size > 0) {
      console.log("\n🏗️  Base Resource Definitions:");
      const baseResources = Array.from(
        this.baseResourceDefinitions.keys(),
      ).sort();
      // Show first 10 and count if more
      const displayResources = baseResources.slice(0, 10);
      for (const resourceType of displayResources) {
        console.log(`  • ${resourceType}`);
      }
      if (baseResources.length > 10) {
        console.log(`  • ... and ${baseResources.length - 10} more`);
      }
    }

    // Show resource type breakdown
    console.log("\n📚 Resources by Type:");
    for (const [type, resources] of this.resourcesByType) {
      console.log(`  • ${type}: ${resources.size}`);
    }
  }

  getProfile(url: string): FHIRResource | undefined {
    return this.profiles.get(url);
  }

  getProfilesForResource(resourceType: string): string[] {
    const profiles: string[] = [];

    // First, add the base resource definition if it exists
    const baseDefinition = this.baseResourceDefinitions.get(resourceType);
    if (baseDefinition && baseDefinition.url) {
      profiles.push(baseDefinition.url);
    }

    // Then add all constraint profiles for this resource type
    for (const [url, profile] of this.profiles) {
      // Check if this profile is for the specified resource type
      if (
        profile.type === resourceType ||
        profile.baseDefinition?.includes(`/${resourceType}`)
      ) {
        profiles.push(url);
      }
    }

    return profiles;
  }

  getValueSet(url: string): FHIRResource | undefined {
    return this.valueSets.get(url);
  }

  getCodeSystem(url: string): FHIRResource | undefined {
    return this.codeSystems.get(url);
  }

  getOperation(url: string): FHIRResource | undefined {
    return this.operations.get(url);
  }

  getResource(url: string): FHIRResource | undefined {
    return this.canonicalResources.get(url);
  }

  getResourcesByType(resourceType: string): Map<string, FHIRResource> {
    return this.resourcesByType.get(resourceType) || new Map();
  }

  getBaseResourceDefinitions(): Map<string, FHIRResource> {
    return this.baseResourceDefinitions;
  }

  generateResourceDefinition(
    structureDefinition: FHIRResource,
  ): ResourceDefinition {
    const resourceType =
      structureDefinition.type || structureDefinition.name || "";

    // Use already loaded search parameters from local cache
    const searchParams: Record<string, SearchParameter> = {};

    for (const [_url, searchParam] of this.searchParameters) {
      if (searchParam.base && searchParam.base.includes(resourceType)) {
        // Use the code as the search parameter name
        if (searchParam.code) {
          searchParams[searchParam.code] = {
            name: searchParam.code,
            type: searchParam.type as any,
            path: searchParam.expression || searchParam.xpath,
            documentation: searchParam.description,
          };
        }
      }
    }

    // Create the resource definition
    const resourceDef: ResourceDefinition & {
      fromPackage?: boolean;
      packageId?: string;
    } = {
      resourceType: resourceType,
      // All capabilities enabled by default
      capabilities: {
        create: true,
        read: true,
        update: true,
        delete: true,
        "search-type": true,
        "history-type": true,
        "history-instance": true,
      },
      searches: searchParams,
      // Mark as auto-generated from package
      fromPackage: true,
      packageId: structureDefinition.url,
    };

    return resourceDef;
  }

  generateAllResourceDefinitions(): Map<string, ResourceDefinition> {
    const definitions = new Map<string, ResourceDefinition>();

    for (const [resourceType, structureDef] of this.baseResourceDefinitions) {
      const resourceDef = this.generateResourceDefinition(structureDef);
      definitions.set(resourceType, resourceDef);
    }

    return definitions;
  }

  async getSearchParametersFromCanonicalManager(
    resourceType: string,
  ): Promise<SearchParameter[]> {
    if (!this.canonicalManager) {
      return [];
    }

    try {
      const fcmSearchParams =
        await this.canonicalManager.getSearchParametersForResource(
          resourceType,
        );

      // Convert FCM search parameters to our internal format
      return fcmSearchParams.map((param: any) => ({
        name: param.code,
        type: param.type as any,
        path: param.expression || param.code,
        documentation:
          (param as any).description || `Search parameter ${param.code}`,
      }));
    } catch (error) {
      console.debug(
        `Error getting search parameters for ${resourceType}:`,
        error,
      );
      return [];
    }
  }
}
