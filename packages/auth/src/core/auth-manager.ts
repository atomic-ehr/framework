import {
	defineMiddleware,
	type HandlerContext,
	type MiddlewareDefinition,
} from "@atomic-fhir/core";
import type {
	AuthAuditEvent,
	AuthEventType,
	AuthenticatedContext,
	AuthenticatedUser,
	AuthenticationResult,
	AuthManagerConfig,
	AuthMiddlewareConfig,
	AuthStrategy,
	SessionStorage,
	TokenStorage,
} from "../types/index.ts";
import { createAuthenticatedContext } from "./auth-context.ts";

/**
 * Central authentication manager that coordinates multiple authentication strategies,
 * manages strategy registration, and provides the main interface for authentication operations.
 */
export class AuthManager {
	private readonly strategies = new Map<string, AuthStrategy>();
	private readonly config: AuthManagerConfig;
	private readonly tokenStorage?: TokenStorage;
	private readonly sessionStorage?: SessionStorage;
	private readonly auditEvents: AuthAuditEvent[] = [];

	constructor(config: AuthManagerConfig) {
		this.config = {
			requireAuth: true,
			auditEnabled: true,
			...config,
		};

		this.tokenStorage = config.tokenStorage;
		this.sessionStorage = config.sessionStorage;

		// Register initial strategies
		if (config.strategies) {
			for (const strategy of config.strategies) {
				this.registerStrategy(strategy);
			}
		}
	}

	// ============================================================================
	// Strategy Management
	// ============================================================================

	/**
	 * Register an authentication strategy
	 *
	 * @param strategy - Authentication strategy to register
	 * @throws Error if strategy with same name already exists
	 */
	registerStrategy(strategy: AuthStrategy): void {
		if (this.strategies.has(strategy.name)) {
			throw new Error(
				`Strategy with name '${strategy.name}' already registered`,
			);
		}

		this.strategies.set(strategy.name, strategy);
		this.auditLog("strategy_registered", undefined, undefined, {
			strategyName: strategy.name,
		});
	}

	/**
	 * Unregister an authentication strategy
	 *
	 * @param name - Name of strategy to remove
	 * @returns True if strategy was removed, false if not found
	 */
	unregisterStrategy(name: string): boolean {
		const removed = this.strategies.delete(name);
		if (removed) {
			this.auditLog("strategy_unregistered", undefined, undefined, {
				strategyName: name,
			});
		}
		return removed;
	}

	/**
	 * Get a registered strategy by name
	 *
	 * @param name - Strategy name
	 * @returns Strategy instance or undefined if not found
	 */
	getStrategy(name: string): AuthStrategy | undefined {
		return this.strategies.get(name);
	}

	/**
	 * Get all registered strategies
	 *
	 * @returns Array of all registered strategies
	 */
	getAllStrategies(): AuthStrategy[] {
		return Array.from(this.strategies.values());
	}

	/**
	 * Get strategies that can handle the given request
	 * Returned in priority order (highest first)
	 *
	 * @param req - HTTP request to analyze
	 * @returns Array of applicable strategies in priority order
	 */
	private getApplicableStrategies(req: Request): AuthStrategy[] {
		const applicable: AuthStrategy[] = [];

		for (const strategy of this.strategies.values()) {
			if (strategy.canHandle(req)) {
				applicable.push(strategy);
			}
		}

		// Sort by priority (higher priority first)
		return applicable.sort((a, b) => b.priority - a.priority);
	}

	// ============================================================================
	// Core Authentication
	// ============================================================================

