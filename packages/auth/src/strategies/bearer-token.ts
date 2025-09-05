import type { HandlerContext } from "@atomic-fhir/core";
import type {
	AuthenticatedUser,
	AuthenticationResult,
	AuthStrategyConfig,
	TokenInfo,
	TokenStorage,
} from "../types/index.ts";
import { BaseAuthStrategy } from "./base-strategy.ts";

/**
 * Configuration for Bearer Token authentication strategy
 */
export interface BearerTokenConfig extends AuthStrategyConfig {
	// Static token list
	tokens?: Record<string, Partial<AuthenticatedUser>>;

	// Dynamic token provider function
	tokenProvider?: (token: string) => Promise<AuthenticatedUser | null>;

	// Token storage system
	tokenStorage?: TokenStorage;

	// Validation options
	validateExpiration?: boolean;
	allowExpiredGracePeriod?: number; // seconds

	// Security options
	tokenPrefix?: string; // Require specific token prefix
	minTokenLength?: number; // Minimum token length

	// Rate limiting
	maxRequestsPerToken?: number;
	rateLimitWindow?: number; // seconds
}

/**
 * Token user information structure
 */
export interface TokenUser {
	user: AuthenticatedUser;
	tokenInfo?: TokenInfo;
}

/**
 * Token validation result
 */
export interface TokenValidation {
	valid: boolean;
	user?: AuthenticatedUser;
	error?: string;
	expired?: boolean;
}

/**
 * Rate limiting data structure
 */
interface RateLimitData {
	count: number;
	resetTime: number;
}

/**
 * Bearer Token Authentication strategy
 *
 * Supports API token-based authentication with static tokens, dynamic token providers,
 * and token storage systems. Implements comprehensive token validation, expiration handling,
 * and rate limiting for secure API access.
 */
export class BearerTokenStrategy extends BaseAuthStrategy {
	private readonly tokens = new Map<string, TokenUser>();
	private readonly tokenProvider?: (
		token: string,
	) => Promise<AuthenticatedUser | null>;
	private readonly tokenStorage?: TokenStorage;
	private readonly validateExpiration: boolean;
	private readonly allowExpiredGracePeriod: number;
	private readonly tokenPrefix?: string;
	private readonly minTokenLength: number;
	private readonly maxRequestsPerToken?: number;
	private readonly rateLimitWindow: number;
	private readonly rateLimitMap = new Map<string, RateLimitData>();

	constructor(config: BearerTokenConfig) {
		super(config);

		this.tokenProvider = config.tokenProvider;
		this.tokenStorage = config.tokenStorage;
		this.validateExpiration = config.validateExpiration ?? true;
		this.allowExpiredGracePeriod = config.allowExpiredGracePeriod ?? 0;
		this.tokenPrefix = config.tokenPrefix;
		this.minTokenLength = config.minTokenLength ?? 8;
		this.maxRequestsPerToken = config.maxRequestsPerToken;
		this.rateLimitWindow = config.rateLimitWindow ?? 3600;

		// Initialize static tokens
		if (config.tokens) {
			this.initializeTokens(config.tokens);
		}
	}

	/**
	 * Initialize static tokens from configuration
	 */
	private initializeTokens(
		tokens: Record<string, Partial<AuthenticatedUser>>,
	): void {
		for (const [token, userConfig] of Object.entries(tokens)) {
			this.tokens.set(token, {
				user: this.createTokenUser(token, userConfig),
				tokenInfo: {
					type: "bearer",
					token: token,
					issuedAt: new Date(),
				},
			});
		}
	}

	/**
	 * Create authenticated user from token configuration
	 */
	private createTokenUser(
		token: string,
		userConfig: Partial<AuthenticatedUser>,
	): AuthenticatedUser {
		const baseUser: AuthenticatedUser = {
			id: `token-${token.substring(0, 8)}`,
			roles: ["api-client"],
			permissions: this.getDefaultPermissions(),
			metadata: {
				authStrategy: this.name,
				tokenType: "bearer",
			},
		};

		return {
			...baseUser,
			...userConfig,
			// Ensure these fields are properly set
			id: userConfig.id || baseUser.id,
			roles: userConfig.roles || baseUser.roles,
			permissions: userConfig.permissions || baseUser.permissions,
			metadata: {
				...baseUser.metadata,
				...userConfig.metadata,
			},
		};
	}

