import { readdir, readFile, stat, mkdir, writeFile } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';
import * as tar from 'tar';
import type { PackageDefinition, ResourceDefinition, SearchParameter } from '../types/index.js';

interface PackageJson {
  name: string;
  version?: string;
  [key: string]: any;
}

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

interface PackageMetadata {
  'dist-tags'?: {
    latest?: string;
  };
  versions: Record<string, {
    dist?: {
      tarball?: string;
    };
  }>;
}

export class PackageManager {
  private packagesPath: string;
  private packages: Map<string, PackageJson>;
  private canonicalResources: Map<string, FHIRResource>;
  private resourcesByType: Map<string, Map<string, FHIRResource>>;
  private profiles: Map<string, FHIRResource>;
  private operations: Map<string, FHIRResource>;
  private valueSets: Map<string, FHIRResource>;
  private codeSystems: Map<string, FHIRResource>;
  private searchParameters: Map<string, FHIRResource>;
  private baseResourceDefinitions: Map<string, FHIRResource>;
  public loaded: boolean;

  constructor(packagesPath: string = 'packages', _config: Record<string, any> = {}) {
    this.packagesPath = packagesPath;
    this.packages = new Map();
    this.canonicalResources = new Map();
    this.resourcesByType = new Map();
    this.profiles = new Map();
    this.operations = new Map();
    this.valueSets = new Map();
    this.codeSystems = new Map();
    this.searchParameters = new Map();
    this.baseResourceDefinitions = new Map();
    this.loaded = false;
  }

  async downloadPackages(packageList: (string | PackageDefinition)[] = []): Promise<void> {
    if (!packageList || packageList.length === 0) {
      return;
    }

    console.log(`📦 Downloading ${packageList.length} FHIR packages...`);
    
    // Ensure packages directory exists
    const packagesDir = join(process.cwd(), this.packagesPath);
    if (!existsSync(packagesDir)) {
      await mkdir(packagesDir, { recursive: true });
    }

    for (const packageConfig of packageList) {
      try {
        if (typeof packageConfig === 'string') {
          // Legacy string format: 'package@version'
          await this.downloadPackageFromRegistry(packageConfig, 'https://get-ig.org', packagesDir);
        } else if (packageConfig.remoteUrl) {
          // Direct URL download
          await this.downloadPackageFromUrl(packageConfig, packagesDir);
        } else if (packageConfig.npmRegistry) {
          // NPM-style registry download
          const packageId = `${packageConfig.package}@${packageConfig.version || 'latest'}`;
          await this.downloadPackageFromRegistry(packageId, packageConfig.npmRegistry, packagesDir);
        } else {
          // Default to get-ig.org registry
          const packageId = `${packageConfig.package}@${packageConfig.version || 'latest'}`;
          await this.downloadPackageFromRegistry(packageId, 'https://get-ig.org', packagesDir);
        }
      } catch (error) {
        const packageName = typeof packageConfig === 'string' ? packageConfig : packageConfig.package;
        console.error(`❌ Failed to download package ${packageName}:`, (error as Error).message);
      }
    }
  }

  async downloadPackageFromUrl(packageConfig: PackageDefinition, packagesDir: string): Promise<void> {
    const { package: packageName, version, remoteUrl } = packageConfig;
    console.log(`  📥 Downloading ${packageName}@${version} from ${remoteUrl}...`);
    
    // Determine filename
    const filename = `${packageName}.tgz`;
    const packagePath = join(packagesDir, filename);
    
    // Check if package already exists
    if (existsSync(packagePath)) {
      console.log(`    ✓ Package ${packageName} already exists, skipping download`);
      return;
    }
    
    // Download the package
    console.log(`    → Downloading from ${remoteUrl}`);
    const response = await fetch(remoteUrl!);
    
    if (!response.ok) {
      throw new Error(`Failed to download package: ${response.status} ${response.statusText}`);
    }
    
    // Save to file
    const buffer = await response.arrayBuffer();
    await writeFile(packagePath, Buffer.from(buffer));
    console.log(`    ✓ Downloaded ${packageName} to ${filename}`);
  }

