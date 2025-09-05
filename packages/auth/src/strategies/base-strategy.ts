import type { HandlerContext } from "@atomic-fhir/core";
import type {
	AuthenticatedUser,
	AuthenticationResult,
	AuthStrategy,
	AuthStrategyConfig,
	FHIRPermissions,
} from "../types/index.ts";

/**
 * Abstract base class for authentication strategies
 *
 * Provides common functionality and patterns for implementing
 * custom authentication strategies in the Atomic FHIR framework.
 */
export abstract class BaseAuthStrategy implements AuthStrategy {
	public readonly name: string;
	public readonly priority: number;
	protected readonly config: AuthStrategyConfig;
	protected readonly enabled: boolean;
	protected readonly skipPaths: Set<string>;
	protected readonly onlyPaths: Set<string>;

	constructor(config: AuthStrategyConfig) {
		this.config = config;
		this.name = config.name;
		this.priority = config.priority || 100;
		this.enabled = config.enabled !== false;
		this.skipPaths = new Set(config.skipPaths || []);
		this.onlyPaths = new Set(config.onlyPaths || []);
	}

	/**
	 * Main authentication method - must be implemented by concrete strategies
	 */
	abstract authenticate(
		req: Request,
		context: HandlerContext,
	): Promise<AuthenticationResult>;

	/**
	 * Check if this strategy can handle the request
	 * Default implementation checks paths and enabled status
	 */
	canHandle(req: Request): boolean {
		if (!this.enabled) {
			return false;
		}

		const url = new URL(req.url);
		const pathname = url.pathname;

		// If onlyPaths is specified, only handle matching paths
		if (this.onlyPaths.size > 0) {
			return Array.from(this.onlyPaths).some((path) =>
				this.matchesPath(pathname, path),
			);
		}

		// If skipPaths is specified, skip matching paths
		if (this.skipPaths.size > 0) {
			return !Array.from(this.skipPaths).some((path) =>
				this.matchesPath(pathname, path),
			);
		}

		return true;
	}

	/**
	 * Default challenge response for 401 errors
	 * Can be overridden by specific strategies
	 */
	challenge(_req: Request): Response {
		return new Response(
			JSON.stringify({
				error: "Authentication required",
				strategy: this.name,
			}),
			{
				status: 401,
				headers: {
					"Content-Type": "application/fhir+json",
					"WWW-Authenticate": this.getWWWAuthenticateHeader(),
				},
			},
		);
	}

	/**
	 * Get the WWW-Authenticate header value for this strategy
	 * Should be overridden by concrete strategies
	 */
	protected getWWWAuthenticateHeader(): string {
		return `${this.name} realm="FHIR Server"`;
	}

	/**
	 * Helper method to match request paths against patterns
	 * Supports wildcards and exact matches
	 * @param pathname - The request pathname to match against
	 * @param pattern - The pattern to match (supports * wildcards and ? single chars)
	 * @returns True if the pathname matches the pattern
	 */
	protected matchesPath(pathname: string, pattern: string): boolean {
		// Convert glob pattern to regex
		const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");

		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(pathname);
	}

	/**
	 * Create a successful authentication result
	 */
	protected createSuccessResult(user: AuthenticatedUser): AuthenticationResult {
		return {
			success: true,
			user: this.enrichUser(user),
		};
	}

	/**
	 * Create a failed authentication result
	 */
	protected createFailureResult(
		error: string,
		statusCode: number = 401,
	): AuthenticationResult {
		return {
			success: false,
			error,
			statusCode,
		};
	}

	/**
	 * Enrich user with default permissions if not provided
	 */
	protected enrichUser(user: AuthenticatedUser): AuthenticatedUser {
		// Apply default permissions if not provided or if permissions object is empty
		if (!user.permissions || Object.keys(user.permissions).length === 0) {
			user.permissions = this.getDefaultPermissions();
		} else {
			// Merge with defaults for any missing properties
			const defaults = this.getDefaultPermissions();
			user.permissions = {
				canRead: user.permissions.canRead ?? defaults.canRead,
				canWrite: user.permissions.canWrite ?? defaults.canWrite,
				canDelete: user.permissions.canDelete ?? defaults.canDelete,
				resources: user.permissions.resources || defaults.resources,
				operations: user.permissions.operations || defaults.operations,
				custom: user.permissions.custom || defaults.custom,
			};
		}

		// Ensure user has basic required fields
		if (!user.roles || user.roles.length === 0) {
			user.roles = ["user"];
		}

		return user;
	}

	/**
	 * Get default FHIR permissions for authenticated users
	 * Can be overridden by strategies for different defaults
	 */
	protected getDefaultPermissions(): FHIRPermissions {
		return {
			canRead: true,
			canWrite: false,
			canDelete: false,
			resources: {},
			operations: {},
			custom: {},
		};
	}

	/**
	 * Extract credentials from request headers
	 */
	protected getAuthorizationHeader(req: Request): string | null {
		return req.headers.get("authorization");
	}

