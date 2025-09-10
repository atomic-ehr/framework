import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import type { HandlerContext } from "@atomic-fhir/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SeedingOptions {
  force?: boolean; // Force re-seeding even if data exists
  skipExisting?: boolean; // Skip resources that already exist (default: true)
  validateOnly?: boolean; // Only validate the bundle, don't actually seed
}

export interface SeedingResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function seedAuthData(
  context: HandlerContext,
  options: SeedingOptions = {}
): Promise<SeedingResult> {
  const result: SeedingResult = {
    success: false,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  try {
    console.log('[Auth Seeding] Starting authentication data seeding...');

    // Load init bundle
    const initBundle = await loadInitBundle();
    if (!initBundle || !initBundle.entry) {
      throw new Error('Failed to load init bundle');
    }

    console.log(`[Auth Seeding] Processing ${initBundle.entry.length} resources...`);

    // Process each resource in the bundle
    for (const entry of initBundle.entry) {
      if (!entry.resource) {
        result.errors.push('Bundle entry missing resource');
        continue;
      }

      try {
        result.processed++;
        const resource = entry.resource;
        
        if (options.validateOnly) {
          // Just validate the resource
          await validateResource(resource);
          console.log(`[Auth Seeding] Validated ${resource.resourceType}/${resource.id}`);
          continue;
        }

        // Check if resource already exists
        const existing = await findExistingResource(resource, context);
        
        if (existing && !options.force) {
          if (options.skipExisting !== false) {
            result.skipped++;
            console.log(`[Auth Seeding] Skipping existing ${resource.resourceType}/${resource.id}`);
            continue;
          }
        }

        // Process the resource based on type
        if (existing && !options.force) {
          // Update existing resource
          await updateResource(resource, existing, context);
          result.updated++;
          console.log(`[Auth Seeding] Updated ${resource.resourceType}/${resource.id}`);
        } else {
          // Create new resource
          await createResource(resource, context);
          result.created++;
          console.log(`[Auth Seeding] Created ${resource.resourceType}/${resource.id}`);
        }

      } catch (error) {
        const errorMessage = `Failed to process resource ${entry.resource?.resourceType}/${entry.resource?.id}: ${error.message}`;
        result.errors.push(errorMessage);
        console.error('[Auth Seeding]', errorMessage);
      }
    }

    result.success = result.errors.length === 0;

    console.log('[Auth Seeding] Seeding completed:', {
      success: result.success,
      processed: result.processed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length
    });

    return result;

  } catch (error) {
    console.error('[Auth Seeding] Seeding failed:', error);
    result.errors.push(`Seeding failed: ${error.message}`);
    result.success = false;
    return result;
  }
}

async function loadInitBundle(): Promise<any> {
  try {
    const bundlePath = join(__dirname, 'init-bundle.json');
    const bundleContent = readFileSync(bundlePath, 'utf8');
    return JSON.parse(bundleContent);
  } catch (error) {
    throw new Error(`Failed to load init bundle: ${error.message}`);
  }
}

async function validateResource(resource: any): Promise<void> {
  if (!resource.resourceType) {
    throw new Error('Resource missing resourceType');
  }

  if (!resource.id) {
    throw new Error('Resource missing id');
  }

  // Validate resource-specific requirements
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

async function findExistingResource(resource: any, context: HandlerContext): Promise<any> {
  try {
    if (resource.resourceType === 'Basic') {
      const code = resource.code.coding?.[0]?.code;
      
      if (code === 'user') {
        // Find by username
        const username = getExtensionValue(resource, 'username');
        if (username) {
          const bundle = await context.storage.search('Basic', { username });
          return bundle?.entry?.[0]?.resource || null;
        }
      } else if (code === 'client') {
        // Find by client_id
        const clientId = getExtensionValue(resource, 'client-id');
        if (clientId) {
          const bundle = await context.storage.search('Basic', { 'client-id': clientId });
          return bundle?.entry?.[0]?.resource || null;
        }
      }
    }

    // Fallback: try to read by ID
    return await context.storage.read(resource.resourceType, resource.id);
  } catch (error) {
    // Resource doesn't exist or search failed
    return null;
  }
}

async function createResource(resource: any, context: HandlerContext): Promise<void> {
  // Pre-process resource before creation
  const processedResource = await preprocessResource(resource);
  
  await context.storage.create(resource.resourceType, processedResource);
}

async function updateResource(resource: any, existing: any, context: HandlerContext): Promise<void> {
  // Pre-process resource before update
  const processedResource = await preprocessResource(resource);
  
  // Merge with existing resource to preserve any additional data
  const updatedResource = {
    ...existing,
    ...processedResource,
    id: existing.id // Preserve the existing ID
  };
  
  await context.storage.update(resource.resourceType, existing.id, updatedResource);
}

async function preprocessResource(resource: any): Promise<any> {
  const processed = JSON.parse(JSON.stringify(resource)); // Deep clone

  if (resource.resourceType === 'Basic') {
    const code = resource.code.coding?.[0]?.code;
    
    if (code === 'user') {
      // Hash password if it's not already hashed
      const passwordHash = getExtensionValue(processed, 'password-hash');
      if (passwordHash && !passwordHash.startsWith('$2b$')) {
        // Plain text password - hash it
        const hashedPassword = await bcrypt.hash(passwordHash, 10);
        setExtensionValue(processed, 'password-hash', hashedPassword);
      }
    } else if (code === 'client') {
      // Hash client secret if it's not already hashed
      const clientSecret = getExtensionValue(processed, 'client-secret');
      if (clientSecret && !clientSecret.startsWith('$2b$')) {
        // Plain text secret - hash it
        const hashedSecret = await bcrypt.hash(clientSecret, 10);
        setExtensionValue(processed, 'client-secret', hashedSecret);
      }
    }
  }

  return processed;
}

function getExtensionValue(resource: any, urlSuffix: string): string | null {
  const fullUrl = `http://atomic-fhir.org/ig/auth/StructureDefinition/${urlSuffix}`;
  const extension = resource.extension?.find((ext: any) => ext.url === fullUrl);
  return extension?.valueString || extension?.valueBoolean || null;
}

function setExtensionValue(resource: any, urlSuffix: string, value: any): void {
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

// CLI integration helper
export function shouldRunSeeding(args: string[]): boolean {
  return args.includes('--seed') || args.includes('--force-seed');
}

export function getSeedingOptions(args: string[]): SeedingOptions {
  return {
    force: args.includes('--force-seed'),
    skipExisting: !args.includes('--force-seed'),
    validateOnly: args.includes('--validate-seeds')
  };
}

// Auto-seeding check
export async function checkAndRunAutoSeeding(context: HandlerContext): Promise<boolean> {
  try {
    // Check if any users exist
    const userBundle = await context.storage.search('Basic', {
      code: 'user'
    });

    if (!userBundle?.entry || userBundle.entry.length === 0) {
      console.log('[Auth Seeding] No users found. Running automatic seeding...');
      
      const result = await seedAuthData(context, { skipExisting: true });
      
      if (result.success) {
        console.log('[Auth Seeding] Automatic seeding completed successfully');
        return true;
      } else {
        console.error('[Auth Seeding] Automatic seeding failed:', result.errors);
        return false;
      }
    }
    
    return false; // No seeding needed
  } catch (error) {
    console.error('[Auth Seeding] Auto-seeding check failed:', error);
    return false;
  }
}

// Export default seed passwords for documentation
export const DEFAULT_SEED_CREDENTIALS = {
  admin: {
    username: 'admin',
    password: 'admin123', // Default: $2b$10$K8WfzRQoMKUL8n8XcHYyFuGKVZ9dkRzGJX5W2x9fQJO3dY1zFnJ8e
    roles: ['admin', 'practitioner'],
    scopes: ['system/*.*', 'user/*.*', 'patient/*.*']
  },
  doctor: {
    username: 'doctor',
    password: 'doctor123', // Default: $2b$10$xqM7VfzFzN.K3sL1u4yKJ.E8Wf1kLzBqJ4rXzN8vC2mJ9qR3wE5aS
    roles: ['practitioner'],
    scopes: ['user/Patient.read', 'user/Observation.read', 'user/Encounter.read', 'patient/*.read']
  }
};

export const DEFAULT_SEED_CLIENTS = {
  'demo-public-client': {
    clientId: 'demo-public-client',
    clientType: 'public',
    redirectUris: ['http://localhost:3000/callback', 'http://localhost:8080/callback'],
    scopes: ['patient/*.read', 'user/Patient.read', 'user/Observation.read', 'launch/patient', 'offline_access']
  },
  'demo-confidential-client': {
    clientId: 'demo-confidential-client',
    clientType: 'confidential',
    clientSecret: 'demo-secret-123', // Default: $2b$10$H8BqZ7JmX5eF9.QzY4kR6uVwN2cM8dL7gS1fA3hP6oE9xT5rK2lC3
    redirectUris: ['https://app.example.com/auth/callback', 'https://app.example.com/oauth2/redirect'],
    scopes: ['system/*.*', 'user/*.*', 'patient/*.*', 'offline_access']
  }
};
