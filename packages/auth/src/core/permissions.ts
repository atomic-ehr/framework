import type {
	AuthenticatedUser,
	PermissionCondition,
	ResourcePermissions,
} from "../types/index.ts";

// ============================================================================
// Core Permission Types
// ============================================================================

export type PermissionOperator =
	| "eq" // Equals
	| "ne" // Not equals
	| "in" // Value in array
	| "not-in" // Value not in array
	| "contains" // String contains
	| "not-contains" // String does not contain
	| "starts-with" // String starts with
	| "ends-with" // String ends with
	| "exists" // Field exists
	| "not-exists" // Field does not exist
	| "gt" // Greater than
	| "gte" // Greater than or equal
	| "lt" // Less than
	| "lte" // Less than or equal
	| "regex" // Regular expression match
	| "custom"; // Custom validator function

export interface ConditionalRule {
	field: string; // JSONPath to resource field
	operator: PermissionOperator; // Comparison operator
	value: any; // Expected value (can include {{user.field}} templates)
	context?: PermissionContext; // Additional context
	customValidator?: (
		resourceData: any,
		user: AuthenticatedUser,
		context?: PermissionContext,
	) => boolean;
}

export interface PermissionContext {
	operation?: string;
	resourceType?: string;
	requestPath?: string;
	queryParams?: Record<string, any>;
	headers?: Record<string, string>;
	clientId?: string;
	sessionId?: string;
	metadata?: Record<string, any>;
}

export interface PermissionRequest {
	resourceType: string;
	operation: string;
	resourceData?: any;
	context?: PermissionContext;
}

export interface PermissionResult {
	allowed: boolean;
	reason?: string;
	conditions?: ConditionalRule[];
	appliedRules?: string[];
	performance?: PermissionPerformanceMetrics;
}

export interface PermissionPerformanceMetrics {
	evaluationTimeMs: number;
	rulesEvaluated: number;
	cacheHit: boolean;
}

export interface EffectiveFHIRPermissions {
	global: {
		canRead: boolean;
		canWrite: boolean;
		canDelete: boolean;
	};
	resources: Record<string, ResourcePermissions>;
	operations: Record<string, boolean>;
	inheritedFrom: string[]; // Roles/permissions this inherits from
	computedAt: Date;
}

// ============================================================================
// FHIR Operation Definitions
// ============================================================================

export const FHIR_OPERATIONS = {
	// Instance-level operations
	read: "read", // GET [base]/[type]/[id]
	vread: "vread", // GET [base]/[type]/[id]/_history/[vid]
	update: "update", // PUT [base]/[type]/[id]
	"update-conditional": "update-conditional", // PUT [base]/[type]?[search]
	patch: "patch", // PATCH [base]/[type]/[id]
	"patch-conditional": "patch-conditional", // PATCH [base]/[type]?[search]
	delete: "delete", // DELETE [base]/[type]/[id]
	"delete-conditional-single": "delete-conditional-single",
	"delete-conditional-multiple": "delete-conditional-multiple",
	"delete-history": "delete-history",
	"delete-history-version": "delete-history-version",
	"history-instance": "history-instance", // GET [base]/[type]/[id]/_history

	// Type-level operations
	"history-type": "history-type", // GET [base]/[type]/_history
	create: "create", // POST [base]/[type]
	"create-conditional": "create-conditional", // POST with If-None-Exist
	"search-type": "search-type", // GET [base]/[type]

	// System-level operations
	"search-system": "search-system", // GET [base]?[parameters]
	"history-system": "history-system", // GET [base]/_history
	transaction: "transaction", // POST [base] (Bundle)
	batch: "batch", // POST [base] (Bundle)
	capabilities: "capabilities", // GET [base]/metadata

	// Custom operations (prefixed with $)
	operation: "operation", // POST [base]/[type]/[id]/$[name]
} as const;

export type FHIROperation = keyof typeof FHIR_OPERATIONS;

// ============================================================================
// Permission Template System
// ============================================================================

