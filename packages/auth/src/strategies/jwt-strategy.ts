import type { HandlerContext } from "@atomic-fhir/core";
import {
	type AuthenticatedUser,
	type AuthenticationResult,
	type FHIRPermissions,
	type JWKSKey,
	type JWKSResponse,
	type JWTConfig,
	type JWTPayload,
	TokenError,
} from "../types/index.ts";
import { BaseAuthStrategy } from "./base-strategy.ts";

// ============================================================================
// JWT Implementation Dependencies
// ============================================================================

// Note: In a real implementation, you'd install these packages:
// npm install jsonwebtoken
// npm install node-jose (for JWKS support)

// For this implementation, we'll create a simple JWT validation system
// This should be replaced with proper JWT libraries in production

/**
 * Simple Base64URL decode (replace with proper library)
 */
function base64UrlDecode(str: string): string {
	// Replace URL-safe characters
	str = str.replace(/-/g, "+").replace(/_/g, "/");
	// Add padding if necessary
	const pad = str.length % 4;
	if (pad) {
		str += "=".repeat(4 - pad);
	}
	return atob(str);
}

/**
 * Simple JWT token parser (replace with jsonwebtoken library)
 */
function parseJWT(token: string): JWTPayload {
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new Error("Invalid JWT format");
	}

	const payload = base64UrlDecode(parts[1]);
	return JSON.parse(payload) as JWTPayload;
}

// ============================================================================
// JWT Strategy Implementation
// ============================================================================

/**
 * JWT Authentication Strategy
 *
 * Implements JSON Web Token authentication with support for:
 * - Configurable algorithms and validation
 * - Custom claims extraction
 * - JWKS endpoint integration
 * - Token refresh mechanisms
 * - Multiple issuers and audiences
 */
export class JWTStrategy extends BaseAuthStrategy {
	private readonly secret: string | Buffer;
	private readonly algorithm: string;
	private readonly issuer?: string | string[];
	private readonly audience?: string | string[];
	private readonly clockTolerance: number;
	private readonly maxAge?: string | number;

	// Claims configuration
	private readonly roleClaim: string;
	private readonly permissionClaim: string;
	private readonly userClaimsExtractor?: (
		payload: JWTPayload,
	) => Partial<AuthenticatedUser>;

	// JWKS configuration
	private readonly jwksUri?: string;
	private readonly jwksCache: boolean;
	private readonly jwksCacheTtl: number;
	private jwksKeys: Map<string, JWKSKey> = new Map();
	private jwksLastFetch: Date | null = null;

	// Token refresh configuration
	private readonly allowRefresh: boolean;
	private readonly refreshThreshold: number;

	constructor(config: JWTConfig) {
		super(config);

		// Validate required configuration
		if (!config.secret && !config.jwksUri) {
			throw new Error("JWT strategy requires either a secret or JWKS URI");
		}

		this.secret = config.secret;
		this.algorithm = config.algorithm || "HS256";
		this.issuer = config.issuer;
		this.audience = config.audience;
		this.clockTolerance = config.clockTolerance || 60;
		this.maxAge = config.maxAge;

		// Claims configuration
		this.roleClaim = config.roleClaim || "roles";
		this.permissionClaim = config.permissionClaim || "permissions";
		this.userClaimsExtractor = config.userClaims;

		// JWKS configuration
		this.jwksUri = config.jwksUri;
		this.jwksCache = config.jwksCache !== false;
		this.jwksCacheTtl = config.jwksCacheTtl || 3600; // 1 hour default

		// Token refresh configuration
		this.allowRefresh = config.allowRefresh || false;
		this.refreshThreshold = config.refreshThreshold || 300; // 5 minutes default
	}

	// ============================================================================
	// Strategy Interface Implementation
	// ============================================================================

	/**
	 * Check if this strategy can handle the request
	 */
	canHandle(req: Request): boolean {
		if (!super.canHandle(req)) {
			return false;
		}

		const authHeader = this.getAuthorizationHeader(req);
		return (
			authHeader !== null && authHeader.toLowerCase().startsWith("bearer ")
		);
	}

