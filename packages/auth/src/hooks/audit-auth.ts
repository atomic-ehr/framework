import { defineHook, type HandlerContext } from "@atomic-fhir/core";
import {
	type AuditManager,
	type AuthAuditEventType,
	createAuditEvent,
	createPermissionCheckEvent,
} from "../core/audit-logging.ts";
import type { AuthenticatedContext } from "../types/index.ts";

// ============================================================================
// Global Audit Manager Instance
// ============================================================================

let globalAuditManager: AuditManager | null = null;

/**
 * Set the global audit manager instance
 */
export function setAuditManager(manager: AuditManager): void {
	globalAuditManager = manager;
}

/**
 * Get the global audit manager instance
 */
export function getAuditManager(): AuditManager | null {
	return globalAuditManager;
}

// ============================================================================
// Audit Hook Factory Functions
// ============================================================================

/**
 * Create audit hook for FHIR resource operations
 */
export function createResourceAuditHook(
	options: {
		operation: string;
		eventType: AuthAuditEventType;
		priority?: number;
		resources?: string | string[];
	} = { operation: "unknown", eventType: "permission_check" },
) {
	return defineHook({
		name: `audit-${options.operation}-${options.eventType}`,
		type: "beforeCreate" as any, // This would be dynamically set based on operation
		resources: options.resources || "*",
		priority: options.priority || 1000, // High priority to run early

		async handler(resource: any, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return resource; // No audit manager configured, skip logging
			}

			// Extract operation from hook type or use provided operation
			const operation = options.operation;
			const resourceType = resource?.resourceType || "Unknown";

			// Cast context to AuthenticatedContext for permission checking
			const authContext = context as AuthenticatedContext;

			// Check if user has permission for this operation
			let hasPermission = false;
			let permissionReason: string | undefined;

			try {
				hasPermission =
					authContext.checkPermission?.(resourceType, operation, resource) ||
					false;
				if (!hasPermission) {
					permissionReason = `Access denied for ${operation} on ${resourceType}`;
				}
			} catch (error) {
				permissionReason = `Permission check failed: ${error}`;
			}

			// Create and log audit event
			const auditEvent = createPermissionCheckEvent(
				authContext.user,
				resourceType,
				operation,
				hasPermission,
				permissionReason,
				authContext,
			);

			await auditManager.log(auditEvent);

			// If permission denied, we could throw an error here
			// For now, just log and continue
			return resource;
		},
	});
}

/**
 * Create audit hook for read operations
 */
export function createReadAuditHook(
	resources: string | string[] = "*",
	priority: number = 1000,
) {
	return defineHook({
		name: "audit-read-permission",
		type: "beforeRead" as any,
		resources,
		priority,

		async handler(resourceId: string, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return; // No audit manager configured
			}

			// Extract resource type from context or request
			const resourceType = extractResourceTypeFromContext(context) || "Unknown";

			// Cast context and check permission
			const authContext = context as AuthenticatedContext;
			const hasPermission =
				authContext.checkPermission?.(resourceType, "read") || false;

			// Create audit event
			const auditEvent = createPermissionCheckEvent(
				authContext.user,
				resourceType,
				"read",
				hasPermission,
				hasPermission
					? undefined
					: `Read access denied for ${resourceType}/${resourceId}`,
				authContext,
			);

			await auditManager.log(auditEvent);
		},
	});
}

/**
 * Create audit hook for create operations
 */
export function createCreateAuditHook(
	resources: string | string[] = "*",
	priority: number = 1000,
) {
	return defineHook({
		name: "audit-create-permission",
		type: "beforeCreate" as any,
		resources,
		priority,

		async handler(resource: any, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return resource;
			}

			const resourceType = resource?.resourceType || "Unknown";
			const authContext = context as AuthenticatedContext;
			const hasPermission =
				authContext.checkPermission?.(resourceType, "create", resource) ||
				false;

			const auditEvent = createPermissionCheckEvent(
				authContext.user,
				resourceType,
				"create",
				hasPermission,
				hasPermission ? undefined : `Create access denied for ${resourceType}`,
				authContext,
			);

			await auditManager.log(auditEvent);
			return resource;
		},
	});
}

/**
 * Create audit hook for update operations
 */
