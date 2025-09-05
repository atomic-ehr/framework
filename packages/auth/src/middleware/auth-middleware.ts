import {
	defineMiddleware,
	type HandlerContext,
	type MiddlewareDefinition,
} from "@atomic-fhir/core";
import {
	type AuditManager,
	createAuthAttemptEvent,
	createAuthFailureEvent,
	createAuthSuccessEvent,
} from "../core/audit-logging.ts";
import type { AuthManager } from "../core/auth-manager.ts";
import type {
	AuthenticatedContext,
	AuthenticatedUser,
	AuthenticationResult,
} from "../types/index.ts";

// ============================================================================
// Configuration Types
// ============================================================================

export interface EnhancedAuthMiddlewareConfig {
	authManager: AuthManager;

	// Path control
	requireAuth?: boolean; // Default: true
	skipPaths?: string[]; // Paths to skip authentication
	onlyPaths?: string[]; // Only authenticate these paths

	// Authentication behavior
	allowAnonymous?: boolean; // Allow unauthenticated requests
	multipleStrategies?: boolean; // Try multiple strategies

	// Error handling
	onUnauthenticated?: (
		req: Request,
		context: HandlerContext,
	) => Response | Promise<Response>;
	onUnauthorized?: (
		req: Request,
		context: HandlerContext,
		user: AuthenticatedUser,
	) => Response | Promise<Response>;
	onError?: (
		error: Error,
		req: Request,
		context: HandlerContext,
	) => Response | Promise<Response>;

	// Performance
	cacheResults?: boolean; // Cache auth results per request
	maxCacheSize?: number;

	// Audit
	auditEnabled?: boolean;
	auditLevel?: "minimal" | "detailed";
	auditManager?: AuditManager;
}

// ============================================================================
// Request-scoped Authentication Cache
// ============================================================================

interface CacheEntry {
	result: AuthenticationResult;
	timestamp: number;
}

class AuthCache {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly maxSize: number;
	private readonly ttl = 5000; // 5 seconds TTL for performance

	constructor(maxSize: number = 1000) {
		this.maxSize = maxSize;
	}

	get(key: string): AuthenticationResult | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// Check TTL
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.result;
	}

	set(key: string, result: AuthenticationResult): void {
		// Remove oldest entries if cache is full
		if (this.cache.size >= this.maxSize) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}

		this.cache.set(key, {
			result,
			timestamp: Date.now(),
		});
	}

	clear(): void {
		this.cache.clear();
	}

	size(): number {
		return this.cache.size;
	}
}

// ============================================================================
// Global Cache Instance
// ============================================================================

const globalAuthCache = new AuthCache();

// ============================================================================
// Path Matching Utilities
// ============================================================================

/**
 * Check if authentication should be skipped for a given pathname
 */
function shouldSkipAuthentication(
	pathname: string,
	config: EnhancedAuthMiddlewareConfig,
): boolean {
	// If onlyPaths is specified, only authenticate matching paths
	if (config.onlyPaths?.length) {
		return !config.onlyPaths.some((pattern) => matchesPath(pathname, pattern));
	}

	// If skipPaths is specified, skip matching paths
	if (config.skipPaths?.length) {
		return config.skipPaths.some((pattern) => matchesPath(pathname, pattern));
	}

	// Default behavior based on requireAuth
	return !config.requireAuth;
}

/**
 * Match a pathname against a glob pattern
 */
function matchesPath(pathname: string, pattern: string): boolean {
	// Convert glob pattern to regex
	const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");

	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(pathname);
}

// ============================================================================
// Context Enhancement
// ============================================================================

/**
 * Enhance context for anonymous (unauthenticated) users
 */
function enhanceContextAsAnonymous(
	context: HandlerContext,
): AuthenticatedContext {
	return {
		...context,
		user: undefined,
		isAuthenticated: false,
		checkPermission: () => false,
		hasRole: () => false,
		hasPermission: () => false,
	} as AuthenticatedContext;
}