	/**
	 * Authenticate a request using registered strategies
	 * Tries strategies in priority order until one succeeds
	 *
	 * @param req - HTTP request to authenticate
	 * @param context - Handler context
	 * @returns Authentication result
	 */
	async authenticate(
		req: Request,
		context: HandlerContext,
	): Promise<AuthenticationResult> {
		const startTime = Date.now();
		const url = new URL(req.url);

		// Check if path should be skipped
		if (this.shouldSkipPath(url.pathname)) {
			return {
				success: true,
				user: undefined, // Anonymous access allowed
			};
		}

		// Get applicable strategies
		const applicableStrategies = this.getApplicableStrategies(req);
		const attemptedStrategies: string[] = [];

		if (applicableStrategies.length === 0) {
			const error = "No authentication strategies can handle this request";
			this.auditLog("auth_failure", req, undefined, {
				error,
				attemptedStrategies,
				duration: Date.now() - startTime,
			});

			return {
				success: false,
				error,
				statusCode: 401,
			};
		}

		// Try strategies in priority order
		let lastError: string = "Authentication failed";
		let lastStatusCode: number = 401;

		for (const strategy of applicableStrategies) {
			attemptedStrategies.push(strategy.name);

			try {
				const result = await strategy.authenticate(req, context);

				if (result.success && result.user) {
					// Authentication succeeded
					this.auditLog("auth_success", req, result.user, {
						successfulStrategy: strategy.name,
						attemptedStrategies,
						duration: Date.now() - startTime,
					});

					return result;
				} else if (result.error) {
					// Strategy failed, but we might try others
					lastError = result.error;
					lastStatusCode = result.statusCode || 401;
				}
			} catch (error) {
				// Strategy threw an error, log it and continue
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				console.error(`Strategy ${strategy.name} threw error:`, errorMessage);
				lastError = errorMessage;
			}
		}

		// All strategies failed
		this.auditLog("auth_failure", req, undefined, {
			error: lastError,
			attemptedStrategies,
			duration: Date.now() - startTime,
		});

		return {
			success: false,
			error: lastError,
			statusCode: lastStatusCode,
		};
	}

	/**
	 * Create a challenge response when authentication is required
	 * Uses the first applicable strategy's challenge method
	 *
	 * @param req - HTTP request that failed authentication
	 * @returns HTTP response with appropriate challenge
	 */
	createChallenge(req: Request): Response {
		const applicableStrategies = this.getApplicableStrategies(req);

		if (applicableStrategies.length > 0) {
			const strategy = applicableStrategies[0];
			if (strategy.challenge) {
				return strategy.challenge(req);
			}
		}

		// Default challenge response
		return new Response(
			JSON.stringify({
				error: "Authentication required",
				message:
					"Valid authentication credentials are required to access this resource",
			}),
			{
				status: 401,
				headers: {
					"Content-Type": "application/fhir+json",
					"WWW-Authenticate": 'Bearer realm="FHIR Server"',
				},
			},
		);
	}

	// ============================================================================
	// Context Management
	// ============================================================================

	/**
	 * Create an authenticated context from user information
	 *
	 * @param originalContext - Original handler context
	 * @param user - Authenticated user (optional for anonymous access)
	 * @returns Enhanced context with authentication capabilities
	 */
	createContext(
		originalContext: HandlerContext,
		user?: AuthenticatedUser,
	): AuthenticatedContext {
		return createAuthenticatedContext(originalContext, user);
	}

	/**
	 * Enhance a context with authentication information
	 * Alias for createContext for backward compatibility
	 */
	enhanceContext(
		originalContext: HandlerContext,
		user?: AuthenticatedUser,
	): AuthenticatedContext {
		return this.createContext(originalContext, user);
	}

	// ============================================================================
	// Storage Management
	// ============================================================================

	/**
	 * Store authentication token
	 *
	 * @param token - Token to store
	 * @param user - Associated user
	 * @param expiresAt - Optional expiration date
	 */
	async storeToken(
		token: string,
		user: AuthenticatedUser,
		expiresAt?: Date,
	): Promise<void> {
		if (this.tokenStorage) {
			await this.tokenStorage.store(token, user, expiresAt);
		}
	}