	/**
	 * Check if this strategy can handle the request
	 */
	canHandle(req: Request): boolean {
		if (!super.canHandle(req)) {
			return false;
		}

		// Check for Authorization header with Bearer scheme
		const authHeader = this.getAuthorizationHeader(req);
		return (
			authHeader !== null && authHeader.toLowerCase().startsWith("bearer ")
		);
	}

	/**
	 * Authenticate request using Bearer Token
	 */
	async authenticate(
		req: Request,
		_context: HandlerContext,
	): Promise<AuthenticationResult> {
		const startTime = Date.now();

		try {
			// Extract and validate token from Authorization header
			const token = this.extractToken(req);
			if (!token) {
				this.logAuthEvent(
					"auth_failure",
					req,
					undefined,
					"Missing or invalid Bearer token",
				);
				return this.createFailureResult("Missing or invalid Bearer token", 401);
			}

			// Check rate limiting if configured
			if (this.maxRequestsPerToken && !(await this.checkRateLimit(token))) {
				this.logAuthEvent(
					"auth_failure",
					req,
					undefined,
					"Rate limit exceeded for token",
				);
				return this.createFailureResult("Rate limit exceeded", 429);
			}

			// Find user via static tokens, provider, or storage
			const tokenValidation = await this.validateToken(token);
			if (!tokenValidation.valid || !tokenValidation.user) {
				const error = tokenValidation.error || "Invalid token";
				this.logAuthEvent("auth_failure", req, undefined, error);
				return this.createFailureResult(error, 401);
			}

			// Check token expiration if validation is enabled
			if (this.validateExpiration && tokenValidation.user.tokenInfo) {
				const isExpired = await this.isTokenExpired(
					tokenValidation.user.tokenInfo,
				);
				if (isExpired) {
					this.logAuthEvent("auth_failure", req, undefined, "Token expired");
					return this.createFailureResult("Token expired", 401);
				}
			}

			// Create authenticated user with token info
			const authenticatedUser = this.enrichUserWithTokenInfo(
				tokenValidation.user,
				token,
			);

			const _duration = Date.now() - startTime;
			_duration; // Use variable to avoid unused warning
			this.logAuthEvent("auth_success", req, authenticatedUser);

			return this.createSuccessResult(authenticatedUser);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Authentication error";
			this.logAuthEvent("auth_failure", req, undefined, errorMessage);
			return this.createFailureResult("Authentication failed", 500);
		}
	}

	/**
	 * Extract and validate token from request
	 */
	private extractToken(req: Request): string | null {
		const token = this.extractBearerToken(req);
		if (!token) {
			return null;
		}

		// Validate token length
		if (token.length < this.minTokenLength) {
			return null;
		}

		// Check required prefix
		if (this.tokenPrefix && !token.startsWith(this.tokenPrefix)) {
			return null;
		}

		return token;
	}

	/**
	 * Validate token and return user information
	 */
	async validateToken(token: string): Promise<TokenValidation> {
		try {
			// Try static token list first
			if (this.tokens.has(token)) {
				const tokenUser = this.tokens.get(token)!;
				return {
					valid: true,
					user: tokenUser.user,
				};
			}

			// Try token storage
			if (this.tokenStorage) {
				try {
					const user = await this.tokenStorage.retrieve(token);
					if (user) {
						return {
							valid: true,
							user: user,
						};
					}
				} catch (error) {
					console.error(
						`[BearerTokenStrategy] Token storage error for token ${token.substring(0, 8)}...:`,
						error,
					);
				}
			}

			// Try dynamic token provider
			if (this.tokenProvider) {
				try {
					const user = await this.tokenProvider(token);
					if (user) {
						return {
							valid: true,
							user: user,
						};
					}
				} catch (error) {
					console.error(
						`[BearerTokenStrategy] Token provider error for token ${token.substring(0, 8)}...:`,
						error,
					);
					return {
						valid: false,
						error: "Token provider error",
					};
				}
			}

			return {
				valid: false,
				error: "Token not found",
			};
		} catch (error) {
			return {
				valid: false,
				error:
					error instanceof Error ? error.message : "Token validation error",
			};
		}
	}