/**
 * Enhance context with authenticated user information
 */
function enhanceContextWithUser(
	context: HandlerContext,
	user: AuthenticatedUser,
): AuthenticatedContext {
	return {
		...context,
		user,
		isAuthenticated: true,
		checkPermission: (
			resource: string,
			operation: string,
			resourceData?: any,
		) => {
			return checkUserPermission(user, resource, operation, resourceData);
		},
		hasRole: (role: string) => user.roles.includes(role),
		hasPermission: (permission: string) => {
			return evaluateUserPermission(user, permission);
		},
	} as AuthenticatedContext;
}

// ============================================================================
// Permission Checking Logic
// ============================================================================

/**
 * Check if user has permission for a specific resource and operation
 */
function checkUserPermission(
	user: AuthenticatedUser,
	resource: string,
	operation: string,
	resourceData?: any,
): boolean {
	const permissions = user.permissions;

	// Check global permissions first
	switch (operation) {
		case "read":
		case "vread":
		case "search":
		case "history":
			if (permissions.canRead === false) return false;
			break;
		case "create":
		case "update":
		case "patch":
			if (permissions.canWrite === false) return false;
			break;
		case "delete":
			if (permissions.canDelete === false) return false;
			break;
	}

	// Check resource-specific permissions
	const resourcePerms = permissions.resources?.[resource];
	if (resourcePerms) {
		const operationPerm = (resourcePerms as any)[operation];
		if (operationPerm === false) return false;
		if (operationPerm === true) return true;

		// Check conditions if present
		if (resourcePerms.conditions && resourceData) {
			return resourcePerms.conditions.every((condition) => {
				return evaluateCondition(condition, resourceData, user);
			});
		}
	}

	// Default to allowing if not explicitly denied
	return permissions.canRead !== false;
}

/**
 * Evaluate a user's general permission
 */
function evaluateUserPermission(
	user: AuthenticatedUser,
	permission: string,
): boolean {
	// Check operation-specific permissions
	if (user.permissions.operations?.[permission] !== undefined) {
		return user.permissions.operations[permission];
	}

	// Check custom permissions
	if (user.permissions.custom?.[permission] !== undefined) {
		return Boolean(user.permissions.custom[permission]);
	}

	// Check roles for permission matching
	return user.roles.some((role) => role === permission);
}

/**
 * Evaluate a permission condition
 */
function evaluateCondition(
	condition: any,
	resourceData: any,
	user: AuthenticatedUser,
): boolean {
	if (condition.customValidator) {
		return condition.customValidator(resourceData, user);
	}

	const fieldValue = getNestedProperty(resourceData, condition.field);

	switch (condition.operator) {
		case "eq":
			return fieldValue === condition.value;
		case "ne":
			return fieldValue !== condition.value;
		case "in":
			return (
				Array.isArray(condition.value) && condition.value.includes(fieldValue)
			);
		case "not-in":
			return (
				Array.isArray(condition.value) && !condition.value.includes(fieldValue)
			);
		case "contains":
			return String(fieldValue).includes(String(condition.value));
		default:
			return false;
	}
}

/**
 * Get nested property from object using dot notation
 */
function getNestedProperty(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => current?.[key], obj);
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handle authentication failure with appropriate response
 */
async function handleAuthenticationFailure(
	req: Request,
	context: HandlerContext,
	authResult: AuthenticationResult,
	config: EnhancedAuthMiddlewareConfig,
): Promise<Response> {
	// Use custom handler if provided
	if (config.onUnauthenticated) {
		return await config.onUnauthenticated(req, context);
	}

	// Default FHIR-compliant response
	const statusCode = authResult.statusCode || 401;
	const error = authResult.error || "Authentication required";

	return new Response(
		JSON.stringify({
			resourceType: "OperationOutcome",
			issue: [
				{
					severity: "error",
					code: statusCode === 401 ? "login" : "forbidden",
					details: {
						text: error,
					},
				},
			],
		}),
		{
			status: statusCode,
			headers: {
				"Content-Type": "application/fhir+json",
				"WWW-Authenticate": 'Bearer realm="FHIR Server"',
			},
		},
	);
}