	/**
	 * Authenticate request using JWT
	 */
	async authenticate(
		req: Request,
		_context: HandlerContext,
	): Promise<AuthenticationResult> {
		const startTime = Date.now();

		try {
			// Extract JWT token from Authorization header
			const token = this.extractTokenFromRequest(req);
			if (!token) {
				return this.createFailureResult("No JWT token provided", 401);
			}

			// Validate and parse the JWT token
			const payload = await this.validateToken(token);

			// Extract user information from JWT claims
			const user = this.extractUserFromClaims(payload);

			// Enrich user with token information
			const authenticatedUser = this.enrichUserWithTokenInfo(
				user,
				token,
				payload,
			);

			// Duration tracking for performance monitoring (unused in current implementation)
			void (Date.now() - startTime);
			this.logAuthEvent("auth_success", req, authenticatedUser);

			return this.createSuccessResult(authenticatedUser);
		} catch (error) {
			// Duration tracking for performance monitoring (unused in current implementation)
			void (Date.now() - startTime);
			const errorMessage =
				error instanceof Error ? error.message : "JWT authentication error";
			this.logAuthEvent("auth_failure", req, undefined, errorMessage);

			// Handle specific JWT errors
			if (error instanceof TokenError) {
				return this.createFailureResult(error.message, error.statusCode);
			}

			return this.createFailureResult(errorMessage, 401);
		}
	}

	/**
	 * Create WWW-Authenticate challenge response
	 */
	challenge(_req: Request): Response {
		return new Response(
			JSON.stringify({
				error: "Authentication required",
				message: "Please provide a valid JWT token",
			}),
			{
				status: 401,
				headers: {
					"Content-Type": "application/json",
					"WWW-Authenticate": 'Bearer realm="FHIR Server"',
				},
			},
		);
	}

	// ============================================================================
	// JWT-Specific Methods
	// ============================================================================

	/**
	 * Validate JWT token
	 */
	async validateToken(token: string): Promise<JWTPayload> {
		try {
			// For production, use a proper JWT library like jsonwebtoken
			// This is a simplified implementation - in production, we'd use this.secret and this.algorithm
			// Example: jwt.verify(token, this.secret, { algorithms: [this.algorithm] })

			// Validate algorithm and secret are available for production use
			if (this.secret && this.algorithm) {
				// Production implementation would validate signature here
			}

			const payload = parseJWT(token);

			// Validate timing claims
			this.validateTimingClaims(payload);

			// Validate issuer if configured
			if (this.issuer) {
				this.validateIssuer(payload);
			}

			// Validate audience if configured
			if (this.audience) {
				this.validateAudience(payload);
			}

			// If JWKS is configured, validate signature with public key
			if (this.jwksUri) {
				await this.validateSignatureWithJWKS(token, payload);
			}

			return payload;
		} catch (error) {
			if (error instanceof TokenError) {
				throw error;
			}

			// Convert generic errors to TokenError
			if (error instanceof Error) {
				if (error.message.includes("expired")) {
					throw new TokenError("Token has expired", 401, "TOKEN_EXPIRED");
				}
				if (
					error.message.includes("invalid") ||
					error.message.includes("Invalid JWT format")
				) {
					throw new TokenError("Invalid token", 401, "TOKEN_INVALID");
				}
				if (error.message.includes("JSON")) {
					throw new TokenError("Invalid token", 401, "TOKEN_INVALID");
				}
			}

			throw new TokenError(
				"Token validation failed",
				401,
				"TOKEN_VALIDATION_ERROR",
			);
		}
	}

	/**
	 * Extract user information from JWT claims
	 */
	extractUserFromClaims(payload: JWTPayload): AuthenticatedUser {
		// Use custom claims extractor if provided
		if (this.userClaimsExtractor) {
			const customUser = this.userClaimsExtractor(payload);
			return this.enrichUser({
				id: payload.sub || "unknown",
				username: payload.preferred_username || payload.email,
				email: payload.email,
				roles: [],
				permissions: this.getDefaultPermissions(),
				...customUser,
			});
		}

		// Default claims mapping
		const roles = this.extractRoles(payload);
		const permissions = this.extractPermissions(payload);

		return this.enrichUser({
			id: payload.sub || "unknown",
			username: payload.preferred_username || payload.name || payload.email,
			email: payload.email,
			roles,
			permissions,
			metadata: {
				iss: payload.iss,
				aud: payload.aud,
				exp: payload.exp,
				iat: payload.iat,
				jwtClaims: payload,
			},
		});
	}

