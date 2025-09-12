import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import type { SeedProvider, SeedBundle } from "@atomic-fhir/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SmartFhirSeedProvider implements SeedProvider {
  name = "smart-fhir-server";
  version = "1.0.0";

  async getSeedBundles(): Promise<SeedBundle[]> {
    // Load the seed bundle for users and clients
    const seedPath = join(__dirname, 'seeds', 'auth-init-bundle.json');
    
    try {
      const content = await readFile(seedPath, 'utf8');
      const bundle = JSON.parse(content);
      
      return bundle.resourceType === 'Bundle' ? [bundle] : [];
    } catch (error) {
      console.warn('[Smart FHIR Server] Failed to load seed bundle:', error);
      return [];
    }
  }

  async preprocessResource(resource: any): Promise<any> {
    const processed = JSON.parse(JSON.stringify(resource));

    console.log(`[Smart FHIR Server] Processing resource: ${resource.resourceType}/${resource.id}`);

    if (resource.resourceType === 'Basic') {
      const code = resource.code?.coding?.[0]?.code;
      console.log(`[Smart FHIR Server] Basic resource code: ${code}`);
      
      if (code === 'user') {
        const username = this.getExtensionValue(processed, 'username');
        const passwordHash = this.getExtensionValue(processed, 'password-hash');
        console.log(`[Smart FHIR Server] User: ${username}, Password hash: ${passwordHash}`);
        
        // Never rehash passwords that are already bcrypt hashes
        if (passwordHash && passwordHash.startsWith('$2b$')) {
          console.log(`[Smart FHIR Server] Password already hashed for user: ${username} - keeping as is`);
        } else if (passwordHash) {
          console.log(`[Smart FHIR Server] Hashing plain text password for user: ${username}`);
          const hashedPassword = await bcrypt.hash(passwordHash, 10);
          this.setExtensionValue(processed, 'password-hash', hashedPassword);
        }
      } else if (code === 'client') {
        const clientId = this.getExtensionValue(processed, 'client-id');
        const clientSecret = this.getExtensionValue(processed, 'client-secret');
        console.log(`[Smart FHIR Server] Client: ${clientId}, Secret exists: ${!!clientSecret}`);
        
        // Never rehash secrets that are already bcrypt hashes
        if (clientSecret && clientSecret.startsWith('$2b$')) {
          console.log(`[Smart FHIR Server] Client secret already hashed for: ${clientId} - keeping as is`);
        } else if (clientSecret) {
          console.log(`[Smart FHIR Server] Hashing plain text secret for client: ${clientId}`);
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
      if (!['user', 'client'].includes(code)) {
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

export default new SmartFhirSeedProvider();