export function createUpdateAuditHook(
	resources: string | string[] = "*",
	priority: number = 1000,
) {
	return defineHook({
		name: "audit-update-permission",
		type: "beforeUpdate" as any,
		resources,
		priority,

		async handler(resource: any, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return resource;
			}

			const resourceType = resource?.resourceType || "Unknown";
			const resourceId = resource?.id || "unknown";
			const authContext = context as AuthenticatedContext;
			const hasPermission =
				authContext.checkPermission?.(resourceType, "update", resource) ||
				false;

			const auditEvent = createPermissionCheckEvent(
				authContext.user,
				resourceType,
				"update",
				hasPermission,
				hasPermission
					? undefined
					: `Update access denied for ${resourceType}/${resourceId}`,
				authContext,
			);

			// Add additional metadata for updates
			auditEvent.metadata = {
				...auditEvent.metadata,
				resourceId,
				hasResourceData: Boolean(resource),
				resourceVersion: resource?.meta?.versionId,
				lastModified: resource?.meta?.lastUpdated,
			};

			await auditManager.log(auditEvent);
			return resource;
		},
	});
}

/**
 * Create audit hook for delete operations
 */
export function createDeleteAuditHook(
	resources: string | string[] = "*",
	priority: number = 1000,
) {
	return defineHook({
		name: "audit-delete-permission",
		type: "beforeDelete" as any,
		resources,
		priority,

		async handler(resourceId: string, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return;
			}

			const resourceType = extractResourceTypeFromContext(context) || "Unknown";
			const authContext = context as AuthenticatedContext;
			const hasPermission =
				authContext.checkPermission?.(resourceType, "delete") || false;

			const auditEvent = createPermissionCheckEvent(
				authContext.user,
				resourceType,
				"delete",
				hasPermission,
				hasPermission
					? undefined
					: `Delete access denied for ${resourceType}/${resourceId}`,
				authContext,
			);

			// Mark as critical severity for delete operations
			if (hasPermission) {
				auditEvent.severity = "warning"; // Successful deletes should be warned
			}

			auditEvent.metadata = {
				...auditEvent.metadata,
				resourceId,
				operation: "delete",
			};

			await auditManager.log(auditEvent);
		},
	});
}

/**
 * Create audit hook for search operations
 */
export function createSearchAuditHook(
	resources: string | string[] = "*",
	priority: number = 1000,
) {
	return defineHook({
		name: "audit-search-permission",
		type: "beforeSearch" as any,
		resources,
		priority,

		async handler(searchParams: any, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return searchParams;
			}

			const resourceType = extractResourceTypeFromContext(context) || "Unknown";
			const authContext = context as AuthenticatedContext;
			const hasPermission =
				authContext.checkPermission?.(resourceType, "search-type") || false;

			const auditEvent = createPermissionCheckEvent(
				authContext.user,
				resourceType,
				"search-type",
				hasPermission,
				hasPermission ? undefined : `Search access denied for ${resourceType}`,
				authContext,
			);

			// Add search parameters to metadata (be careful with sensitive data)
			const sanitizedParams = sanitizeSearchParams(searchParams);
			auditEvent.metadata = {
				...auditEvent.metadata,
				searchParameters: sanitizedParams,
				parameterCount: Object.keys(searchParams || {}).length,
			};

			await auditManager.log(auditEvent);
			return searchParams;
		},
	});
}

// ============================================================================
// Comprehensive Audit Hook (All Operations)
// ============================================================================

/**
 * Create a comprehensive audit hook that covers all FHIR operations
 */
export function createComprehensiveAuditHook(
	options: {
		resources?: string | string[];
		priority?: number;
		includeOperations?: string[];
		excludeOperations?: string[];
		logLevel?: "minimal" | "detailed";
	} = {},
) {
	const {
		resources = "*",
		priority = 1000,
		includeOperations,
		excludeOperations = [],
		logLevel = "minimal",
	} = options;

	return defineHook({
		name: "comprehensive-audit-logger",
		type: "beforeCreate" as any, // This would need to be adapted for the actual hook system
		resources,
		priority,

		async handler(resource: any, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return resource;
			}

			// Determine operation from context or hook type
			const operation = extractOperationFromContext(context) || "unknown";

			// Check if this operation should be audited
			if (includeOperations && !includeOperations.includes(operation)) {
				return resource;
			}

			if (excludeOperations.includes(operation)) {
				return resource;
			}

			const resourceType =
				resource?.resourceType ||
				extractResourceTypeFromContext(context) ||
				"Unknown";

			// Check permission
			let hasPermission = false;
			let permissionDetails: any = {};

			try {
				const authContext = context as AuthenticatedContext;
				if ((authContext as any).getPermissionResult) {
					// Get detailed permission result
					const result = (authContext as any).getPermissionResult(
						resourceType,
						operation,
						resource,
					);
					hasPermission = result.allowed;
					permissionDetails = {
						reason: result.reason,
						appliedRules: result.appliedRules,
						evaluationTime: result.performance?.evaluationTimeMs,
						cacheHit: result.performance?.cacheHit,
					};
				} else {
					hasPermission =
						authContext.checkPermission?.(resourceType, operation, resource) ||
						false;
				}
			} catch (error) {
				permissionDetails.error = String(error);
			}

			// Create audit event
			const authContext = context as AuthenticatedContext;
			const auditEvent = createPermissionCheckEvent(
				authContext.user,
				resourceType,
				operation,
				hasPermission,
				hasPermission ? undefined : permissionDetails.reason,
				authContext,
			);

			// Add detailed information based on log level
			if (logLevel === "detailed") {
				auditEvent.metadata = {
					...auditEvent.metadata,
					...permissionDetails,
					resourceSize: resource ? JSON.stringify(resource).length : 0,
					resourceId: resource?.id,
					resourceVersion: resource?.meta?.versionId,
					hasAttachments: Boolean(resource?.content || resource?.data),
					compliance: authContext.user?.metadata?.complianceContext,
				};
			}

			await auditManager.log(auditEvent);
			return resource;
		},
	});
}

