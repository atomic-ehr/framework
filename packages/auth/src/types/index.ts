import type { HandlerContext } from "@atomic-fhir/core";

// ============================================================================
// Core Authentication Types
// ============================================================================

/**
 * Authentication result from strategy
 */
export interface AuthenticationResult {
	success: boolean;
	user?: AuthenticatedUser;
	error?: string;
	statusCode?: number;
}

/**
 * Authenticated user information
 */
export interface AuthenticatedUser {
	id: string;
	username?: string;
	email?: string;
	roles: string[];
	permissions: FHIRPermissions;
	metadata?: Record<string, any>;
	tokenInfo?: TokenInfo;
}

/**
 * Token information for session management
 */
export interface TokenInfo {
	type: "bearer" | "jwt" | "session";
	token: string;
	expiresAt?: Date;
	issuedAt: Date;
	refreshToken?: string;
}

/**
 * FHIR-specific permissions
 */
export interface FHIRPermissions {
	// Global permissions
	canRead?: boolean;
	canWrite?: boolean;
	canDelete?: boolean;

	// Resource-specific permissions
	resources?: {
		[resourceType: string]: ResourcePermissions;
	};

	// Operation-specific permissions
	operations?: {
		[operationName: string]: boolean;
	};

	// Custom permission rules
	custom?: Record<string, any>;
}

/**
 * Permissions for a specific FHIR resource type
 */
export interface ResourcePermissions {
	// Instance-level operations
	read?: boolean;
	vread?: boolean;
	update?: boolean;
	patch?: boolean;
	delete?: boolean;
	history?: boolean;

	// Type-level operations
	create?: boolean;
	search?: boolean;
	"history-type"?: boolean;

	// Conditional operations
	"update-conditional"?: boolean;
	"patch-conditional"?: boolean;
	"delete-conditional"?: boolean;
	"create-conditional"?: boolean;

	// Custom conditions and filters
	conditions?: PermissionCondition[];
	searchFilters?: Record<string, any>;
}

/**
 * Conditional permission rules
 */
export interface PermissionCondition {
	field: string;
	operator: "eq" | "ne" | "in" | "not-in" | "contains" | "custom";
	value: any;
	customValidator?: (
		resource: any,
		user: AuthenticatedUser,
		context?: any,
	) => boolean;
	context?: {
		description?: string;
		metadata?: Record<string, any>;
	};
}

// ============================================================================
// Authentication Strategy Types
// ============================================================================

/**
 * Base configuration for authentication strategies
 */
export interface AuthStrategyConfig {
	name: string;
	priority?: number;
	enabled?: boolean;
	skipPaths?: string[];
	onlyPaths?: string[];
}

/**
 * Authentication strategy interface
 */
export interface AuthStrategy {
	readonly name: string;
	readonly priority: number;

	/**
	 * Authenticate a request
	 */
	authenticate(
		req: Request,
		context: HandlerContext,
	): Promise<AuthenticationResult>;

	/**
	 * Validate if this strategy can handle the request
	 */
	canHandle(req: Request): boolean;

	/**
	 * Optional: Handle authentication challenges (401 responses)
	 */
	challenge?(req: Request): Response;
}

/**
 * Basic Auth strategy configuration
 */
export interface BasicAuthConfig extends AuthStrategyConfig {
	users?: Record<string, string>; // username -> password
	userProvider?: (
		username: string,
	) => Promise<{ password: string; user: Partial<AuthenticatedUser> } | null>;
	hashPasswords?: boolean;
	realm?: string;
}

/**
 * Bearer Token strategy configuration
 */
export interface BearerTokenConfig extends AuthStrategyConfig {
	tokens?: Record<string, Partial<AuthenticatedUser>>; // token -> user
	tokenProvider?: (token: string) => Promise<AuthenticatedUser | null>;
	tokenStorage?: TokenStorage;
}

/**
 * JWT strategy configuration
 */
export interface JWTConfig extends AuthStrategyConfig {
	// Token validation
	secret: string | Buffer;
	algorithm?: string; // Default: HS256
	issuer?: string | string[]; // Expected issuer
	audience?: string | string[]; // Expected audience

	// Timing
	clockTolerance?: number; // Seconds (default: 60)
	maxAge?: string | number; // Maximum token age

	// Claims mapping
	userClaims?: (payload: JWTPayload) => Partial<AuthenticatedUser>;
	roleClaim?: string; // Claim containing user roles
	permissionClaim?: string; // Claim containing permissions

	// JWKS support
	jwksUri?: string; // JWKS endpoint for key retrieval
	jwksCache?: boolean; // Cache JWKS keys
	jwksCacheTtl?: number; // JWKS cache TTL in seconds

	// Token refresh
	allowRefresh?: boolean;
	refreshThreshold?: number; // Seconds before expiry to allow refresh
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
	iss?: string; // Issuer
	sub?: string; // Subject (user ID)
	aud?: string | string[]; // Audience
	exp?: number; // Expiration time
	nbf?: number; // Not before
	iat?: number; // Issued at
	jti?: string; // JWT ID