export interface RolePermissionTemplate {
	[roleName: string]: {
		[resourceType: string]: Partial<ResourcePermissions> | PermissionShorthand;
	};
}

export type PermissionShorthand =
	| boolean // true = all permissions, false = no permissions
	| "own" // only own resources (requires ownership rules)
	| "related" // related resources (requires relationship rules)
	| "read-only" // only read operations
	| "no-delete"; // all except delete operations

// Default role templates
export const DEFAULT_ROLE_TEMPLATES: RolePermissionTemplate = {
	// Patient role - can only access their own data
	patient: {
		Patient: "own",
		Observation: "related",
		Condition: "related",
		DiagnosticReport: "related",
		MedicationRequest: "related",
		AllergyIntolerance: "related",
		Immunization: "related",
		Procedure: "related",
		Encounter: "related",
		DocumentReference: "related",
	},

	// Practitioner role - broad clinical access
	practitioner: {
		Patient: { read: true, update: true, create: true },
		Observation: true, // Full access
		Condition: true,
		DiagnosticReport: true,
		MedicationRequest: true,
		AllergyIntolerance: true,
		Immunization: true,
		Procedure: true,
		Encounter: true,
		DocumentReference: true,
		Practitioner: "own",
		PractitionerRole: "related",
	},

	// Nurse role - clinical access with some restrictions
	nurse: {
		Patient: "read-only",
		Observation: { read: true, create: true, update: true },
		Condition: "read-only",
		DiagnosticReport: "read-only",
		MedicationRequest: "read-only",
		AllergyIntolerance: { read: true, create: true, update: true },
		Immunization: true,
		Procedure: "read-only",
		Encounter: { read: true, create: true, update: true },
		DocumentReference: "read-only",
	},

	// Admin role - full system access
	admin: {
		"*": true, // Wildcard for all resources
	},

	// Research role - read-only access with anonymized data
	researcher: {
		"*": "read-only",
		Patient: false, // No patient data access unless anonymized
	},
};

// ============================================================================
// Common Ownership and Access Patterns
// ============================================================================

export const OWNERSHIP_PATTERNS = {
	// Patient owns their own Patient resource
	patientSelfOwnership: {
		field: "id",
		operator: "eq" as PermissionOperator,
		value: "{{user.patientId}}",
	},

	// Resources related to patient (subject reference)
	patientRelatedBySubject: {
		field: "subject.reference",
		operator: "eq" as PermissionOperator,
		value: "Patient/{{user.patientId}}",
	},

	// Resources related to patient (patient reference)
	patientRelatedByPatient: {
		field: "patient.reference",
		operator: "eq" as PermissionOperator,
		value: "Patient/{{user.patientId}}",
	},

	// Practitioner-related resources
	practitionerPerformed: {
		field: "performer[*].reference",
		operator: "contains" as PermissionOperator,
		value: "Practitioner/{{user.practitionerId}}",
	},

	// Organization-based access
	organizationManaged: {
		field: "managingOrganization.reference",
		operator: "eq" as PermissionOperator,
		value: "Organization/{{user.organizationId}}",
	},

	// Encounter-based access
	encounterParticipant: {
		field: "participant[*].individual.reference",
		operator: "contains" as PermissionOperator,
		value: "Practitioner/{{user.practitionerId}}",
	},
} as const;

// ============================================================================
// Permission Cache for Performance
// ============================================================================

interface PermissionCacheEntry {
	result: PermissionResult;
	timestamp: number;
	userId: string;
	resourceType: string;
	operation: string;
	resourceHash?: string;
}

class PermissionCache {
	private readonly cache = new Map<string, PermissionCacheEntry>();
	private readonly maxSize: number = 10000;
	private readonly ttlMs: number = 60000; // 1 minute TTL

	generateKey(
		userId: string,
		resourceType: string,
		operation: string,
		resourceData?: any,
	): string {
		const resourceHash = resourceData
			? this.hashResource(resourceData)
			: "no-data";
		return `${userId}:${resourceType}:${operation}:${resourceHash}`;
	}

