import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import bcrypt from "bcrypt";
import type { EmbeddedPackageDefinition, SeedProvider, SeedBundle } from "@atomic-fhir/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create the seed provider instance
const authSeedProvider = new AtomicAuthSeedProvider();

export const AtomicAuthPackageDefinition: EmbeddedPackageDefinition = {
  name: "atomic.fhir.auth",
  version: "1.0.0",
  description: "Atomic FHIR Authentication Module with OAuth2 and SMART on FHIR support",
  canonical: "http://atomic-fhir.org/ig/auth",
  dependencies: ["hl7.fhir.r4.core"],
  fhirVersions: ["4.0.1"],
  
  // Package paths relative to this file
  packagePath: __dirname,
  structureDefinitions: "ig/StructureDefinition",
  searchParameters: "search-parameters.json", 
  resources: "resources",
  operations: "operations",
  hooks: "hooks",
  middleware: "middleware",
  seeds: "seeds",
  
  // Seed provider for authentication data
  seedProvider: authSeedProvider,
  
  // Package configuration
  configure: async (context) => {
    console.log('[Atomic Auth] Configuring authentication package...');
    
    // Register search parameters
    const searchParams = [
      {
        resourceType: "SearchParameter",
        id: "user-username",
        url: "http://atomic-fhir.org/ig/auth/SearchParameter/user-username",
        name: "username",
        status: "active",
        description: "Search User by username",
        code: "username",
        base: ["Basic"],
        type: "string",
        expression: "Basic.extension.where(url='http://atomic-fhir.org/ig/auth/StructureDefinition/username').value",
        xpath: "f:Basic/f:extension[@url='http://atomic-fhir.org/ig/auth/StructureDefinition/username']/f:valueString",
        xpathUsage: "normal"
      },
      {
        resourceType: "SearchParameter", 
        id: "client-client-id",
        url: "http://atomic-fhir.org/ig/auth/SearchParameter/client-client-id",
        name: "client-id",
        status: "active",
        description: "Search Client by client_id",
        code: "client-id",
        base: ["Basic"],
        type: "string",
        expression: "Basic.extension.where(url='http://atomic-fhir.org/ig/auth/StructureDefinition/client-id').value",
        xpath: "f:Basic/f:extension[@url='http://atomic-fhir.org/ig/auth/StructureDefinition/client-id']/f:valueString",
        xpathUsage: "normal"
      },
      {
        resourceType: "SearchParameter",
        id: "token-access-token",
        url: "http://atomic-fhir.org/ig/auth/SearchParameter/token-access-token", 
        name: "access-token",
        status: "active",
        description: "Search Token by access token value",
        code: "access-token",
        base: ["Basic"],
        type: "string",
        expression: "Basic.extension.where(url='http://atomic-fhir.org/ig/auth/StructureDefinition/access-token').value",
        xpath: "f:Basic/f:extension[@url='http://atomic-fhir.org/ig/auth/StructureDefinition/access-token']/f:valueString",
        xpathUsage: "normal"
      },
      {
        resourceType: "SearchParameter",
        id: "token-refresh-token", 
        url: "http://atomic-fhir.org/ig/auth/SearchParameter/token-refresh-token",
        name: "refresh-token",
        status: "active",
        description: "Search Token by refresh token value",
        code: "refresh-token",
        base: ["Basic"],
        type: "string",
        expression: "Basic.extension.where(url='http://atomic-fhir.org/ig/auth/StructureDefinition/refresh-token').value",
        xpath: "f:Basic/f:extension[@url='http://atomic-fhir.org/ig/auth/StructureDefinition/refresh-token']/f:valueString",
        xpathUsage: "normal"
      },
      {
        resourceType: "SearchParameter",
        id: "login-session-session-id",
        url: "http://atomic-fhir.org/ig/auth/SearchParameter/login-session-session-id",
        name: "session-id",
        status: "active", 
        description: "Search LoginSession by session ID",
        code: "session-id",
        base: ["Basic"],
        type: "string",
        expression: "Basic.extension.where(url='http://atomic-fhir.org/ig/auth/StructureDefinition/session-id').value",
        xpath: "f:Basic/f:extension[@url='http://atomic-fhir.org/ig/auth/StructureDefinition/session-id']/f:valueString",
        xpathUsage: "normal"
      },
      {
        resourceType: "SearchParameter",
        id: "login-session-authorization-code",
        url: "http://atomic-fhir.org/ig/auth/SearchParameter/login-session-authorization-code",
        name: "authorization-code",
        status: "active",
        description: "Search LoginSession by authorization code",
        code: "authorization-code", 
        base: ["Basic"],
        type: "string",
        expression: "Basic.extension.where(url='http://atomic-fhir.org/ig/auth/StructureDefinition/authorization-code').value",
        xpath: "f:Basic/f:extension[@url='http://atomic-fhir.org/ig/auth/StructureDefinition/authorization-code']/f:valueString",
        xpathUsage: "normal"
      }
    ];

    // Register search parameters with storage
    for (const searchParam of searchParams) {
      try {
        context.storage?.registerSearchParameter?.(searchParam);
      } catch (error) {
        console.warn(`[Atomic Auth] Failed to register search parameter ${searchParam.code}:`, error);
      }
    }

    console.log(`[Atomic Auth] Registered ${searchParams.length} search parameters`);
  }
};