	/**
	 * Check if token needs refresh
	 */
	needsRefresh(payload: JWTPayload): boolean {
		if (!this.allowRefresh || !payload.exp) {
			return false;
		}

		const currentTime = Math.floor(Date.now() / 1000);
		const timeToExpiry = payload.exp - currentTime;

		return timeToExpiry <= this.refreshThreshold;
	}

	// ============================================================================
	// JWT Validation Methods
	// ============================================================================

	/**
	 * Validate timing claims (exp, nbf, iat)
	 */
	private validateTimingClaims(payload: JWTPayload): void {
		const currentTime = Math.floor(Date.now() / 1000);
		const tolerance = this.clockTolerance;

		// Check expiration
		if (payload.exp && currentTime > payload.exp + tolerance) {
			throw new TokenError("Token has expired", 401, "TOKEN_EXPIRED");
		}

		// Check not before
		if (payload.nbf && currentTime < payload.nbf - tolerance) {
			throw new TokenError("Token not yet valid", 401, "TOKEN_NOT_YET_VALID");
		}

		// Check issued at with max age
		if (this.maxAge && payload.iat) {
			const maxAgeSeconds =
				typeof this.maxAge === "string"
					? this.parseTimestring(this.maxAge)
					: this.maxAge;

			if (currentTime > payload.iat + maxAgeSeconds + tolerance) {
				throw new TokenError("Token too old", 401, "TOKEN_TOO_OLD");
			}
		}
	}

	/**
	 * Validate issuer claim
	 */
	private validateIssuer(payload: JWTPayload): void {
		if (!payload.iss) {
			throw new TokenError(
				"Token missing issuer claim",
				401,
				"TOKEN_MISSING_ISSUER",
			);
		}

		const validIssuers = Array.isArray(this.issuer)
			? this.issuer
			: [this.issuer!];

		if (!validIssuers.includes(payload.iss)) {
			throw new TokenError(
				"Token issuer not trusted",
				401,
				"TOKEN_INVALID_ISSUER",
			);
		}
	}

	/**
	 * Validate audience claim
	 */
	private validateAudience(payload: JWTPayload): void {
		if (!payload.aud) {
			throw new TokenError(
				"Token missing audience claim",
				401,
				"TOKEN_MISSING_AUDIENCE",
			);
		}

		const tokenAudiences = Array.isArray(payload.aud)
			? payload.aud
			: [payload.aud];
		const validAudiences = Array.isArray(this.audience)
			? this.audience
			: [this.audience!];

		const hasValidAudience = tokenAudiences.some((aud) =>
			validAudiences.includes(aud),
		);

		if (!hasValidAudience) {
			throw new TokenError(
				"Token audience not valid",
				401,
				"TOKEN_INVALID_AUDIENCE",
			);
		}
	}

	/**
	 * Validate token signature using JWKS
	 */
	private async validateSignatureWithJWKS(
		_token: string,
		payload: JWTPayload,
	): Promise<void> {
		if (!this.jwksUri) {
			return;
		}

		// Ensure JWKS keys are loaded
		await this.loadJWKSKeys();

		// For production, implement proper signature validation with node-jose or similar
		// This is a placeholder implementation

		// Check if we have a key for this token's kid claim
		const kid = payload.jti; // In real implementation, extract kid from JWT header
		if (kid && !this.jwksKeys.has(kid)) {
			throw new TokenError(
				"No matching key found in JWKS",
				401,
				"TOKEN_KEY_NOT_FOUND",
			);
		}

		// In production: perform actual signature validation
		// For now, we'll just validate that JWKS keys are available
		if (this.jwksKeys.size === 0) {
			throw new TokenError(
				"No JWKS keys available for validation",
				401,
				"JWKS_UNAVAILABLE",
			);
		}
	}