  async downloadPackageFromRegistry(packageName: string, registry: string, packagesDir: string): Promise<void> {
    console.log(`  📥 Downloading ${packageName}...`);
    
    // Parse package name and version
    let name = packageName;
    let version = 'latest';
    
    if (packageName.includes('@')) {
      const parts = packageName.split('@');
      name = parts[0];
      version = parts[1];
    }

    // Check if package already exists
    const packagePath = join(packagesDir, `${name}.tgz`);
    if (existsSync(packagePath)) {
      console.log(`    ✓ Package ${name} already exists, skipping download`);
      return;
    }

    try {
      // Convert registry URL to npm-style API endpoint
      const registryUrl = registry.replace('https://get-ig.org', 'https://fs.get-ig.org/pkgs');
      
      // Get package metadata
      const metadataUrl = `${registryUrl}/${name}`;
      console.log(`    → Fetching metadata from ${metadataUrl}`);
      
      const metadataResponse = await fetch(metadataUrl);
      if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch package metadata: ${metadataResponse.status}`);
      }
      
      const metadata = await metadataResponse.json() as PackageMetadata;
      
      // Determine version to download
      let targetVersion = version;
      if (version === 'latest') {
        targetVersion = metadata['dist-tags']?.latest || Object.keys(metadata.versions).pop() || 'latest';
      }
      
      // Get tarball URL
      const versionData = metadata.versions[targetVersion];
      if (!versionData) {
        throw new Error(`Version ${targetVersion} not found for package ${name}`);
      }
      
      const tarballUrl = versionData.dist?.tarball;
      if (!tarballUrl) {
        throw new Error(`No tarball URL found for ${name}@${targetVersion}`);
      }
      
      console.log(`    → Downloading from ${tarballUrl}`);
      
      // Download the tarball
      const tarballResponse = await fetch(tarballUrl);
      if (!tarballResponse.ok) {
        throw new Error(`Failed to download tarball: ${tarballResponse.status}`);
      }
      
      const buffer = await tarballResponse.arrayBuffer();
      await writeFile(packagePath, Buffer.from(buffer));
      
      console.log(`    ✅ Downloaded ${name}@${targetVersion} (${(buffer.byteLength / 1024).toFixed(2)} KB)`);
      
    } catch (error) {
      // Try alternative download method for FHIR packages
      try {
        console.log(`    → Trying alternative download method...`);
        const altUrl = `${registry}/npm/${name}`;
        const response = await fetch(altUrl);
        
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          await writeFile(packagePath, Buffer.from(buffer));
          console.log(`    ✅ Downloaded ${name} using alternative method`);
        } else {
          throw error; // Re-throw original error
        }
      } catch {
        throw error; // Re-throw original error
      }
    }
  }

  async loadPackages(): Promise<void> {
    console.log('📦 Loading FHIR IG packages...\n');
    
    try {
      const packageDirs = await this.discoverPackages();
      
      for (const packageDir of packageDirs) {
        await this.loadPackage(packageDir);
      }
      
      this.loaded = true;
      
      console.log(`\n✅ Loaded ${this.packages.size} packages with ${this.canonicalResources.size} canonical resources`);
      this.printSummary();
      
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`📦 No packages directory found at ${this.packagesPath}`);
      } else {
        console.error('Error loading packages:', error);
      }
    }
  }

  async discoverPackages(): Promise<string[]> {
    const packages: string[] = [];
    const packagesFullPath = join(process.cwd(), this.packagesPath);
    
    try {
      const entries = await readdir(packagesFullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(packagesFullPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if it looks like an unpacked FHIR package
          const packageJsonPath = join(fullPath, 'package.json');
          try {
            await stat(packageJsonPath);
            packages.push(fullPath);
            console.log(`  📁 Found unpacked package: ${entry.name}`);
          } catch {
            // Not a package directory
          }
        } else if (entry.isFile() && (entry.name.endsWith('.tgz') || entry.name.endsWith('.tar.gz'))) {
          // Compressed package
          packages.push(fullPath);
          console.log(`  📦 Found compressed package: ${entry.name}`);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    return packages;
  }

  async loadPackage(packagePath: string): Promise<void> {
    const isCompressed = packagePath.endsWith('.tgz') || packagePath.endsWith('.tar.gz');
    
    if (isCompressed) {
      await this.loadCompressedPackage(packagePath);
    } else {
      await this.loadUnpackedPackage(packagePath);
    }
  }

  async loadCompressedPackage(packagePath: string): Promise<void> {
    const packageName = basename(packagePath, extname(packagePath));
    console.log(`\n  📦 Loading compressed package: ${packageName}`);
    
    // For compressed packages, we need to extract on the fly
    // and read the contents from the tar stream
    const resources: FHIRResource[] = [];
    let packageJson: PackageJson = { name: '', version: '' };
    
    await tar.t({
      file: packagePath,
      onentry: async (entry: any) => {
        const path = entry.path;
        
        if (path === 'package/package.json') {
          // Read package.json
          const chunks: Buffer[] = [];
          entry.on('data', (chunk: any) => chunks.push(chunk));
          entry.on('end', () => {
            const content = Buffer.concat(chunks).toString();
            packageJson = JSON.parse(content);
          });
        } else if (path.startsWith('package/') && path.endsWith('.json')) {
          // Read FHIR resources
          const chunks: Buffer[] = [];
          entry.on('data', (chunk: any) => chunks.push(chunk));
          entry.on('end', () => {
            try {
              const content = Buffer.concat(chunks).toString();
              const resource = JSON.parse(content);
              if (resource.resourceType) {
                resources.push(resource);
              }
            } catch (e) {
              // Not a valid JSON resource
            }
          });
        }
      }
    });
    
    // Process the loaded package
    if (packageJson.name) {
      this.packages.set(packageJson.name, packageJson);
      console.log(`    📋 Package: ${packageJson.name} v${packageJson.version || 'unknown'}`);
      
      // Process resources
      for (const resource of resources) {
        this.indexResource(resource, packageJson.name);
      }
      
      console.log(`    ✓ Loaded ${resources.length} resources`);
    }
  }

  async loadUnpackedPackage(packageDir: string): Promise<void> {
    const packageName = basename(packageDir);
    console.log(`\n  📁 Loading unpacked package: ${packageName}`);
    
    // Read package.json
    const packageJsonPath = join(packageDir, 'package.json');
    const packageJson: PackageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    
    this.packages.set(packageJson.name, packageJson);
    console.log(`    📋 Package: ${packageJson.name} v${packageJson.version || 'unknown'}`);
    
    // Load all JSON resources in the package
    const files = await readdir(packageDir);
    let resourceCount = 0;
    
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'package.json') {
        const filePath = join(packageDir, file);
        try {
          const content = await readFile(filePath, 'utf8');
          const resource = JSON.parse(content);
          
          if (resource.resourceType) {
            this.indexResource(resource, packageJson.name);
            resourceCount++;
          }
        } catch (e) {
          // Skip invalid JSON files
        }
      }
    }
    
    console.log(`    ✓ Loaded ${resourceCount} resources`);
  }

  indexResource(resource: FHIRResource, _packageId: string): void {
    // Index by canonical URL if available
    if (resource.url) {
      this.canonicalResources.set(resource.url, resource);
    }
    
    // Index by resource type
    if (!this.resourcesByType.has(resource.resourceType)) {
      this.resourcesByType.set(resource.resourceType, new Map());
    }
    if (resource.id) {
      this.resourcesByType.get(resource.resourceType)!.set(resource.id, resource);
    }
    
    // Index specific resource types for quick access
    switch (resource.resourceType) {
      case 'StructureDefinition':
        // Check for base resource definitions (derivation=specialization)
        if (resource.derivation === 'specialization' && resource.kind === 'resource') {
          // This is a base resource definition (like Patient, Observation, etc.)
          this.baseResourceDefinitions.set(resource.type || resource.name || '', resource);
        } else if (resource.type !== 'Extension' && resource.derivation === 'constraint') {
          // This is a profile (constraint on a base resource)
          if (resource.url) {
            this.profiles.set(resource.url, resource);
          }
        }
        break;
      case 'OperationDefinition':
        if (resource.url) {
          this.operations.set(resource.url, resource);
        }
        break;
      case 'ValueSet':
        if (resource.url) {
          this.valueSets.set(resource.url, resource);
        }
        break;
      case 'CodeSystem':
        if (resource.url) {
          this.codeSystems.set(resource.url, resource);
        }
        break;
      case 'SearchParameter':
        if (resource.url) {
          this.searchParameters.set(resource.url, resource);
        }
        break;
    }
  }

  printSummary(): void {
    console.log('\n📊 Package Summary:');
    console.log(`  • Base Resources: ${this.baseResourceDefinitions.size}`);
    console.log(`  • Profiles: ${this.profiles.size}`);
    console.log(`  • Operations: ${this.operations.size}`);
    console.log(`  • ValueSets: ${this.valueSets.size}`);
    console.log(`  • CodeSystems: ${this.codeSystems.size}`);
    console.log(`  • SearchParameters: ${this.searchParameters.size}`);
    
    // Show base resources if any
    if (this.baseResourceDefinitions.size > 0) {
      console.log('\n🏗️  Base Resource Definitions:');
      const baseResources = Array.from(this.baseResourceDefinitions.keys()).sort();
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
    console.log('\n📚 Resources by Type:');
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
      if (profile.type === resourceType || profile.baseDefinition?.includes(`/${resourceType}`)) {
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

  generateResourceDefinition(structureDefinition: FHIRResource): ResourceDefinition {
    const resourceType = structureDefinition.type || structureDefinition.name || '';
    
    // Extract search parameters for this resource type
    const searchParams: Record<string, SearchParameter> = {};
    for (const [_url, searchParam] of this.searchParameters) {
      if (searchParam.base && searchParam.base.includes(resourceType)) {
        // Use the code as the search parameter name
        if (searchParam.code) {
          searchParams[searchParam.code] = {
            name: searchParam.code,
            type: searchParam.type as any,
            path: searchParam.expression || searchParam.xpath,
            documentation: searchParam.description
          };
        }
      }
    }
    
    // Create the resource definition
    const resourceDef: ResourceDefinition & { fromPackage?: boolean; packageId?: string } = {
      resourceType: resourceType,
      // All capabilities enabled by default
      capabilities: {
        create: true,
        read: true,
        update: true,
        delete: true,
        'search-type': true,
        'history-type': true,
        'history-instance': true
      },
      searches: searchParams,
      // Mark as auto-generated from package
      fromPackage: true,
      packageId: structureDefinition.url
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
}