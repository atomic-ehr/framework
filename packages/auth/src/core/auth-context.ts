import type { HandlerContext } from "@atomic-fhir/core";
import type {
	AuthenticatedContext,
	AuthenticatedUser,
} from "../types/index.ts";
import {
	FHIRPermissionManager,
	type PermissionContext,
} from "./permissions.ts";

/**
 * Core authentication context class for managing authentication state
 * and providing permission checking utilities throughout the request lifecycle.
 */
export class AuthContext {
	public readonly user?: AuthenticatedUser;
	public readonly isAuthenticated: boolean;
	private readonly permissionManager: FHIRPermissionManager;

	constructor(
		user?: AuthenticatedUser,
		permissionManager?: FHIRPermissionManager,
	) {
		this.user = user;
		this.isAuthenticated = Boolean(user);
		this.permissionManager = permissionManager || new FHIRPermissionManager();
	}

	/**
	 * Check if user has permission for a specific FHIR resource and operation
	 *
	 * @param resourceType - FHIR resource type (e.g., 'Patient', 'Observation')
	 * @param operation - FHIR operation (e.g., 'read', 'create', 'search')
	 * @param resourceData - Optional resource data for conditional permission checks
	 * @param context - Optional permission context for additional validation
	 * @returns True if user has permission, false otherwise
	 */
	checkPermission(
		resourceType: string,
		operation: string,
		resourceData?: any,
		context?: PermissionContext,
	): boolean {
		if (!this.user || !this.isAuthenticated) {
			return false;
		}

		const result = this.permissionManager.evaluatePermission(
			this.user,
			resourceType,
			operation,
			resourceData,
			context,
		);

		return result.allowed;
	}

	/**
	 * Check if user has a specific role
	 *
	 * @param role - Role name to check
	 * @returns True if user has the role
	 */
	hasRole(role: string): boolean {
		if (!this.user || !this.isAuthenticated) {
			return false;
		}

		return this.user.roles.includes(role);
	}

	/**
	 * Check if user has a specific permission string
	 * Supports dot notation like 'patient.read', 'observation.create'
	 *
	 * @param permission - Permission string to check
	 * @returns True if user has the permission
	 */
	hasPermission(permission: string): boolean {
		if (!this.user || !this.isAuthenticated) {
			return false;
		}

		// Handle dot notation permissions (e.g., 'patient.read')
		const parts = permission.split(".");
		if (parts.length === 2) {
			const [resourceType, operation] = parts;
			return this.checkPermission(resourceType, operation);
		}

		// Handle global permissions
		const permissions = this.user.permissions;
		switch (permission.toLowerCase()) {
			case "read":
				return permissions.canRead ?? false;
			case "write":
				return permissions.canWrite ?? false;
			case "delete":
				return permissions.canDelete ?? false;
			default:
				// Check custom permissions
				return permissions.custom?.[permission] ?? false;
		}
	}

	/**
	 * Check if user can access a specific resource type and operation
	 * Alias for checkPermission for better readability
	 *
	 * @param resourceType - FHIR resource type
	 * @param operation - FHIR operation
	 * @param resourceData - Optional resource data
	 * @param context - Optional permission context
	 * @returns True if access is allowed
	 */
	canAccess(
		resourceType: string,
		operation: string,
		resourceData?: any,
		context?: PermissionContext,
	): boolean {
		return this.checkPermission(resourceType, operation, resourceData, context);
	}

	/**
	 * Get detailed permission result with reasoning and performance metrics
	 *
	 * @param resourceType - FHIR resource type
	 * @param operation - FHIR operation
	 * @param resourceData - Optional resource data
	 * @param context - Optional permission context
	 * @returns Detailed permission result
	 */
	getPermissionResult(
		resourceType: string,
		operation: string,
		resourceData?: any,
		context?: PermissionContext,
	) {
		if (!this.user || !this.isAuthenticated) {
			return {
				allowed: false,
				reason: "User not authenticated",
				appliedRules: [],
				performance: {
					evaluationTimeMs: 0,
					rulesEvaluated: 0,
					cacheHit: false,
				},
			};
		}

		return this.permissionManager.evaluatePermission(
			this.user,
			resourceType,
			operation,
			resourceData,
			context,
		);
	}