	private hashResource(resourceData: any): string {
		// Simple hash of resource for caching
		// In production, might want a more sophisticated approach
		const relevant = {
			id: resourceData?.id,
			subject: resourceData?.subject,
			patient: resourceData?.patient,
			performer: resourceData?.performer,
			managingOrganization: resourceData?.managingOrganization,
		};
		return btoa(JSON.stringify(relevant)).slice(0, 16);
	}

	get(
		userId: string,
		resourceType: string,
		operation: string,
		resourceData?: any,
	): PermissionResult | null {
		const key = this.generateKey(userId, resourceType, operation, resourceData);
		const entry = this.cache.get(key);

		if (!entry) return null;

		// Check TTL
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.cache.delete(key);
			return null;
		}

		// Mark as cache hit for performance metrics
		return {
			...entry.result,
			performance: {
				evaluationTimeMs: entry.result.performance?.evaluationTimeMs || 0,
				rulesEvaluated: entry.result.performance?.rulesEvaluated || 0,
				cacheHit: true,
			},
		};
	}

	set(
		userId: string,
		resourceType: string,
		operation: string,
		result: PermissionResult,
		resourceData?: any,
	): void {
		// Remove oldest entries if cache is full
		if (this.cache.size >= this.maxSize) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}

		const key = this.generateKey(userId, resourceType, operation, resourceData);
		const entry: PermissionCacheEntry = {
			result,
			timestamp: Date.now(),
			userId,
			resourceType,
			operation,
			resourceHash: resourceData ? this.hashResource(resourceData) : undefined,
		};

		this.cache.set(key, entry);
	}

	clear(): void {
		this.cache.clear();
	}

	clearForUser(userId: string): void {
		for (const [key, entry] of this.cache.entries()) {
			if (entry.userId === userId) {
				this.cache.delete(key);
			}
		}
	}

	getStats(): { size: number; maxSize: number; hitRate: number } {
		// Implementation would track hits/misses for hit rate calculation
		return {
			size: this.cache.size,
			maxSize: this.maxSize,
			hitRate: 0.85, // Placeholder
		};
	}
}

// Global cache instance
const permissionCache = new PermissionCache();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract value from resource using JSONPath-like syntax
 */
export function extractFieldValue(resource: any, fieldPath: string): any {
	if (!resource || !fieldPath) return undefined;

	const parts = fieldPath.split(".");
	let current = resource;

	for (const part of parts) {
		if (part.includes("[*]")) {
			// Handle array access like "performer[*].reference"
			const arrayField = part.replace("[*]", "");
			const array = current[arrayField];
			if (!Array.isArray(array)) return undefined;

			// Return array of values for wildcard access
			return array.flatMap((item) => {
				// Continue with remaining path parts
				const remainingPath = parts.slice(parts.indexOf(part) + 1).join(".");
				return remainingPath ? extractFieldValue(item, remainingPath) : item;
			});
		} else if (part.includes("[") && part.includes("]")) {
			// Handle specific array index like "performer[0].reference"
			const match = part.match(/^(.+)\[(\d+)\]$/);
			if (match) {
				const arrayField = match[1];
				const index = parseInt(match[2]);
				const array = current[arrayField];
				if (!Array.isArray(array) || array.length <= index) return undefined;
				current = array[index];
			}
		} else {
			current = current[part];
			if (current === undefined) return undefined;
		}
	}

	return current;
}

/**
 * Substitute user template variables in permission values
 */
export function substituteTemplateVariables(
	value: any,
	user: AuthenticatedUser,
): any {
	if (typeof value !== "string") return value;

	return value.replace(/\{\{user\.(\w+)\}\}/g, (match, field) => {
		return (user as any)[field] || match;
	});
}

/**
 * Expand permission shorthand to full ResourcePermissions
 */