	// Standard claims
	name?: string;
	preferred_username?: string;
	email?: string;
	email_verified?: boolean;

	// Custom claims
	roles?: string[];
	permissions?: any;
	[key: string]: any; // Allow additional claims
}

/**
 * JWKS key structure
 */
export interface JWKSKey {
	kty: string; // Key type
	use?: string; // Usage
	kid?: string; // Key ID
	alg?: string; // Algorithm
	n?: string; // RSA modulus
	e?: string; // RSA exponent
	x?: string; // EC x coordinate
	y?: string; // EC y coordinate
	crv?: string; // EC curve
	k?: string; // Symmetric key
}

/**
 * JWKS response structure
 */
export interface JWKSResponse {
	keys: JWKSKey[];
}

/**
 * Token error for JWT-specific errors
 */
export class TokenError extends Error {
	constructor(
		message: string,
		public statusCode: number,
		public code: string,
	) {
		super(message);
		this.name = "TokenError";
	}
}

/**
 * OAuth2/OIDC configuration (for future SMART on FHIR)
 */
export interface OAuth2Config extends AuthStrategyConfig {
	clientId: string;
	clientSecret?: string;
	authorizationUrl: string;
	tokenUrl: string;
	userInfoUrl?: string;
	scopes: string[];
	redirectUri: string;
	pkce?: boolean;
}

// ============================================================================
// Storage and Session Types
// ============================================================================

/**
 * Token storage interface for persisting authentication tokens
 */
export interface TokenStorage {
	store(
		token: string,
		user: AuthenticatedUser,
		expiresAt?: Date,
	): Promise<void>;
	retrieve(token: string): Promise<AuthenticatedUser | null>;
	revoke(token: string): Promise<void>;
	cleanup(): Promise<void>; // Remove expired tokens
}

/**
 * Session storage interface
 */
export interface SessionStorage {
	create(sessionId: string, data: SessionData, expiresAt?: Date): Promise<void>;
	get(sessionId: string): Promise<SessionData | null>;
	update(sessionId: string, data: Partial<SessionData>): Promise<void>;
	destroy(sessionId: string): Promise<void>;
	cleanup(): Promise<void>;
}

/**
 * Session data structure
 */
export interface SessionData {
	userId: string;
	user: AuthenticatedUser;
	createdAt: Date;
	lastAccessedAt: Date;
	metadata?: Record<string, any>;
}

// ============================================================================
// Manager and Middleware Types
// ============================================================================

/**
 * Authentication manager configuration
 */
export interface AuthManagerConfig {
	strategies: AuthStrategy[];
	defaultRole?: string;
	requireAuth?: boolean;
	skipPaths?: string[];
	onlyPaths?: string[];
	sessionStorage?: SessionStorage;
	tokenStorage?: TokenStorage;
	auditEnabled?: boolean;
}

/**
 * Enhanced handler context with authentication
 */
export interface AuthenticatedContext extends HandlerContext {
	user?: AuthenticatedUser;
	isAuthenticated: boolean;
	checkPermission: (
		resource: string,
		operation: string,
		resourceData?: any,
	) => boolean;
	hasRole: (role: string) => boolean;
	hasPermission: (permission: string) => boolean;
}

/**
 * Authentication middleware configuration
 */
export interface AuthMiddlewareConfig {
	authManager: any; // Will be the AuthManager class
	skipPaths?: string[];
	onlyPaths?: string[];
	requireAuth?: boolean;
	onUnauthenticated?: (req: Request) => Response;
	onUnauthorized?: (req: Request, user: AuthenticatedUser) => Response;
}

// ============================================================================
// Audit and Event Types
// ============================================================================

/**
 * Authentication event types for audit logging
 */
export type AuthEventType =
	| "auth_success"
	| "auth_failure"
	| "auth_challenge"
	| "token_issued"
	| "token_refreshed"
	| "token_revoked"
	| "session_created"
	| "session_destroyed"
	| "permission_denied"
	| "role_changed";

/**
 * Authentication audit event
 */
export interface AuthAuditEvent {
	type: AuthEventType;
	timestamp: Date;
	userId?: string;
	username?: string;
	strategy: string;
	resource?: string;
	operation?: string;
	ipAddress?: string;
	userAgent?: string;
	success: boolean;
	error?: string;
	metadata?: Record<string, any>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Authentication-specific errors
 */
export class AuthenticationError extends Error {
	constructor(
		message: string,
		public statusCode: number = 401,
		public code: string = "AUTH_FAILED",
	) {
		super(message);
		this.name = "AuthenticationError";
	}
}

/**
 * Authorization-specific errors
 */
export class AuthorizationError extends Error {
	constructor(
		message: string,
		public statusCode: number = 403,
		public code: string = "ACCESS_DENIED",
	) {
		super(message);
		this.name = "AuthorizationError";
	}
}