	/**
	 * Check if token is expired with optional grace period
	 */
	private async isTokenExpired(tokenInfo: TokenInfo): Promise<boolean> {
		if (!tokenInfo.expiresAt) {
			return false; // No expiration set
		}

		const now = new Date();
		const expired = now > tokenInfo.expiresAt;

		// Check grace period for expired tokens
		if (expired && this.allowExpiredGracePeriod > 0) {
			const gracePeriodEnd = new Date(
				tokenInfo.expiresAt.getTime() + this.allowExpiredGracePeriod * 1000,
			);
			return now > gracePeriodEnd;
		}

		return expired;
	}

	/**
	 * Enrich user with token information
	 */
	private enrichUserWithTokenInfo(
		user: AuthenticatedUser,
		token: string,
	): AuthenticatedUser {
		return {
			...user,
			tokenInfo: {
				type: "bearer",
				token: token,
				issuedAt: user.tokenInfo?.issuedAt || new Date(),
				expiresAt: user.tokenInfo?.expiresAt,
				...user.tokenInfo,
			},
		};
	}

	/**
	 * Check rate limiting for token
	 */
	private async checkRateLimit(token: string): Promise<boolean> {
		if (!this.maxRequestsPerToken) {
			return true;
		}

		const now = Date.now();
		const key = token;
		const current = this.rateLimitMap.get(key);

		if (!current || now > current.resetTime) {
			this.rateLimitMap.set(key, {
				count: 1,
				resetTime: now + this.rateLimitWindow * 1000,
			});
			return true;
		}

		if (current.count >= this.maxRequestsPerToken) {
			return false;
		}

		current.count++;
		return true;
	}

	/**
	 * Revoke a token
	 */
	async revokeToken(token: string): Promise<void> {
		try {
			// Remove from static list
			this.tokens.delete(token);

			// Revoke in storage system
			if (this.tokenStorage) {
				await this.tokenStorage.revoke(token);
			}

			// Remove from rate limit tracking
			this.rateLimitMap.delete(token);

			// Log revocation event
			this.logAuthEvent(
				"token_revoked",
				{ url: "/" } as Request,
				undefined,
				`Token revoked: ${token.substring(0, 8)}...`,
			);
		} catch (error) {
			console.error(
				`[BearerTokenStrategy] Error revoking token ${token.substring(0, 8)}...:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Create WWW-Authenticate challenge response
	 */
	challenge(_req: Request): Response {
		return new Response(
			JSON.stringify({
				error: "Authentication required",
				message: "Please provide a valid Bearer token",
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
	 * Get WWW-Authenticate header for this strategy
	 */
	protected getWWWAuthenticateHeader(): string {
		return 'Bearer realm="FHIR API", charset="UTF-8"';
	}

	/**
	 * Get default permissions for Bearer token users
	 * API tokens typically have broader permissions than basic auth
	 */
	protected getDefaultPermissions() {
		return {
			canRead: true,
			canWrite: true,
			canDelete: false,
			resources: {
				Patient: { read: true, write: true },
				Observation: { read: true, write: true },
				Practitioner: { read: true, write: true },
			},
			operations: {
				everything: true,
				match: false,
			},
			custom: {},
		};
	}

	/**
	 * Cleanup expired rate limit entries (currently unused but available for future use)
	 */
	// @ts-expect-error
	private _cleanupRateLimits(): void {
		const now = Date.now();
		for (const [key, data] of this.rateLimitMap.entries()) {
			if (now > data.resetTime) {
				this.rateLimitMap.delete(key);
			}
		}
		// This method is available for periodic cleanup in production deployments
		void this._cleanupRateLimits;
	}

	/**
	 * Get rate limit status for a token
	 */
	getRateLimitStatus(
		token: string,
	): { remaining: number; resetTime: number } | null {
		if (!this.maxRequestsPerToken) {
			return null;
		}

		const current = this.rateLimitMap.get(token);
		if (!current || Date.now() > current.resetTime) {
			return {
				remaining: this.maxRequestsPerToken,
				resetTime: Date.now() + this.rateLimitWindow * 1000,
			};
		}

		return {
			remaining: Math.max(0, this.maxRequestsPerToken - current.count),
			resetTime: current.resetTime,
		};
	}
}