// ============================================================================
// Authentication Audit Hooks
// ============================================================================

/**
 * Create audit hook for authentication events
 * This would typically be called from the auth middleware
 */
export function createAuthenticationAuditHook() {
	return defineHook({
		name: "authentication-audit-logger",
		type: "beforeCreate" as any, // This is conceptual - auth hooks would be different
		resources: "*",
		priority: 2000, // Very high priority

		async handler(data: any, context: HandlerContext) {
			const auditManager = getAuditManager();
			if (!auditManager) {
				return data;
			}

			// This would be called from auth middleware with appropriate data
			// For now, just log that authentication was checked
			const auditEvent = createAuditEvent("auth_attempt", true, "auth-hook", {
				userId: (context as AuthenticatedContext).user?.id,
				username: (context as AuthenticatedContext).user?.username,
				roles: (context as AuthenticatedContext).user?.roles,
				sessionId: (context as any).sessionId,
				requestId: (context as any).requestId,
				metadata: {
					hookTriggered: true,
					resourceAccess: true,
				},
			});

			await auditManager.log(auditEvent);
			return data;
		},
	});
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract resource type from context
 */
function extractResourceTypeFromContext(
	context: HandlerContext,
): string | null {
	// This would depend on how the context carries resource type information
	// Implementation would vary based on the actual framework structure
	return (context as any).resourceType || null;
}

/**
 * Extract operation from context
 */
function extractOperationFromContext(context: HandlerContext): string | null {
	// This would depend on how the context carries operation information
	return (context as any).operation || null;
}

/**
 * Sanitize search parameters to remove sensitive data
 */
function sanitizeSearchParams(params: any): any {
	if (!params || typeof params !== "object") {
		return {};
	}

	const sanitized: any = {};
	const sensitiveFields = [
		"ssn",
		"social",
		"password",
		"token",
		"key",
		"secret",
	];

	for (const [key, value] of Object.entries(params)) {
		const lowerKey = key.toLowerCase();

		if (sensitiveFields.some((field) => lowerKey.includes(field))) {
			sanitized[key] = "[REDACTED]";
		} else if (typeof value === "string" && value.length > 100) {
			// Truncate very long values
			sanitized[key] = value.substring(0, 100) + "...";
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

// ============================================================================
// Hook Registration Helper
// ============================================================================

/**
 * Register all audit hooks at once
 */
export function registerAllAuditHooks(
	options: {
		auditManager: AuditManager;
		resources?: string | string[];
		operations?: ("create" | "read" | "update" | "delete" | "search")[];
		priority?: number;
		logLevel?: "minimal" | "detailed";
	} = { auditManager: null as any },
) {
	// Set global audit manager
	setAuditManager(options.auditManager);

	const {
		resources = "*",
		operations = ["create", "read", "update", "delete", "search"],
		priority = 1000,
		logLevel = "minimal",
	} = options;

	const hooks = [];

	// Register individual operation hooks
	if (operations.includes("create")) {
		hooks.push(createCreateAuditHook(resources, priority));
	}

	if (operations.includes("read")) {
		hooks.push(createReadAuditHook(resources, priority));
	}

	if (operations.includes("update")) {
		hooks.push(createUpdateAuditHook(resources, priority));
	}

	if (operations.includes("delete")) {
		hooks.push(createDeleteAuditHook(resources, priority));
	}

	if (operations.includes("search")) {
		hooks.push(createSearchAuditHook(resources, priority));
	}

	// Register comprehensive hook
	hooks.push(
		createComprehensiveAuditHook({
			resources,
			priority: priority - 100, // Lower priority than specific hooks
			logLevel,
		}),
	);

	// Register authentication hook
	hooks.push(createAuthenticationAuditHook());

	return hooks;
}

// ============================================================================
// Default Export
// ============================================================================

// Export a default comprehensive audit hook
export default createComprehensiveAuditHook();