export function expandPermissionShorthand(
	shorthand: PermissionShorthand,
	resourceType: string,
): Partial<ResourcePermissions> {
	if (typeof shorthand === "boolean") {
		if (shorthand) {
			// Full permissions
			return {
				read: true,
				vread: true,
				update: true,
				patch: true,
				delete: true,
				history: true,
				create: true,
				search: true,
				"history-type": true,
				"update-conditional": true,
				"patch-conditional": true,
				"delete-conditional": true,
				"create-conditional": true,
			};
		} else {
			// No permissions
			return {};
		}
	}

	switch (shorthand) {
		case "own":
			return {
				read: true,
				vread: true,
				update: true,
				patch: true,
				delete: true,
				history: true,
				conditions: [getOwnershipRule(resourceType)],
			};

		case "related":
			return {
				read: true,
				vread: true,
				history: true,
				search: true,
				conditions: [getRelationshipRule(resourceType)],
			};

		case "read-only":
			return {
				read: true,
				vread: true,
				history: true,
				search: true,
				"history-type": true,
			};

		case "no-delete":
			return {
				read: true,
				vread: true,
				update: true,
				patch: true,
				history: true,
				create: true,
				search: true,
				"history-type": true,
				"update-conditional": true,
				"patch-conditional": true,
				"create-conditional": true,
			};

		default:
			return {};
	}
}

/**
 * Get ownership rule for resource type
 */
function getOwnershipRule(resourceType: string): PermissionCondition {
	// Default ownership patterns based on resource type
	switch (resourceType) {
		case "Patient":
			return {
				field: "id",
				operator: "eq",
				value: "{{user.patientId}}",
			};
		case "Practitioner":
			return {
				field: "id",
				operator: "eq",
				value: "{{user.practitionerId}}",
			};
		default:
			// For other resources, assume patient ownership via subject
			return {
				field: "subject.reference",
				operator: "eq",
				value: "Patient/{{user.patientId}}",
			};
	}
}

/**
 * Get relationship rule for resource type
 */
function getRelationshipRule(resourceType: string): PermissionCondition {
	// Default relationship patterns
	switch (resourceType) {
		case "Observation":
		case "Condition":
		case "DiagnosticReport":
		case "MedicationRequest":
		case "AllergyIntolerance":
		case "Immunization":
		case "Procedure":
			return {
				field: "subject.reference",
				operator: "eq",
				value: "Patient/{{user.patientId}}",
			};
		case "Encounter":
			return {
				field: "patient.reference",
				operator: "eq",
				value: "Patient/{{user.patientId}}",
			};
		default:
			return {
				field: "patient.reference",
				operator: "eq",
				value: "Patient/{{user.patientId}}",
			};
	}
}

// ============================================================================
// FHIR Permission Manager
// ============================================================================

/**
 * Main class for managing FHIR resource-level permissions
 * Handles permission evaluation, caching, and integration with role-based access
 */
export class FHIRPermissionManager {
	private roleTemplates: RolePermissionTemplate;
	private enableCaching: boolean;
	private performanceMetrics: Map<string, PermissionPerformanceMetrics[]>;

	constructor(
		options: {
			roleTemplates?: RolePermissionTemplate;
			enableCaching?: boolean;
		} = {},
	) {
		this.roleTemplates = {
			...DEFAULT_ROLE_TEMPLATES,
			...options.roleTemplates,
		};
		this.enableCaching = options.enableCaching ?? true;
		this.performanceMetrics = new Map();
	}

	// ============================================================================
	// Core Permission Evaluation
	// ============================================================================