	/**
	 * Retrieve user by token
	 *
	 * @param token - Token to look up
	 * @returns User if found, null otherwise
	 */
	async getTokenUser(token: string): Promise<AuthenticatedUser | null> {
		if (this.tokenStorage) {
			return await this.tokenStorage.retrieve(token);
		}
		return null;
	}

	/**
	 * Revoke a token
	 *
	 * @param token - Token to revoke
	 */
	async revokeToken(token: string): Promise<void> {
		if (this.tokenStorage) {
			await this.tokenStorage.revoke(token);
		}
	}

	/**
	 * Create a new session
	 *
	 * @param sessionId - Session identifier
	 * @param user - User for the session
	 * @param expiresAt - Optional expiration
	 */
	async createSession(
		sessionId: string,
		user: AuthenticatedUser,
		expiresAt?: Date,
	): Promise<void> {
		if (this.sessionStorage) {
			await this.sessionStorage.create(
				sessionId,
				{
					userId: user.id,
					user,
					createdAt: new Date(),
					lastAccessedAt: new Date(),
				},
				expiresAt,
			);
		}
	}

	/**
	 * Get session data
	 *
	 * @param sessionId - Session identifier
	 * @returns Session data if found
	 */
	async getSession(sessionId: string): Promise<AuthenticatedUser | null> {
		if (this.sessionStorage) {
			const sessionData = await this.sessionStorage.get(sessionId);
			return sessionData?.user || null;
		}
		return null;
	}

	/**
	 * Destroy a session
	 *
	 * @param sessionId - Session identifier
	 */
	async destroySession(sessionId: string): Promise<void> {
		if (this.sessionStorage) {
			await this.sessionStorage.destroy(sessionId);
		}
	}

	/**
	 * Clean up expired tokens and sessions
	 */
	async cleanup(): Promise<void> {
		const promises: Promise<void>[] = [];

		if (this.tokenStorage) {
			promises.push(this.tokenStorage.cleanup());
		}

		if (this.sessionStorage) {
			promises.push(this.sessionStorage.cleanup());
		}

		await Promise.all(promises);
	}

	// ============================================================================
	// Middleware Integration
	// ============================================================================

