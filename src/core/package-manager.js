import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { createReadStream } from 'fs';
import * as tar from 'tar';

export class PackageManager {
  constructor(packagesPath = 'packages') {
    this.packagesPath = packagesPath;
    this.packages = new Map(); // packageId -> package metadata
    this.canonicalResources = new Map(); // canonical URL -> resource
    this.resourcesByType = new Map(); // resourceType -> Map(id -> resource)
    this.profiles = new Map(); // profile URL -> StructureDefinition
    this.operations = new Map(); // operation URL -> OperationDefinition
    this.valueSets = new Map(); // valueSet URL -> ValueSet
    this.codeSystems = new Map(); // codeSystem URL -> CodeSystem
    this.searchParameters = new Map(); // searchParam URL -> SearchParameter
    this.loaded = false;
  }

  async loadPackages() {
    console.log('📦 Loading FHIR IG packages...\n');
    
    try {
      const packageDirs = await this.discoverPackages();
      
      for (const packageDir of packageDirs) {
        await this.loadPackage(packageDir);
      }
      
      this.loaded = true;
      
      console.log(`\n✅ Loaded ${this.packages.size} packages with ${this.canonicalResources.size} canonical resources`);
      this.printSummary();
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📦 No packages directory found at ${this.packagesPath}`);
      } else {
        console.error('Error loading packages:', error);
      }
    }
  }

  async discoverPackages() {
    const packages = [];
    const packagesFullPath = join(process.cwd(), this.packagesPath);
    
    try {
      const entries = await readdir(packagesFullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(packagesFullPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if it's a valid FHIR package (has package.json)
          try {
            await stat(join(fullPath, 'package.json'));
            packages.push(fullPath);
          } catch {
            // Not a package directory
          }
        } else if (entry.name.endsWith('.tgz')) {
          // Extract and load .tgz packages
          const extractedPath = await this.extractPackage(fullPath);
          if (extractedPath) {
            packages.push(extractedPath);
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    return packages;
  }

  async extractPackage(tgzPath) {
    // Extract .tgz package to temporary directory
    const packageName = basename(tgzPath, '.tgz');
    const extractPath = join(dirname(tgzPath), `.extracted-${packageName}`);
    
    try {
      await tar.extract({
        file: tgzPath,
        cwd: extractPath
      });
      return extractPath;
    } catch (error) {
      console.error(`Failed to extract package ${tgzPath}:`, error.message);
      return null;
    }
  }

  async loadPackage(packagePath) {
    try {
      // Load package.json
      const packageJsonPath = join(packagePath, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      
      const packageId = packageJson.name || basename(packagePath);
      console.log(`📚 Loading package: ${packageId} v${packageJson.version || 'unknown'}`);
      
      // Store package metadata
      this.packages.set(packageId, {
        id: packageId,
        name: packageJson.name,
        version: packageJson.version,
        dependencies: packageJson.dependencies || {},
        path: packagePath,
        canonicalBase: packageJson.canonical,
        resourceCount: 0
      });
      
      // Load all JSON resources from package/examples or package root
      await this.loadPackageResources(packagePath, packageId);
      
    } catch (error) {
      console.error(`Failed to load package from ${packagePath}:`, error.message);
    }
  }

  async loadPackageResources(packagePath, packageId) {
    const resourcePaths = [
      join(packagePath, 'examples'),
      join(packagePath, 'resources'),
      packagePath // Root directory as fallback
    ];
    
    let resourceCount = 0;
    
    for (const resourcePath of resourcePaths) {
      try {
        const files = await readdir(resourcePath);
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = join(resourcePath, file);
            await this.loadResource(filePath, packageId);
            resourceCount++;
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
    
    // Update package resource count
    const packageMeta = this.packages.get(packageId);
    if (packageMeta) {
      packageMeta.resourceCount = resourceCount;
    }
  }

  async loadResource(filePath, packageId) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const resource = JSON.parse(content);
      
      // Only process resources with URLs (canonical resources)
      if (!resource.url || !resource.resourceType) {
        return;
      }
      
      // Store in canonical registry
      this.canonicalResources.set(resource.url, {
        ...resource,
        _package: packageId,
        _filePath: filePath
      });
      
      // Store by resource type
      if (!this.resourcesByType.has(resource.resourceType)) {
        this.resourcesByType.set(resource.resourceType, new Map());
      }
      this.resourcesByType.get(resource.resourceType).set(resource.id || resource.url, resource);
      
      // Store in specialized registries
      switch (resource.resourceType) {
        case 'StructureDefinition':
          this.profiles.set(resource.url, resource);
          if (resource.type) {
            // Also store by type for easy lookup
            this.profiles.set(`${resource.type}#${resource.id}`, resource);
          }
          break;
          
        case 'OperationDefinition':
          this.operations.set(resource.url, resource);
          // Also store by code for easy lookup
          if (resource.code) {
            this.operations.set(`$${resource.code}`, resource);
          }
          break;
          
        case 'ValueSet':
          this.valueSets.set(resource.url, resource);
          break;
          
        case 'CodeSystem':
          this.codeSystems.set(resource.url, resource);
          break;
          
        case 'SearchParameter':
          this.searchParameters.set(resource.url, resource);
          if (resource.code && resource.base) {
            // Store by base+code for easy lookup
            resource.base.forEach(base => {
              this.searchParameters.set(`${base}.${resource.code}`, resource);
            });
          }
          break;
      }
      
    } catch (error) {
      // Silently skip invalid files
    }
  }

  // API Methods to access loaded resources

  getProfile(url) {
    return this.profiles.get(url);
  }

  getOperation(urlOrCode) {
    // Support both full URL and operation code (e.g., "$match")
    return this.operations.get(urlOrCode) || 
           this.operations.get(`$${urlOrCode}`);
  }

  getValueSet(url) {
    return this.valueSets.get(url);
  }

  getCodeSystem(url) {
    return this.codeSystems.get(url);
  }

  getSearchParameter(urlOrCode) {
    return this.searchParameters.get(urlOrCode);
  }

  getCanonicalResource(url) {
    return this.canonicalResources.get(url);
  }

  getResourcesByType(resourceType) {
    return Array.from(this.resourcesByType.get(resourceType)?.values() || []);
  }

  // Get all operations for a specific resource type
  getOperationsForResource(resourceType) {
    const operations = [];
    
    for (const [key, operation] of this.operations) {
      if (operation.resource && operation.resource.includes(resourceType)) {
        operations.push(operation);
      } else if (operation.system && !operation.resource) {
        // System-level operations apply to all resources
        operations.push(operation);
      }
    }
    
    return operations;
  }

  // Get all profiles for a specific resource type
  getProfilesForResource(resourceType) {
    const profiles = [];
    
    for (const [url, profile] of this.profiles) {
      if (profile.type === resourceType) {
        profiles.push(profile);
      }
    }
    
    return profiles;
  }

  // Validate resource against a profile
  async validateAgainstProfile(resource, profileUrl) {
    const profile = this.getProfile(profileUrl);
    if (!profile) {
      throw new Error(`Profile not found: ${profileUrl}`);
    }
    
    // Basic validation logic (can be expanded)
    const errors = [];
    
    // Check resource type
    if (profile.type && resource.resourceType !== profile.type) {
      errors.push(`Resource type ${resource.resourceType} does not match profile type ${profile.type}`);
    }
    
    // Check required elements
    if (profile.differential?.element) {
      for (const element of profile.differential.element) {
        if (element.min > 0) {
          const path = element.path.split('.').slice(1); // Remove resource type prefix
          if (!this.hasPath(resource, path)) {
            errors.push(`Required element missing: ${element.path}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  hasPath(obj, path) {
    let current = obj;
    for (const segment of path) {
      if (!current || typeof current !== 'object') return false;
      current = current[segment];
    }
    return current !== undefined;
  }

  // Get package dependencies
  getDependencies(packageId) {
    const pkg = this.packages.get(packageId);
    return pkg?.dependencies || {};
  }

  // Print summary of loaded packages
  printSummary() {
    console.log('\n📊 Package Summary:');
    
    for (const [id, pkg] of this.packages) {
      console.log(`\n  📦 ${id} v${pkg.version}`);
      console.log(`     Resources: ${pkg.resourceCount}`);
    }
    
    console.log('\n📋 Resource Summary:');
    console.log(`  - StructureDefinitions: ${this.profiles.size}`);
    console.log(`  - OperationDefinitions: ${this.operations.size}`);
    console.log(`  - ValueSets: ${this.valueSets.size}`);
    console.log(`  - CodeSystems: ${this.codeSystems.size}`);
    console.log(`  - SearchParameters: ${this.searchParameters.size}`);
  }

  // Export all loaded resources (for debugging/inspection)
  exportResources() {
    return {
      packages: Array.from(this.packages.entries()),
      profiles: Array.from(this.profiles.entries()),
      operations: Array.from(this.operations.entries()),
      valueSets: Array.from(this.valueSets.entries()),
      codeSystems: Array.from(this.codeSystems.entries()),
      searchParameters: Array.from(this.searchParameters.entries())
    };
  }
}