// Create custom seed provider that handles password hashing
export class AtomicAuthSeedProvider implements SeedProvider {
  name = "atomic.fhir.auth";
  version = "1.0.0";

  async getSeedBundles(): Promise<SeedBundle[]> {
    // Load the seed bundle using fs/promises
    const seedPath = join(__dirname, 'seeds', 'init-bundle.json');
    
    try {
      const content = await readFile(seedPath, 'utf8');
      const bundle = JSON.parse(content);
      
      return bundle.resourceType === 'Bundle' ? [bundle] : [];
    } catch (error) {
      console.warn('[Atomic Auth] Failed to load seed bundle:', error);
      return [];
    }
  }

  async preprocessResource(resource: any): Promise<any> {
    const processed = JSON.parse(JSON.stringify(resource));

    if (resource.resourceType === 'Basic') {
      const code = resource.code?.coding?.[0]?.code;
      
      if (code === 'user') {
        // Hash password if it's not already hashed
        const passwordHash = this.getExtensionValue(processed, 'password-hash');
        if (passwordHash && !passwordHash.startsWith('$2b$')) {
          const hashedPassword = await bcrypt.hash(passwordHash, 10);
          this.setExtensionValue(processed, 'password-hash', hashedPassword);
        }
      } else if (code === 'client') {
        // Hash client secret if it's not already hashed
        const clientSecret = this.getExtensionValue(processed, 'client-secret');
        if (clientSecret && !clientSecret.startsWith('$2b$')) {
          const hashedSecret = await bcrypt.hash(clientSecret, 10);
          this.setExtensionValue(processed, 'client-secret', hashedSecret);
        }
      }
    }

    return processed;
  }

  async validateResource(resource: any): Promise<void> {
    if (!resource.resourceType) {
      throw new Error('Resource missing resourceType');
    }

    if (!resource.id) {
      throw new Error('Resource missing id');
    }

    if (resource.resourceType === 'Basic') {
      if (!resource.code) {
        throw new Error('Basic resource missing code');
      }
      
      const code = resource.code.coding?.[0]?.code;
      if (!['user', 'client', 'token', 'login-session'].includes(code)) {
        throw new Error(`Unknown Basic resource code: ${code}`);
      }
    }
  }

  private getExtensionValue(resource: any, urlSuffix: string): string | null {
    const fullUrl = `http://atomic-fhir.org/ig/auth/StructureDefinition/${urlSuffix}`;
    const extension = resource.extension?.find((ext: any) => ext.url === fullUrl);
    return extension?.valueString || extension?.valueBoolean || null;
  }

  private setExtensionValue(resource: any, urlSuffix: string, value: any): void {
    const fullUrl = `http://atomic-fhir.org/ig/auth/StructureDefinition/${urlSuffix}`;
    const extension = resource.extension?.find((ext: any) => ext.url === fullUrl);
    
    if (extension) {
      if (typeof value === 'boolean') {
        extension.valueBoolean = value;
        delete extension.valueString;
      } else {
        extension.valueString = value;
        delete extension.valueBoolean;
      }
    }
  }
}