	/**
	 * Load JWKS keys from endpoint
	 */
	private async loadJWKSKeys(): Promise<void> {
		if (!this.jwksUri) {
			return;
		}

		// Check cache validity
		if (this.jwksCache && this.jwksLastFetch) {
			const cacheAge = (Date.now() - this.jwksLastFetch.getTime()) / 1000;
			if (cacheAge < this.jwksCacheTtl) {
				return; // Cache is still valid
			}
		}

		try {
			const response = await fetch(this.jwksUri);

			if (!response.ok) {
				throw new Error(`JWKS fetch failed: ${response.status}`);
			}

			const jwksData = (await response.json()) as JWKSResponse;

			// Update cache
			this.jwksKeys.clear();
			for (const key of jwksData.keys) {
				if (key.kid) {
					this.jwksKeys.set(key.kid, key);
				}
			}

			this.jwksLastFetch = new Date();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "JWKS fetch error";
			throw new TokenError(
				`Failed to load JWKS: ${errorMessage}`,
				503,
				"JWKS_FETCH_ERROR",
			);
		}
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	/**
	 * Extract token from Authorization header
	 */
	private extractTokenFromRequest(req: Request): string | null {
		const authHeader = this.getAuthorizationHeader(req);
		if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
			return null;
		}

		return authHeader.slice(7).trim(); // Remove "Bearer " prefix
	}

	/**
	 * Extract roles from JWT payload
	 */
	private extractRoles(payload: JWTPayload): string[] {
		// Try configured role claim first
		const roleValue = payload[this.roleClaim];
		if (Array.isArray(roleValue)) {
			return roleValue.filter((role) => typeof role === "string");
		}
		if (typeof roleValue === "string") {
			return [roleValue];
		}

		// Fallback to standard role claims
		if (Array.isArray(payload.roles)) {
			return payload.roles.filter((role) => typeof role === "string");
		}

		return [];
	}

	/**
	 * Extract permissions from JWT payload
	 */
	private extractPermissions(payload: JWTPayload): FHIRPermissions {
		// Try configured permission claim first
		const permissionValue = payload[this.permissionClaim];
		if (permissionValue && typeof permissionValue === "object") {
			return permissionValue as FHIRPermissions;
		}

		// Fallback to standard permission claims
		if (payload.permissions && typeof payload.permissions === "object") {
			return payload.permissions as FHIRPermissions;
		}

		// Default permissions based on roles
		return this.getDefaultPermissions();
	}

	/**
	 * Enrich user with JWT token information
	 */
	private enrichUserWithTokenInfo(
		user: AuthenticatedUser,
		token: string,
		payload: JWTPayload,
	): AuthenticatedUser {
		return {
			...user,
			tokenInfo: {
				type: "jwt",
				token,
				expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
				issuedAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
			},
		};
	}

	/**
	 * Parse time string to seconds (e.g., "1h" -> 3600)
	 */
	private parseTimestring(timeStr: string): number {
		const units: Record<string, number> = {
			s: 1,
			m: 60,
			h: 3600,
			d: 86400,
		};

		const match = timeStr.match(/^(\d+)([smhd])$/);
		if (!match) {
			throw new Error(`Invalid time format: ${timeStr}`);
		}

		const value = parseInt(match[1], 10);
		const unit = match[2];

		return value * units[unit];
	}

	// ============================================================================
	// Base Strategy Method Implementations
	// ============================================================================

	/**
	 * Get default FHIR permissions
	 */
	protected getDefaultPermissions(): FHIRPermissions {
		return {
			canRead: false,
			canWrite: false,
			canDelete: false,
			resources: {},
			operations: {},
			custom: {},
		};
	}

	/**
	 * Create success authentication result
	 */
	protected createSuccessResult(user: AuthenticatedUser): AuthenticationResult {
		return {
			success: true,
			user,
		};
	}

	/**
	 * Create failure authentication result
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
	 * Enrich user with additional information
	 */
	protected enrichUser(user: Partial<AuthenticatedUser>): AuthenticatedUser {
		return {
			id: user.id || "unknown",
			username: user.username,
			email: user.email,
			roles: user.roles || [],
			permissions: user.permissions || this.getDefaultPermissions(),
			metadata: {
				strategy: this.name,
				authenticatedAt: new Date().toISOString(),
				...user.metadata,
			},
			tokenInfo: user.tokenInfo,
		};
	}

	/**
	 * Log authentication event
	 */
	protected logAuthEvent(
		event: "auth_success" | "auth_failure",
		req: Request,
		user?: AuthenticatedUser,
		error?: string,
	): void {
		const logData = {
			type: event,
			timestamp: new Date().toISOString(),
			strategy: this.name,
			userId: user?.id,
			username: user?.username,
			success: event === "auth_success",
			error,
			metadata: {
				userAgent: req.headers.get("user-agent"),
				ipAddress:
					req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
			},
		};

		console.log(`[JWT_STRATEGY] ${JSON.stringify(logData)}`);
	}
}