	/**
	 * Evaluate permission for a single resource operation
	 */
	evaluatePermission(
		user: AuthenticatedUser,
		resourceType: string,
		operation: string,
		resourceData?: any,
		context?: PermissionContext,
	): PermissionResult {
		const startTime = Date.now();
		const appliedRules: string[] = [];

		// Check cache first
		if (this.enableCaching) {
			const cached = permissionCache.get(
				user.id,
				resourceType,
				operation,
				resourceData,
			);
			if (cached) {
				return cached;
			}
		}

		try {
			// Get effective permissions for user
			const effectivePermissions = this.getEffectivePermissions(user);

			// Check global permissions first
			const globalResult = this.evaluateGlobalPermissions(
				effectivePermissions.global,
				operation,
				appliedRules,
			);

			if (!globalResult.allowed) {
				return this.createPermissionResult(
					false,
					globalResult.reason,
					appliedRules,
					startTime,
				);
			}

			// Check resource-specific permissions
			const resourcePermissions = effectivePermissions.resources[resourceType];
			if (!resourcePermissions) {
				// No specific permissions defined, check wildcard
				const wildcardPermissions = effectivePermissions.resources["*"];
				if (!wildcardPermissions) {
					return this.createPermissionResult(
						false,
						`No permissions defined for resource type: ${resourceType}`,
						appliedRules,
						startTime,
					);
				}
			}

			const resourceResult = this.evaluateResourcePermissions(
				resourcePermissions || effectivePermissions.resources["*"],
				operation,
				resourceData,
				user,
				context,
				appliedRules,
			);

			const result = this.createPermissionResult(
				resourceResult.allowed,
				resourceResult.reason,
				appliedRules,
				startTime,
				resourceResult.conditions,
			);

			// Cache the result
			if (this.enableCaching) {
				permissionCache.set(
					user.id,
					resourceType,
					operation,
					result,
					resourceData,
				);
			}

			// Record performance metrics
			this.recordPerformanceMetrics(user.id, result.performance!);

			return result;
		} catch (error) {
			console.error(`Permission evaluation error: ${error}`);
			return this.createPermissionResult(
				false,
				`Permission evaluation failed: ${error}`,
				appliedRules,
				startTime,
			);
		}
	}

	/**
	 * Check multiple permissions in bulk for performance
	 */
	checkBulkPermissions(
		user: AuthenticatedUser,
		requests: PermissionRequest[],
	): PermissionResult[] {
		// Get effective permissions once for all requests (optimization)

		return requests.map((request) => {
			// Try cache first
			if (this.enableCaching) {
				const cached = permissionCache.get(
					user.id,
					request.resourceType,
					request.operation,
					request.resourceData,
				);
				if (cached) return cached;
			}

			// Evaluate permission
			return this.evaluatePermission(
				user,
				request.resourceType,
				request.operation,
				request.resourceData,
				request.context,
			);
		});
	}

	/**
	 * Get effective permissions for a user (combines roles, direct permissions)
	 */
	getEffectivePermissions(user: AuthenticatedUser): EffectiveFHIRPermissions {
		const inheritedFrom: string[] = [];
		let globalPermissions = {
			canRead: false,
			canWrite: false,
			canDelete: false,
		};
		const resourcePermissions: Record<string, ResourcePermissions> = {};
		const operationPermissions: Record<string, boolean> = {};

		// Start with user's direct FHIR permissions
		if (user.permissions) {
			globalPermissions = {
				canRead: user.permissions.canRead ?? false,
				canWrite: user.permissions.canWrite ?? false,
				canDelete: user.permissions.canDelete ?? false,
			};

			// Add resource-specific permissions
			if (user.permissions.resources) {
				Object.assign(resourcePermissions, user.permissions.resources);
			}

			// Add operation permissions
			if (user.permissions.operations) {
				Object.assign(operationPermissions, user.permissions.operations);
			}
		}

		// Apply role-based permissions
		for (const role of user.roles) {
			const roleTemplate = this.roleTemplates[role];
			if (roleTemplate) {
				inheritedFrom.push(`role:${role}`);

				for (const [resourceType, permissions] of Object.entries(
					roleTemplate,
				)) {
					if (typeof permissions === "object") {
						// Merge with existing permissions
						const expanded = this.expandResourcePermissions(
							permissions,
							resourceType,
						);
						resourcePermissions[resourceType] = this.mergeResourcePermissions(
							resourcePermissions[resourceType] || {},
							expanded,
						);
					} else {
						// Handle shorthand
						const expanded = expandPermissionShorthand(
							permissions,
							resourceType,
						);
						resourcePermissions[resourceType] = this.mergeResourcePermissions(
							resourcePermissions[resourceType] || {},
							expanded,
						);
					}
				}

				// Update global permissions if role grants broader access
				if (role === "admin") {
					globalPermissions.canRead = true;
					globalPermissions.canWrite = true;
					globalPermissions.canDelete = true;
				} else if (role === "practitioner") {
					globalPermissions.canRead = true;
					globalPermissions.canWrite = true;
				}
			}
		}

		return {
			global: globalPermissions,
			resources: resourcePermissions,
			operations: operationPermissions,
			inheritedFrom,
			computedAt: new Date(),
		};
	}