	/**
	 * Create middleware for integration with Atomic framework
	 *
	 * @param options - Optional middleware configuration
	 * @returns Middleware definition
	 */
	middleware(
		options: Partial<AuthMiddlewareConfig> = {},
	): MiddlewareDefinition {
		const skipPaths = options.skipPaths || this.config.skipPaths || [];
		const requireAuth = options.requireAuth ?? this.config.requireAuth ?? true;

		const authManager = this;

		return defineMiddleware({
			name: "auth-middleware",

			async before(req: Request, context: HandlerContext): Promise<void> {
				const url = new URL(req.url);

				// Check if path should be skipped
				if (authManager.shouldSkipPath(url.pathname, skipPaths)) {
					// Create anonymous context
					const enhancedContext = createAuthenticatedContext(context);
					Object.assign(context, enhancedContext);
					return;
				}

				// Attempt authentication
				const authResult = await authManager.authenticate(req, context);

				if (!authResult.success) {
					// Authentication failed
					if (requireAuth) {
						// Return challenge response - simplified for now
						throw new Error(authResult.error || "Authentication required");
					} else {
						// Anonymous access allowed
						const enhancedContext = createAuthenticatedContext(context);
						Object.assign(context, enhancedContext);
						return;
					}
				}

				// Authentication succeeded - enhance context
				const enhancedContext = createAuthenticatedContext(
					context,
					authResult.user,
				);
				Object.assign(context, enhancedContext);
			},
		});
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	/**
	 * Check if a path should skip authentication
	 *
	 * @param pathname - Request pathname
	 * @param additionalSkipPaths - Additional paths to skip
	 * @returns True if path should be skipped
	 */
	private shouldSkipPath(
		pathname: string,
		additionalSkipPaths: string[] = [],
	): boolean {
		const skipPaths = [
			...(this.config.skipPaths || []),
			...additionalSkipPaths,
		];

		return skipPaths.some((pattern) => {
			// Convert glob pattern to regex
			const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");

			const regex = new RegExp(`^${regexPattern}$`);
			return regex.test(pathname);
		});
	}

	/**
	 * Get authentication statistics
	 *
	 * @returns Object with authentication statistics
	 */
	getStatistics(): AuthManagerStatistics {
		const events = this.auditEvents;
		const totalAttempts = events.filter(
			(e) => e.type === "auth_success" || e.type === "auth_failure",
		).length;
		const successfulAttempts = events.filter(
			(e) => e.type === "auth_success",
		).length;
		const failedAttempts = events.filter(
			(e) => e.type === "auth_failure",
		).length;

		return {
			totalStrategies: this.strategies.size,
			totalAttempts,
			successfulAttempts,
			failedAttempts,
			successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
			strategiesUsed: [
				...new Set(
					events
						.filter((e) => e.metadata?.successfulStrategy)
						.map((e) => e.metadata?.successfulStrategy),
				),
			],
			averageAuthTime: this.calculateAverageAuthTime(),
		};
	}

	/**
	 * Calculate average authentication time from audit events
	 */
	private calculateAverageAuthTime(): number {
		const authEvents = this.auditEvents.filter(
			(e) =>
				(e.type === "auth_success" || e.type === "auth_failure") &&
				e.metadata?.duration,
		);

		if (authEvents.length === 0) return 0;

		const totalTime = authEvents.reduce(
			(sum, event) => sum + (event.metadata?.duration || 0),
			0,
		);
		return totalTime / authEvents.length;
	}

	// ============================================================================
	// Audit Logging
	// ============================================================================

	/**
	 * Log authentication event for audit purposes
	 *
	 * @param type - Type of authentication event
	 * @param req - HTTP request (optional)
	 * @param user - Authenticated user (optional)
	 * @param metadata - Additional event metadata
	 */
	private auditLog(
		type: AuthEventType | string,
		req?: Request,
		user?: AuthenticatedUser,
		metadata: Record<string, any> = {},
	): void {
		if (!this.config.auditEnabled) {
			return;
		}

		const event: AuthAuditEvent = {
			type: type as AuthEventType,
			timestamp: new Date(),
			userId: user?.id,
			username: user?.username,
			strategy:
				metadata.successfulStrategy || metadata.strategyName || "unknown",
			success: type.includes("success"),
			error: metadata.error,
			metadata: {
				...metadata,
				userAgent: req?.headers.get("user-agent"),
				ipAddress:
					req?.headers.get("x-forwarded-for") || req?.headers.get("x-real-ip"),
			},
		};

		this.auditEvents.push(event);

		// Keep only last 1000 events to prevent memory issues
		if (this.auditEvents.length > 1000) {
			this.auditEvents.shift();
		}

		// Log to console for debugging
		console.log(`[AUTH_MANAGER] ${JSON.stringify(event)}`);
	}

	/**
	 * Get audit events
	 *
	 * @param limit - Maximum number of events to return
	 * @returns Array of audit events
	 */
	getAuditEvents(limit: number = 100): AuthAuditEvent[] {
		return this.auditEvents.slice(-limit);
	}
}

/**
 * Authentication manager statistics interface
 */
export interface AuthManagerStatistics {
	totalStrategies: number;
	totalAttempts: number;
	successfulAttempts: number;
	failedAttempts: number;
	successRate: number;
	strategiesUsed: string[];
	averageAuthTime: number;
}

/**
 * Custom error for middleware integration (available for future use)
 */
// @ts-expect-error
class _AuthenticationError extends Error {
	constructor(
		message: string,
		public response: Response,
	) {
		super(message);
		this.name = "AuthenticationError";
	}
}