	/**
	 * Get effective permissions for the current user
	 */
	getEffectivePermissions() {
		if (!this.user || !this.isAuthenticated) {
			return {
				global: { canRead: false, canWrite: false, canDelete: false },
				resources: {},
				operations: {},
				inheritedFrom: [],
				computedAt: new Date(),
			};
		}

		return this.permissionManager.getEffectivePermissions(this.user);
	}

	/**
	 * Get all roles for the authenticated user
	 *
	 * @returns Array of user roles, empty array if not authenticated
	 */
	getRoles(): string[] {
		return this.user?.roles ?? [];
	}

	/**
	 * Get user metadata
	 *
	 * @returns User metadata object or undefined
	 */
	getMetadata(): Record<string, any> | undefined {
		return this.user?.metadata;
	}
}

/**
 * Create an authentication context from an authenticated user
 *
 * @param user - Authenticated user or undefined for anonymous context
 * @param permissionManager - Optional permission manager instance
 * @returns New AuthContext instance
 */
export function createAuthContext(
	user?: AuthenticatedUser,
	permissionManager?: FHIRPermissionManager,
): AuthContext {
	return new AuthContext(user, permissionManager);
}

/**
 * Enhance a handler context with authentication capabilities
 *
 * @param context - Original handler context
 * @param authContext - Authentication context to merge
 * @returns Enhanced context with authentication methods
 */
export function enhanceContext(
	context: HandlerContext,
	authContext: AuthContext,
): AuthenticatedContext {
	return {
		...context,
		user: authContext.user,
		isAuthenticated: authContext.isAuthenticated,
		checkPermission: (
			resource: string,
			operation: string,
			resourceData?: any,
		) => authContext.checkPermission(resource, operation, resourceData),
		hasRole: (role: string) => authContext.hasRole(role),
		hasPermission: (permission: string) =>
			authContext.hasPermission(permission),
	};
}

/**
 * Create an enhanced context directly from user and original context
 * Convenience function that combines createAuthContext and enhanceContext
 *
 * @param context - Original handler context
 * @param user - Authenticated user or undefined
 * @param permissionManager - Optional permission manager instance
 * @returns Enhanced context with authentication methods
 */
export function createAuthenticatedContext(
	context: HandlerContext,
	user?: AuthenticatedUser,
	permissionManager?: FHIRPermissionManager,
): AuthenticatedContext {
	const authContext = createAuthContext(user, permissionManager);
	return enhanceContext(context, authContext);
}

/**
 * Permission checking utility functions for common use cases
 */
export const PermissionUtils = {
	/**
	 * Check if user can read any resource
	 */
	canReadAny(user?: AuthenticatedUser): boolean {
		return user?.permissions.canRead ?? false;
	},

	/**
	 * Check if user can write any resource
	 */
	canWriteAny(user?: AuthenticatedUser): boolean {
		return user?.permissions.canWrite ?? false;
	},

	/**
	 * Check if user can delete any resource
	 */
	canDeleteAny(user?: AuthenticatedUser): boolean {
		return user?.permissions.canDelete ?? false;
	},

	/**
	 * Check if user has admin role
	 */
	isAdmin(user?: AuthenticatedUser): boolean {
		return user?.roles.includes("admin") ?? false;
	},

	/**
	 * Check if user has any of the specified roles
	 */
	hasAnyRole(user: AuthenticatedUser | undefined, roles: string[]): boolean {
		if (!user) return false;
		return roles.some((role) => user.roles.includes(role));
	},

	/**
	 * Check if user has all of the specified roles
	 */
	hasAllRoles(user: AuthenticatedUser | undefined, roles: string[]): boolean {
		if (!user) return false;
		return roles.every((role) => user.roles.includes(role));
	},

	/**
	 * Get permitted resource types for a specific operation
	 */
	getPermittedResources(
		user: AuthenticatedUser | undefined,
		operation: string,
	): string[] {
		if (!user?.permissions.resources) return [];

		const permitted: string[] = [];
		for (const [resourceType, perms] of Object.entries(
			user.permissions.resources,
		)) {
			if ((perms as any)[operation] === true) {
				permitted.push(resourceType);
			}
		}
		return permitted;
	},
};