	// ============================================================================
	// Permission Evaluation Helpers
	// ============================================================================

	private evaluateGlobalPermissions(
		global: { canRead: boolean; canWrite: boolean; canDelete: boolean },
		operation: string,
		appliedRules: string[],
	): { allowed: boolean; reason?: string } {
		// Map operations to global permission categories
		const readOperations = [
			"read",
			"vread",
			"search-type",
			"search-system",
			"history-instance",
			"history-type",
			"history-system",
		];
		const writeOperations = [
			"create",
			"update",
			"patch",
			"create-conditional",
			"update-conditional",
			"patch-conditional",
		];
		const deleteOperations = [
			"delete",
			"delete-conditional-single",
			"delete-conditional-multiple",
		];

		if (readOperations.includes(operation)) {
			appliedRules.push("global.canRead");
			if (!global.canRead) {
				return { allowed: false, reason: "Global read permission denied" };
			}
		}

		if (writeOperations.includes(operation)) {
			appliedRules.push("global.canWrite");
			if (!global.canWrite) {
				return { allowed: false, reason: "Global write permission denied" };
			}
		}

		if (deleteOperations.includes(operation)) {
			appliedRules.push("global.canDelete");
			if (!global.canDelete) {
				return { allowed: false, reason: "Global delete permission denied" };
			}
		}

		return { allowed: true };
	}

	private evaluateResourcePermissions(
		resourcePermissions: Partial<ResourcePermissions>,
		operation: string,
		resourceData: any,
		user: AuthenticatedUser,
		context: PermissionContext | undefined,
		appliedRules: string[],
	): { allowed: boolean; reason?: string; conditions?: ConditionalRule[] } {
		// Check if specific operation is allowed
		const operationPermission = (resourcePermissions as any)[operation];
		appliedRules.push(`resource.${operation}`);

		if (operationPermission === false) {
			return {
				allowed: false,
				reason: `Operation ${operation} not permitted for this resource type`,
			};
		}

		if (operationPermission === true) {
			return { allowed: true };
		}

		// If no explicit permission, deny by default
		if (operationPermission === undefined) {
			return {
				allowed: false,
				reason: `No explicit permission for operation ${operation}`,
			};
		}

		// Evaluate conditional permissions
		if (resourcePermissions.conditions) {
			const conditionResult = this.evaluateConditions(
				resourcePermissions.conditions,
				resourceData,
				user,
				context,
				appliedRules,
			);

			return {
				allowed: conditionResult.allowed,
				reason: conditionResult.reason,
				conditions: resourcePermissions.conditions,
			};
		}

		return { allowed: true };
	}

	private evaluateConditions(
		conditions: ConditionalRule[],
		resourceData: any,
		user: AuthenticatedUser,
		context: PermissionContext | undefined,
		appliedRules: string[],
	): { allowed: boolean; reason?: string } {
		if (!resourceData) {
			return {
				allowed: false,
				reason: "Cannot evaluate conditions without resource data",
			};
		}

		// All conditions must pass (AND logic)
		for (let i = 0; i < conditions.length; i++) {
			const condition = conditions[i];
			appliedRules.push(`condition.${i}.${condition.field}`);

			const result = this.evaluateCondition(
				condition,
				resourceData,
				user,
				context,
			);
			if (!result.allowed) {
				return result;
			}
		}

		return { allowed: true };
	}

