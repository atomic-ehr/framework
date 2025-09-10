import { describe, it, expect, beforeEach } from "bun:test";
import {
  parseSMARTScope,
  parseSMARTScopes,
  hasScope,
  hasAnyScope,
  hasAllScopes,
  requireScopes,
  requireAnyScope,
  scopesToPermissions,
  validateScopeString,
  normalizeScopeString,
  setSecurityContext,
  extractScopesFromToken,
  type SecurityContext
} from "../security/scopes.js";

describe("SMART Scopes", () => {
  describe("parseSMARTScope", () => {
    it("should parse valid patient scopes", () => {
      const scope = parseSMARTScope("patient/Patient.read");
      expect(scope).toEqual({
        prefix: "patient",
        resourceType: "Patient",
        permissions: ["r"],
        isLaunchContext: false,
        isWildcard: false,
        raw: "patient/Patient.read"
      });
    });

    it("should parse user wildcard scopes", () => {
      const scope = parseSMARTScope("user/*.cruds");
      expect(scope).toEqual({
        prefix: "user",
        resourceType: "*",
        permissions: ["c", "r", "u", "d", "s"],
        isLaunchContext: false,
        isWildcard: true,
        raw: "user/*.cruds"
      });
    });

    it("should parse system scopes with multiple permissions", () => {
      const scope = parseSMARTScope("system/Observation.rs");
      expect(scope).toEqual({
        prefix: "system",
        resourceType: "Observation",
        permissions: ["r", "s"],
        isLaunchContext: false,
        isWildcard: false,
        raw: "system/Observation.rs"
      });
    });

    it("should parse launch context scopes", () => {
      const scope = parseSMARTScope("launch/patient");
      expect(scope).toEqual({
        prefix: "user",
        resourceType: "patient",
        permissions: [],
        isLaunchContext: true,
        isWildcard: false,
        raw: "launch/patient"
      });
    });

    it("should parse special scopes", () => {
      const scope = parseSMARTScope("offline_access");
      expect(scope).toEqual({
        prefix: "user",
        resourceType: "special",
        permissions: [],
        isLaunchContext: false,
        isWildcard: false,
        raw: "offline_access"
      });
    });

    it("should handle wildcard permissions", () => {
      const scope = parseSMARTScope("patient/Patient.*");
      expect(scope).toEqual({
        prefix: "patient",
        resourceType: "Patient",
        permissions: ["c", "r", "u", "d", "s"],
        isLaunchContext: false,
        isWildcard: false,
        raw: "patient/Patient.*"
      });
    });

    it("should return null for invalid scopes", () => {
      expect(parseSMARTScope("invalid-scope")).toBeNull();
      expect(parseSMARTScope("patient/Patient")).toBeNull();
      expect(parseSMARTScope("patient/Patient.invalid")).toBeNull();
      expect(parseSMARTScope("")).toBeNull();
      expect(parseSMARTScope(null as any)).toBeNull();
    });

    it("should handle custom resource types with warning", () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const scope = parseSMARTScope("patient/CustomResource.read");
      
      expect(scope).toEqual({
        prefix: "patient",
        resourceType: "CustomResource",
        permissions: ["r"],
        isLaunchContext: false,
        isWildcard: false,
        raw: "patient/CustomResource.read"
      });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        "[SMART Scopes] Unknown FHIR resource type: CustomResource"
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe("parseSMARTScopes", () => {
    it("should parse space-separated scope string", () => {
      const scopes = parseSMARTScopes("patient/Patient.read user/Observation.rs");
      expect(scopes).toHaveLength(2);
      expect(scopes[0].resourceType).toBe("Patient");
      expect(scopes[1].resourceType).toBe("Observation");
    });

    it("should parse array of scopes", () => {
      const scopes = parseSMARTScopes(["patient/Patient.read", "user/Observation.rs"]);
      expect(scopes).toHaveLength(2);
      expect(scopes[0].resourceType).toBe("Patient");
      expect(scopes[1].resourceType).toBe("Observation");
    });

    it("should filter out invalid scopes", () => {
      const scopes = parseSMARTScopes("patient/Patient.read invalid-scope user/Observation.rs");
      expect(scopes).toHaveLength(2);
      expect(scopes.map(s => s.resourceType)).toEqual(["Patient", "Observation"]);
    });

    it("should handle empty input", () => {
      expect(parseSMARTScopes("")).toEqual([]);
      expect(parseSMARTScopes([])).toEqual([]);
      expect(parseSMARTScopes(null as any)).toEqual([]);
    });
  });

  describe("hasScope", () => {
    let mockRequest: Request;

    beforeEach(() => {
      mockRequest = new Request("http://test.com");
      setSecurityContext(mockRequest, {
        scopes: ["patient/Patient.read", "user/*.cruds", "launch/patient"]
      });
    });

    it("should return true for exact scope match", () => {
      expect(hasScope(mockRequest, "patient/Patient.read")).toBe(true);
    });

    it("should return true for wildcard scope match", () => {
      expect(hasScope(mockRequest, "user/Observation.read")).toBe(true);
      expect(hasScope(mockRequest, "user/Patient.create")).toBe(true);
    });

    it("should return true for launch context match", () => {
      expect(hasScope(mockRequest, "launch/patient")).toBe(true);
    });

    it("should return false for insufficient permissions", () => {
      expect(hasScope(mockRequest, "patient/Patient.write")).toBe(false);
    });

    it("should return false for missing scope", () => {
      expect(hasScope(mockRequest, "system/Patient.read")).toBe(false);
    });

    it("should handle request without security context", () => {
      const req = new Request("http://test.com");
      expect(hasScope(req, "patient/Patient.read")).toBe(false);
    });
  });

  describe("hasAnyScope and hasAllScopes", () => {
    let mockRequest: Request;

    beforeEach(() => {
      mockRequest = new Request("http://test.com");
      setSecurityContext(mockRequest, {
        scopes: ["patient/Patient.read", "user/Observation.read"]
      });
    });

    it("hasAnyScope should return true if any scope matches", () => {
      expect(hasAnyScope(mockRequest, [
        "patient/Patient.write", 
        "patient/Patient.read"
      ])).toBe(true);
    });

    it("hasAnyScope should return false if no scopes match", () => {
      expect(hasAnyScope(mockRequest, [
        "patient/Patient.write", 
        "system/Patient.read"
      ])).toBe(false);
    });

    it("hasAllScopes should return true if all scopes match", () => {
      expect(hasAllScopes(mockRequest, [
        "patient/Patient.read", 
        "user/Observation.read"
      ])).toBe(true);
    });

    it("hasAllScopes should return false if any scope is missing", () => {
      expect(hasAllScopes(mockRequest, [
        "patient/Patient.read", 
        "patient/Patient.write"
      ])).toBe(false);
    });
  });

  describe("requireScopes middleware", () => {
    let mockRequest: Request;
    let mockContext: any;

    beforeEach(() => {
      mockRequest = new Request("http://test.com");
      mockContext = {};
      setSecurityContext(mockRequest, {
        scopes: ["patient/Patient.read", "user/Observation.read"]
      });
    });

    it("should pass through when scopes are sufficient", async () => {
      const middleware = requireScopes(["patient/Patient.read"]);
      const result = await middleware(mockRequest, mockContext);
      expect(result).toBe(mockRequest);
    });

    it("should throw error when scopes are insufficient", async () => {
      const middleware = requireScopes(["patient/Patient.write"]);
      await expect(middleware(mockRequest, mockContext)).rejects.toThrow(
        "Insufficient scope"
      );
    });

    it("should handle function-based scope requirements", async () => {
      const dynamicScopes = jest.fn().mockReturnValue(["patient/Patient.read"]);
      const middleware = requireScopes(dynamicScopes);
      
      const result = await middleware(mockRequest, mockContext);
      expect(result).toBe(mockRequest);
      expect(dynamicScopes).toHaveBeenCalledWith(mockRequest);
    });

    it("should pass through when no scopes required", async () => {
      const middleware = requireScopes([]);
      const result = await middleware(mockRequest, mockContext);
      expect(result).toBe(mockRequest);
    });
  });

  describe("requireAnyScope middleware", () => {
    let mockRequest: Request;
    let mockContext: any;

    beforeEach(() => {
      mockRequest = new Request("http://test.com");
      mockContext = {};
      setSecurityContext(mockRequest, {
        scopes: ["patient/Patient.read"]
      });
    });

    it("should pass through when any scope matches", async () => {
      const middleware = requireAnyScope(["patient/Patient.read", "patient/Patient.write"]);
      const result = await middleware(mockRequest, mockContext);
      expect(result).toBe(mockRequest);
    });

    it("should throw error when no scopes match", async () => {
      const middleware = requireAnyScope(["patient/Patient.write", "system/Patient.read"]);
      await expect(middleware(mockRequest, mockContext)).rejects.toThrow(
        "Insufficient scope. Required one of"
      );
    });
  });

  describe("scopesToPermissions", () => {
    it("should grant access for exact resource and operation match", () => {
      const scopes = ["patient/Patient.read"];
      expect(scopesToPermissions(scopes, "Patient", "read")).toBe(true);
    });

    it("should grant access for wildcard resource match", () => {
      const scopes = ["patient/*.read"];
      expect(scopesToPermissions(scopes, "Patient", "read")).toBe(true);
      expect(scopesToPermissions(scopes, "Observation", "read")).toBe(true);
    });

    it("should grant access for comprehensive permissions", () => {
      const scopes = ["user/*.*"];
      expect(scopesToPermissions(scopes, "Patient", "create")).toBe(true);
      expect(scopesToPermissions(scopes, "Observation", "update")).toBe(true);
    });

    it("should map FHIR operations to SMART permissions correctly", () => {
      const scopes = ["patient/Patient.cruds"];
      expect(scopesToPermissions(scopes, "Patient", "create")).toBe(true);
      expect(scopesToPermissions(scopes, "Patient", "read")).toBe(true);
      expect(scopesToPermissions(scopes, "Patient", "update")).toBe(true);
      expect(scopesToPermissions(scopes, "Patient", "delete")).toBe(true);
      expect(scopesToPermissions(scopes, "Patient", "search-type")).toBe(true);
    });

    it("should deny access for insufficient permissions", () => {
      const scopes = ["patient/Patient.read"];
      expect(scopesToPermissions(scopes, "Patient", "create")).toBe(false);
      expect(scopesToPermissions(scopes, "Patient", "update")).toBe(false);
    });

    it("should handle unknown operations", () => {
      const scopes = ["patient/Patient.read"];
      expect(scopesToPermissions(scopes, "Patient", "unknown-operation")).toBe(true); // Defaults to read
    });
  });

  describe("validateScopeString", () => {
    it("should validate correct scope strings", () => {
      const result = validateScopeString("patient/Patient.read user/Observation.rs");
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should identify invalid scopes", () => {
      const result = validateScopeString("patient/Patient.read invalid-scope");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid scope format: invalid-scope");
    });

    it("should reject empty scope strings", () => {
      const result = validateScopeString("");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Scope string cannot be empty");
    });

    it("should handle whitespace correctly", () => {
      const result = validateScopeString("  patient/Patient.read   user/Observation.rs  ");
      expect(result.valid).toBe(true);
    });
  });

  describe("normalizeScopeString", () => {
    it("should remove duplicates and normalize format", () => {
      const normalized = normalizeScopeString("patient/Patient.read patient/Patient.read user/Observation.rs");
      expect(normalized).toBe("patient/Patient.read user/Observation.rs");
    });

    it("should filter out invalid scopes", () => {
      const normalized = normalizeScopeString("patient/Patient.read invalid-scope user/Observation.rs");
      expect(normalized).toBe("patient/Patient.read user/Observation.rs");
    });

    it("should handle empty strings", () => {
      expect(normalizeScopeString("")).toBe("");
    });

    it("should preserve order of first occurrence", () => {
      const normalized = normalizeScopeString("user/Patient.read patient/Patient.read user/Patient.read");
      expect(normalized).toBe("user/Patient.read patient/Patient.read");
    });
  });

  describe("extractScopesFromToken", () => {
    it("should extract scopes from OAuth2 standard format", () => {
      const token = { scope: "patient/Patient.read user/Observation.rs" };
      expect(extractScopesFromToken(token)).toEqual(["patient/Patient.read", "user/Observation.rs"]);
    });

    it("should handle array format scopes", () => {
      const token = { scopes: ["patient/Patient.read", "user/Observation.rs"] };
      expect(extractScopesFromToken(token)).toEqual(["patient/Patient.read", "user/Observation.rs"]);
    });

    it("should handle permissions format", () => {
      const token = { permissions: ["patient/Patient.read", "user/Observation.rs"] };
      expect(extractScopesFromToken(token)).toEqual(["patient/Patient.read", "user/Observation.rs"]);
    });

    it("should handle single scope/permission strings", () => {
      const token = { scopes: "patient/Patient.read" };
      expect(extractScopesFromToken(token)).toEqual(["patient/Patient.read"]);
    });

    it("should return empty array for null/undefined token", () => {
      expect(extractScopesFromToken(null)).toEqual([]);
      expect(extractScopesFromToken(undefined)).toEqual([]);
    });

    it("should return empty array for token without scopes", () => {
      expect(extractScopesFromToken({ user_id: "123" })).toEqual([]);
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle malformed scope patterns gracefully", () => {
      expect(parseSMARTScope("patient/")).toBeNull();
      expect(parseSMARTScope("/Patient.read")).toBeNull();
      expect(parseSMARTScope("patient/Patient.")).toBeNull();
      expect(parseSMARTScope("patient.Patient.read")).toBeNull();
    });

    it("should handle case sensitivity correctly", () => {
      // SMART scopes are case-sensitive
      expect(parseSMARTScope("Patient/Patient.read")).toBeNull(); // Invalid prefix
      expect(parseSMARTScope("patient/patient.read")).not.toBeNull(); // lowercase resource type (will warn but parse)
    });

    it("should handle special characters in resource types", () => {
      expect(parseSMARTScope("patient/My-Resource.read")).not.toBeNull();
      expect(parseSMARTScope("patient/My_Resource.read")).not.toBeNull();
    });
  });
});