	/**
	 * Parse Authorization header for specific auth type
	 */
	protected parseAuthorizationHeader(
		header: string,
		expectedType: string,
	): string | null {
		if (
			!header ||
			!header.toLowerCase().startsWith(expectedType.toLowerCase())
		) {
			return null;
		}

		const parts = header.split(" ");
		if (parts.length !== 2) {
			return null;
		}

		return parts[1];
	}

	/**
	 * Extract Basic Auth credentials
	 */
	protected extractBasicCredentials(
		req: Request,
	): { username: string; password: string } | null {
		const authHeader = this.getAuthorizationHeader(req);
		if (!authHeader) {
			return null;
		}

		const token = this.parseAuthorizationHeader(authHeader, "basic");
		if (!token) {
			return null;
		}

		try {
			const decoded = atob(token);
			const colonIndex = decoded.indexOf(":");

			if (colonIndex === -1) {
				return null;
			}

			return {
				username: decoded.substring(0, colonIndex),
				password: decoded.substring(colonIndex + 1),
			};
		} catch (error) {
			return null;
		}
	}

	/**
	 * Extract Bearer token
	 */
	protected extractBearerToken(req: Request): string | null {
		const authHeader = this.getAuthorizationHeader(req);
		if (!authHeader) {
			return null;
		}

		return this.parseAuthorizationHeader(authHeader, "bearer");
	}

	/**
	 * Validate user permissions against FHIR resource and operation
	 * @param user - The authenticated user to check permissions for
	 * @param resourceType - The FHIR resource type (e.g., 'Patient', 'Observation')
	 * @param operation - The FHIR operation (e.g., 'read', 'write', 'delete', 'search')
	 * @param resourceData - Optional resource data for conditional permission checks
	 * @returns True if the user has permission for the specified operation
	 */
	protected hasPermission(
		user: AuthenticatedUser,
		resourceType: string,
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
			case "history-type":
				if (!permissions.canRead) return false;
				break;
			case "create":
			case "update":
			case "patch":
			case "update-conditional":
			case "patch-conditional":
			case "create-conditional":
				if (!permissions.canWrite) return false;
				break;
			case "delete":
			case "delete-conditional":
				if (!permissions.canDelete) return false;
				break;
		}

		// Check resource-specific permissions
		const resourcePermissions = permissions.resources?.[resourceType];
		if (resourcePermissions) {
			const hasResourcePermission =
				resourcePermissions[operation as keyof typeof resourcePermissions];
			if (hasResourcePermission === false) {
				return false;
			}

			// Check conditional permissions
			if (resourcePermissions.conditions && resourceData) {
				for (const condition of resourcePermissions.conditions) {
					if (!this.evaluateCondition(condition, resourceData, user)) {
						return false;
					}
				}
			}
		}

		return true;
	}

	/**
	 * Evaluate a permission condition against resource data
	 */
	private evaluateCondition(
		condition: any,
		resourceData: any,
		user: AuthenticatedUser,
	): boolean {
		const fieldValue = this.getNestedValue(resourceData, condition.field);

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
					Array.isArray(condition.value) &&
					!condition.value.includes(fieldValue)
				);
			case "contains":
				return (
					typeof fieldValue === "string" && fieldValue.includes(condition.value)
				);
			case "custom":
				return condition.customValidator
					? condition.customValidator(resourceData, user)
					: true;
			default:
				return true;
		}
	}

	/**
	 * Get nested value from object using dot notation
	 * Supports array access by index (e.g., 'identifier.0.value')
	 */
	private getNestedValue(obj: any, path: string): any {
		return path.split(".").reduce((current, key) => {
			if (current === null || current === undefined) {
				return undefined;
			}

			// Handle array access - if current is array and we're looking for a non-numeric key,
			// check the first element of the array
			if (Array.isArray(current) && isNaN(Number(key))) {
				return current.length > 0 ? current[0][key] : undefined;
			}

			return current[key];
		}, obj);
	}

	/**
	 * Log authentication events for audit purposes
	 * @param type - The type of authentication event (e.g., 'auth_success', 'auth_failure')
	 * @param req - The HTTP request being authenticated
	 * @param user - Optional authenticated user information
	 * @param error - Optional error message for failed authentication
	 */
	protected logAuthEvent(
		type: string,
		req: Request,
		user?: AuthenticatedUser,
		error?: string,
	): void {
		let pathname = "/";
		try {
			if (req.url) {
				const url = new URL(req.url);
				pathname = url.pathname;
			}
		} catch (e) {
			// Handle malformed URLs gracefully
			pathname = "/";
		}

		const event = {
			type,
			timestamp: new Date().toISOString(),
			strategy: this.name,
			userId: user?.id,
			username: user?.username,
			ipAddress:
				req.headers?.get("x-forwarded-for") || req.headers?.get("x-real-ip"),
			userAgent: req.headers?.get("user-agent"),
			url: pathname,
			success: !error,
			error,
		};

		console.log(`[AUTH] ${JSON.stringify(event)}`);
	}
}
