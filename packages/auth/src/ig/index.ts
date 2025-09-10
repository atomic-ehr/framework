import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PackageDefinition } from "@atomic-fhir/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ATOMIC_AUTH_PACKAGE_DEFINITION: PackageDefinition = {
  package: "atomic.fhir.auth",
  version: "1.0.0",
  npmRegistry: undefined, // Local package
  remoteUrl: undefined,   // Local package
};

export function getAtomicAuthPackagePath(): string {
  return join(__dirname, "package");
}

export async function registerAtomicAuthPackage(packageManager: any): Promise<void> {
  try {
    const packagePath = getAtomicAuthPackagePath();
    
    // Register the package directly from local path
    await packageManager.loadLocalPackage(packagePath, {
      package: "atomic.fhir.auth",
      version: "1.0.0"
    });

    console.log("[Atomic Auth] Successfully registered embedded FHIR IG package");
  } catch (error) {
    console.error("[Atomic Auth] Failed to register embedded FHIR IG package:", error);
    throw error;
  }
}

export const ATOMIC_AUTH_SEARCH_PARAMETERS = [
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

export function registerSearchParameters(storage: any): void {
  for (const searchParam of ATOMIC_AUTH_SEARCH_PARAMETERS) {
    try {
      storage.registerSearchParameter(searchParam);
    } catch (error) {
      console.warn(`[Atomic Auth] Failed to register search parameter ${searchParam.code}:`, error);
    }
  }
}