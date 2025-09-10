import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SmartServerSeedProvider {
  name = "smart-fhir-server";
  version = "1.0.0";

  async getSeedBundles() {
    try {
      const seedPath = join(__dirname, "seeds", "init-bundle.json");
      const content = await readFile(seedPath, 'utf8');
      const bundle = JSON.parse(content);
      
      if (bundle.resourceType === 'Bundle') {
        return [bundle];
      }
      
      return [];
    } catch (error) {
      console.warn(`[SmartServer] Failed to load seed bundle:`, error);
      return [];
    }
  }

  async preprocessResource(resource) {
    // Hash passwords if they are plain text
    if (resource.resourceType === 'Basic') {
      const code = resource.code?.coding?.[0]?.code;
      
      if (code === 'user') {
        // Hash password if it's not already hashed
        const passwordExt = resource.extension?.find(ext => 
          ext.url === 'http://atomic-fhir.org/ig/auth/StructureDefinition/password-hash'
        );
        
        if (passwordExt?.valueString && !passwordExt.valueString.startsWith('$2b$')) {
          // Plain text password - hash it
          passwordExt.valueString = await bcrypt.hash(passwordExt.valueString, 10);
        }
      } else if (code === 'client') {
        // Hash client secret if it's not already hashed
        const secretExt = resource.extension?.find(ext => 
          ext.url === 'http://atomic-fhir.org/ig/auth/StructureDefinition/client-secret'
        );
        
        if (secretExt?.valueString && !secretExt.valueString.startsWith('$2b$')) {
          // Plain text secret - hash it
          secretExt.valueString = await bcrypt.hash(secretExt.valueString, 10);
        }
      }
    }
    
    return resource;
  }
}

export default new SmartServerSeedProvider();