	private evaluateCondition(
		condition: ConditionalRule,
		resourceData: any,
		user: AuthenticatedUser,
		context?: PermissionContext,
	): { allowed: boolean; reason?: string } {
		// Use custom validator if provided
		if (condition.customValidator) {
			try {
				const allowed = condition.customValidator(resourceData, user, context);
				return {
					allowed,
					reason: allowed
						? undefined
						: `Custom validation failed for field: ${condition.field}`,
				};
			} catch (error) {
				return {
					allowed: false,
					reason: `Custom validation error: ${error}`,
				};
			}
		}

		// Extract field value from resource
		const fieldValue = extractFieldValue(resourceData, condition.field);
		const expectedValue = substituteTemplateVariables(condition.value, user);

		// Evaluate based on operator
		const allowed = this.evaluateOperator(
			condition.operator,
			fieldValue,
			expectedValue,
		);

		return {
			allowed,
			reason: allowed
				? undefined
				: `Condition failed: ${condition.field} ${condition.operator} ${expectedValue} (actual: ${fieldValue})`,
		};
	}

	private evaluateOperator(
		operator: PermissionOperator,
		fieldValue: any,
		expectedValue: any,
	): boolean {
		switch (operator) {
			case "eq":
				return fieldValue === expectedValue;
			case "ne":
				return fieldValue !== expectedValue;
			case "in":
				return (
					Array.isArray(expectedValue) && expectedValue.includes(fieldValue)
				);
			case "not-in":
				return (
					Array.isArray(expectedValue) && !expectedValue.includes(fieldValue)
				);
			case "contains":
				if (Array.isArray(fieldValue)) {
					return fieldValue.some((item) =>
						String(item).includes(String(expectedValue)),
					);
				}
				return String(fieldValue).includes(String(expectedValue));
			case "not-contains":
				if (Array.isArray(fieldValue)) {
					return !fieldValue.some((item) =>
						String(item).includes(String(expectedValue)),
					);
				}
				return !String(fieldValue).includes(String(expectedValue));
			case "starts-with":
				return String(fieldValue).startsWith(String(expectedValue));
			case "ends-with":
				return String(fieldValue).endsWith(String(expectedValue));
			case "exists":
				return fieldValue !== undefined && fieldValue !== null;
			case "not-exists":
				return fieldValue === undefined || fieldValue === null;
			case "gt":
				return Number(fieldValue) > Number(expectedValue);
			case "gte":
				return Number(fieldValue) >= Number(expectedValue);
			case "lt":
				return Number(fieldValue) < Number(expectedValue);
			case "lte":
				return Number(fieldValue) <= Number(expectedValue);
			case "regex":
				try {
					const regex = new RegExp(String(expectedValue));
					return regex.test(String(fieldValue));
				} catch {
					return false;
				}
			default:
				return false;
		}
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	private createPermissionResult(
		allowed: boolean,
		reason?: string,
		appliedRules: string[] = [],
		startTime?: number,
		conditions?: ConditionalRule[],
	): PermissionResult {
		const endTime = Date.now();
		const evaluationTime = startTime ? endTime - startTime : 0;

		return {
			allowed,
			reason,
			conditions,
			appliedRules,
			performance: {
				evaluationTimeMs: evaluationTime,
				rulesEvaluated: appliedRules.length,
				cacheHit: false,
			},
		};
	}

	private expandResourcePermissions(
		permissions: Partial<ResourcePermissions>,
		resourceType: string,
	): Partial<ResourcePermissions> {
		// Handle any shorthand values that might be nested
		const expanded = { ...permissions };
		for (const [key, value] of Object.entries(expanded)) {
			if (typeof value === "string" && value !== "true" && value !== "false") {
				// Expand shorthand values
				const shorthandExpanded = expandPermissionShorthand(
					value as PermissionShorthand,
					resourceType,
				);
				Object.assign(expanded, shorthandExpanded);
				delete (expanded as any)[key];
			}
		}
		return expanded;
	}

	private mergeResourcePermissions(
		existing: Partial<ResourcePermissions>,
		additional: Partial<ResourcePermissions>,
	): ResourcePermissions {
		const merged = { ...existing } as ResourcePermissions;

		// Merge boolean permissions (OR logic - grant if either allows)
		const booleanFields = [
			"read",
			"vread",
			"update",
			"patch",
			"delete",
			"history",
			"create",
			"search",
			"history-type",
			"update-conditional",
			"patch-conditional",
			"delete-conditional",
			"create-conditional",
		];

		for (const field of booleanFields) {
			const key = field as keyof ResourcePermissions;
			const existingValue = existing[key];
			const additionalValue = additional[key];
			if (
				typeof existingValue === "boolean" ||
				typeof additionalValue === "boolean"
			) {
				(merged as any)[key] =
					Boolean(existingValue) || Boolean(additionalValue);
			}
		}

		// Merge conditions (combine arrays)
		if (existing.conditions || additional.conditions) {
			merged.conditions = [
				...(existing.conditions || []),
				...(additional.conditions || []),
			];
		}

		// Merge searchFilters (combine objects)
		if (existing.searchFilters || additional.searchFilters) {
			merged.searchFilters = {
				...existing.searchFilters,
				...additional.searchFilters,
			};
		}

		return merged;
	}

	private recordPerformanceMetrics(
		userId: string,
		metrics: PermissionPerformanceMetrics,
	): void {
		const userMetrics = this.performanceMetrics.get(userId) || [];
		userMetrics.push(metrics);

		// Keep only last 100 metrics per user
		if (userMetrics.length > 100) {
			userMetrics.shift();
		}

		this.performanceMetrics.set(userId, userMetrics);
	}

	// ============================================================================
	// Management Methods
	// ============================================================================

	/**
	 * Add or update role template
	 */
	addRoleTemplate(
		roleName: string,
		permissions: RolePermissionTemplate[string],
	): void {
		this.roleTemplates[roleName] = permissions;
		// Clear cache as roles may have changed
		permissionCache.clear();
	}

	/**
	 * Get performance statistics
	 */
	getPerformanceStats(userId?: string): {
		averageEvaluationTime: number;
		totalEvaluations: number;
		cacheHitRate: number;
		slowestEvaluations: PermissionPerformanceMetrics[];
	} {
		let allMetrics: PermissionPerformanceMetrics[] = [];

		if (userId) {
			allMetrics = this.performanceMetrics.get(userId) || [];
		} else {
			for (const userMetrics of this.performanceMetrics.values()) {
				allMetrics.push(...userMetrics);
			}
		}

		const totalEvaluations = allMetrics.length;
		const averageEvaluationTime =
			totalEvaluations > 0
				? allMetrics.reduce((sum, m) => sum + m.evaluationTimeMs, 0) /
					totalEvaluations
				: 0;

		const cacheHits = allMetrics.filter((m) => m.cacheHit).length;
		const cacheHitRate =
			totalEvaluations > 0 ? cacheHits / totalEvaluations : 0;

		const slowestEvaluations = allMetrics
			.sort((a, b) => b.evaluationTimeMs - a.evaluationTimeMs)
			.slice(0, 10);

		return {
			averageEvaluationTime,
			totalEvaluations,
			cacheHitRate,
			slowestEvaluations,
		};
	}

	/**
	 * Clear permission cache
	 */
	clearCache(userId?: string): void {
		if (userId) {
			permissionCache.clearForUser(userId);
		} else {
			permissionCache.clear();
		}
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		return permissionCache.getStats();
	}
}

// Export the global cache for external use
export { permissionCache };