/**
 * Handle general errors during authentication
 */
async function handleAuthError(
	error: Error,
	req: Request,
	context: HandlerContext,
	config: EnhancedAuthMiddlewareConfig,
): Promise<Response> {
	// Use custom handler if provided
	if (config.onError) {
		return await config.onError(error, req, context);
	}

	// Default error response
	return new Response(
		JSON.stringify({
			resourceType: "OperationOutcome",
			issue: [
				{
					severity: "error",
					code: "exception",
					details: {
						text: "Authentication service temporarily unavailable",
					},
				},
			],
		}),
		{
			status: 503,
			headers: {
				"Content-Type": "application/fhir+json",
			},
		},
	);
}

// ============================================================================
// Caching Utilities
// ============================================================================

/**
 * Get cached authentication result if available
 */
function getCachedAuthResult(
	req: Request,
	config: EnhancedAuthMiddlewareConfig,
): AuthenticationResult | null {
	if (!config.cacheResults) return null;

	const cacheKey = generateAuthCacheKey(req);
	return globalAuthCache.get(cacheKey);
}

/**
 * Cache authentication result
 */
function cacheAuthResult(
	req: Request,
	result: AuthenticationResult,
	config: EnhancedAuthMiddlewareConfig,
): void {
	if (!config.cacheResults) return;

	const cacheKey = generateAuthCacheKey(req);
	globalAuthCache.set(cacheKey, result);
}

/**
 * Generate cache key for request
 */
function generateAuthCacheKey(req: Request): string {
	const authHeader = req.headers.get("authorization") || "";
	const sessionId =
		req.headers.get("cookie")?.match(/sessionId=([^;]+)/)?.[1] || "";
	return `${authHeader}:${sessionId}`;
}

/**
 * Get client IP address from request headers (available for future use)
 */
// @ts-expect-error
function _getClientIP(req: Request): string | undefined {
	return (
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		req.headers.get("cf-connecting-ip") ||
		undefined
	);
}

// ============================================================================
// Core Authentication Logic
// ============================================================================

/**
 * Authenticate a request using the configured auth manager
 */
async function authenticateRequest(
	req: Request,
	context: HandlerContext,
	config: EnhancedAuthMiddlewareConfig,
): Promise<AuthenticatedContext> {
	const startTime = Date.now();
	const url = new URL(req.url);
	const pathname = url.pathname;

	// Check if authentication should be skipped
	if (shouldSkipAuthentication(pathname, config)) {
		// Log that authentication was skipped
		if (config.auditEnabled && config.auditManager) {
			const event = createAuthAttemptEvent(
				req,
				context as AuthenticatedContext,
				"none",
			);
			event.metadata = {
				...event.metadata,
				skipped: true,
				reason: "path_excluded",
			};
			await config.auditManager.log(event);
		}
		return enhanceContextAsAnonymous(context);
	}

	// Check cache first
	const cachedResult = getCachedAuthResult(req, config);
	if (cachedResult) {
		if (cachedResult.success && cachedResult.user) {
			// Log cached authentication success
			if (config.auditEnabled && config.auditManager) {
				const duration = Date.now() - startTime;
				const event = createAuthSuccessEvent(
					req,
					cachedResult.user,
					"cached",
					duration,
				);
				event.metadata = { ...event.metadata, cacheHit: true };
				await config.auditManager.log(event);
			}
			return enhanceContextWithUser(context, cachedResult.user);
		} else if (config.allowAnonymous) {
			return enhanceContextAsAnonymous(context);
		}
		// If cached result is failure and anonymous not allowed, fall through to re-authenticate
	}

	// Log authentication attempt
	if (config.auditEnabled && config.auditManager) {
		const event = createAuthAttemptEvent(
			req,
			context as AuthenticatedContext,
			"unknown",
		);
		await config.auditManager.log(event);
	}

	// Perform authentication
	const authResult = await config.authManager.authenticate(req, context);
	const duration = Date.now() - startTime;

	// Cache the result
	cacheAuthResult(req, authResult, config);

	if (!authResult.success) {
		// Log authentication failure
		if (config.auditEnabled && config.auditManager) {
			const strategy = (authResult as any)?.strategy || "unknown";
			const error = authResult.error || "Authentication failed";
			const event = createAuthFailureEvent(req, strategy, error, duration);
			await config.auditManager.log(event);
		}

		if (config.allowAnonymous) {
			return enhanceContextAsAnonymous(context);
		}

		// Handle authentication failure
		throw await handleAuthenticationFailure(req, context, authResult, config);
	}

	// Authentication succeeded - log success
	if (config.auditEnabled && config.auditManager && authResult.user) {
		const strategy = (authResult as any)?.strategy || "unknown";
		const event = createAuthSuccessEvent(
			req,
			authResult.user,
			strategy,
			duration,
		);
		await config.auditManager.log(event);
	}

	return enhanceContextWithUser(context, authResult.user!);
}

// ============================================================================
// Middleware Factory Function
// ============================================================================

/**
 * Create authentication middleware with comprehensive configuration
 *
 * @param authManager - The auth manager instance
 * @param options - Optional configuration overrides
 * @returns Middleware definition for the Atomic framework
 */
export function createAuthMiddleware(
	authManager: AuthManager,
	options: Partial<EnhancedAuthMiddlewareConfig> = {},
): MiddlewareDefinition {
	const config: EnhancedAuthMiddlewareConfig = {
		authManager,
		requireAuth: true,
		allowAnonymous: false,
		multipleStrategies: true,
		auditEnabled: true,
		auditLevel: "minimal",
		cacheResults: false,
		maxCacheSize: 1000,
		...options,
	};

	return defineMiddleware({
		name: "authentication",

		async before(
			req: Request,
			context: HandlerContext,
		): Promise<Request | void> {
			try {
				const enhancedContext = await authenticateRequest(req, context, config);

				// Replace context with enhanced version
				Object.assign(context, enhancedContext);

				// Return undefined to continue processing
				return undefined;
			} catch (error) {
				// Handle authentication errors
				if (error instanceof Response) {
					// Authentication failed with response
					throw error;
				}

				// Unexpected error
				const errorResponse = await handleAuthError(
					error as Error,
					req,
					context,
					config,
				);
				throw errorResponse;
			}
		},

		async after(
			res: Response,
			_context: HandlerContext,
		): Promise<Response | void> {
			// Optional: Add authentication-related headers
			// const authContext = context as AuthenticatedContext;
			// if (authContext.isAuthenticated && authContext.user) {
			//   Could add headers like X-User-ID, X-User-Roles, etc.
			// }

			return res;
		},
	});
}

// ============================================================================
// Utility Exports
// ============================================================================

export {
	type EnhancedAuthMiddlewareConfig as AuthMiddlewareConfig,
	shouldSkipAuthentication,
	matchesPath,
	enhanceContextAsAnonymous,
	enhanceContextWithUser,
	checkUserPermission,
	evaluateUserPermission,
	getCachedAuthResult,
	generateAuthCacheKey,
};

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear the global authentication cache
 */
export function clearAuthCache(): void {
	globalAuthCache.clear();
}

/**
 * Get authentication cache statistics
 */
export function getAuthCacheStats(): {
	size: number;
	maxSize: number;
} {
	return {
		size: globalAuthCache.size(),
		maxSize: 1000, // Could make this configurable
	};
}
