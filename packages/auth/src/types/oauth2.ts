import type { AuthenticatedUser, AuthStrategyConfig } from "./index.ts";

// ============================================================================
// OAuth2 Core Types
// ============================================================================

/**
 * OAuth2 Authorization Request (RFC 6749 Section 4.1.1)
 */
export interface AuthorizationRequest {
	response_type: "code";
	client_id: string;
	redirect_uri: string;
	scope: string;
	state: string;

	// PKCE parameters (RFC 7636)
	code_challenge?: string;
	code_challenge_method?: "S256" | "plain";

	// SMART on FHIR specific
	aud?: string; // FHIR server URL
	launch?: string; // Launch context identifier

	// OpenID Connect
	nonce?: string; // OIDC nonce
	response_mode?: string; // Response mode
	prompt?: string; // OIDC prompt parameter
	max_age?: number; // OIDC max age
}

/**
 * OAuth2 Token Request (RFC 6749 Section 4.1.3)
 */
export interface TokenRequest {
	grant_type: "authorization_code" | "refresh_token" | "client_credentials";

	// Authorization Code Grant
	code?: string;
	redirect_uri?: string;
	client_id: string;

	// Client Authentication
	client_secret?: string;

	// PKCE
	code_verifier?: string;

	// Refresh Token Grant
	refresh_token?: string;

	// Scope restriction
	scope?: string;
}

/**
 * OAuth2 Token Response (RFC 6749 Section 4.1.4)
 */
export interface TokenResponse {
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	refresh_token?: string;
	scope: string;

	// SMART on FHIR context (when applicable)
	patient?: string;
	encounter?: string;
	user?: string;

	// OpenID Connect
	id_token?: string;

	// Additional metadata
	fhir_version?: string;
}

/**
 * OAuth2 Error Response (RFC 6749 Section 4.1.2.1)
 */
export interface OAuth2ErrorResponse {
	error: OAuth2ErrorCode;
	error_description?: string;
	error_uri?: string;
	state?: string;
}

/**
 * OAuth2 Error Codes
 */
export type OAuth2ErrorCode =
	| "invalid_request"
	| "unauthorized_client"
	| "access_denied"
	| "unsupported_response_type"
	| "invalid_scope"
	| "server_error"
	| "temporarily_unavailable"
	| "invalid_client"
	| "invalid_grant"
	| "unsupported_grant_type"
	| "invalid_token";

// ============================================================================
// SMART on FHIR Types
// ============================================================================

/**
 * SMART on FHIR Scope
 */
export interface SMARTScope {
	context: "patient" | "user" | "system";
	resourceType: string; // '*' for all resources
	access: "read" | "write" | "*";
	originalScope: string; // Original scope string
	special?: string; // Special scopes like 'openid', 'launch', etc.
}

/**
 * FHIR Context Information
 */
export interface FHIRContext {
	patient?: string; // Patient ID in context
	encounter?: string; // Encounter ID in context
	user?: string; // User (Practitioner/Person) ID
	organization?: string; // Organization context
	location?: string; // Location context
}

/**
 * Launch Context Storage
 */
export interface LaunchContext {
	launch_id: string;
	client_id: string;
	context: FHIRContext;
	created_at: Date;
	expires_at: Date;
	user_id?: string; // User who initiated the launch
}

/**
 * SMART Client Configuration
 */
export interface SMARTClient {
	// OAuth2 Client Metadata (RFC 7591)
	client_id: string;
	client_secret?: string;
	client_name: string;
	client_type: "public" | "confidential";
	redirect_uris: string[];

	// Grant types and response types
	grant_types?: string[];
	response_types?: string[];

	// Scope configuration
	scopes: string[];
	default_scopes?: string[];

	// SMART on FHIR specific
	fhir_versions: string[];
	launch_uri?: string; // Launch URL for EHR integration

	// Client metadata
	software_id?: string;
	software_version?: string;
	logo_uri?: string;
	client_uri?: string;
	policy_uri?: string;
	tos_uri?: string;
	contacts?: string[];

	// Administrative
	created_at: Date;
	updated_at?: Date;
	status: "active" | "inactive" | "pending";
}

/**
 * Client Registration Request (RFC 7591)
 */
export interface ClientRegistration {
	client_name: string;
	client_type: "public" | "confidential";
	redirect_uris: string[];
	scopes?: string[];
	fhir_versions?: string[];

	// Optional metadata
	software_id?: string;
	software_version?: string;
	logo_uri?: string;
	launch_uri?: string;
}

// ============================================================================
// Authorization Server Configuration
// ============================================================================

/**
 * OAuth2/OIDC Authorization Server Configuration
 */
export interface AuthorizationServerConfig extends AuthStrategyConfig {
	// Server identification
	issuer: string; // OAuth2 issuer identifier
	fhir_server_url: string; // Base FHIR server URL

	// Endpoint configuration
	authorization_endpoint: string; // /oauth/authorize
	token_endpoint: string; // /oauth/token
	introspection_endpoint?: string; // /oauth/introspect
	revocation_endpoint?: string; // /oauth/revoke
	jwks_uri: string; // /.well-known/jwks.json
	userinfo_endpoint?: string; // /oauth/userinfo (OIDC)

	// Supported features
	grant_types: string[]; // ['authorization_code', 'refresh_token']
	response_types: string[]; // ['code']
	scopes: string[]; // Supported scopes

	// Token configuration
	authorization_code_ttl: number; // Authorization code lifetime (seconds)
	access_token_ttl: number; // Access token lifetime (seconds)
	refresh_token_ttl: number; // Refresh token lifetime (seconds)
	id_token_ttl?: number; // ID token lifetime (seconds)

	// Security settings
	require_pkce: boolean; // Enforce PKCE for all clients
	pkce_methods: string[]; // ['S256']
	token_binding_supported?: boolean; // Token binding support

	// SMART on FHIR specific
	launch_context_ttl: number; // Launch context lifetime (seconds)
	supported_fhir_versions: string[]; // ['4.0.1']

	// Signing configuration
	signing_algorithm: string; // 'RS256', 'HS256', etc.
	signing_key: string | Buffer; // Private key for signing
	signing_key_id?: string; // Key ID for JWK

	// Client management
	allow_dynamic_registration: boolean;
	require_client_approval: boolean;

	// OpenID Connect
	oidc_supported: boolean;
	subject_types: string[]; // ['public', 'pairwise']
	id_token_signing_alg: string[]; // Supported ID token signing algorithms
}

// ============================================================================
// Session and Storage Types
// ============================================================================

/**
 * Authorization Session (for consent flow)
 */
export interface AuthorizationSession {
	session_id: string;
	client_id: string;
	user_id?: string;
	scopes: string[];
	redirect_uri: string;
	state: string;

	// PKCE
	code_challenge?: string;
	code_challenge_method?: "S256" | "plain";

	// SMART context
	launch_context?: LaunchContext;
	audience?: string;

	// Session metadata
	created_at: Date;
	expires_at: Date;
	consent_given?: boolean;
	approved_scopes?: string[];
}

/**
 * Authorization Code
 */
export interface AuthorizationCode {
	code: string;
	client_id: string;
	user_id: string;
	scopes: string[];
	redirect_uri: string;

	// PKCE
	code_challenge?: string;
	code_challenge_method?: "S256" | "plain";

	// SMART context
	launch_context?: LaunchContext;

	// Timing
	created_at: Date;
	expires_at: Date;
	used?: boolean;
}

/**
 * Refresh Token
 */
export interface RefreshToken {
	token_hash: string;
	client_id: string;
	user_id: string;
	scopes: string[];

	// Token metadata
	created_at: Date;
	expires_at: Date;
	last_used?: Date;
	revoked?: boolean;

	// SMART context (may be updated on refresh)
	launch_context?: LaunchContext;
}

// ============================================================================
// Enhanced Authentication Types for SMART
// ============================================================================

/**
 * SMART-enhanced authenticated user
 */
export interface SMARTAuthenticatedUser extends AuthenticatedUser {
	metadata: AuthenticatedUser["metadata"] & {
		// SMART context
		smartContext?: FHIRContext;
		smartScopes?: SMARTScope[];

		// FHIR metadata
		fhir_version?: string;
		fhir_user?: string;

		// OAuth2 token metadata
		client_id?: string;
		token_type?: string;
		scope?: string;
	};
}

// ============================================================================
// Discovery and Metadata Types
// ============================================================================

/**
 * OAuth2 Authorization Server Metadata (RFC 8414)
 */
export interface AuthorizationServerMetadata {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	jwks_uri: string;

	// Optional endpoints
	registration_endpoint?: string;
	introspection_endpoint?: string;
	revocation_endpoint?: string;
	userinfo_endpoint?: string;

	// Supported capabilities
	scopes_supported: string[];
	response_types_supported: string[];
	grant_types_supported: string[];
	token_endpoint_auth_methods_supported: string[];

	// PKCE
	code_challenge_methods_supported: string[];

	// Additional metadata
	service_documentation?: string;
	ui_locales_supported?: string[];
}

/**
 * SMART on FHIR Configuration (SMART App Launch Framework)
 */
export interface SMARTConfiguration {
	authorization_endpoint: string;
	token_endpoint: string;
	token_endpoint_auth_methods_supported: string[];
	registration_endpoint?: string;
	scopes_supported: string[];
	response_types_supported: string[];
	management_endpoint?: string;
	introspection_endpoint?: string;
	revocation_endpoint?: string;
	capabilities: string[]; // SMART capabilities
	code_challenge_methods_supported: string[];
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * OAuth2 specific error
 */
export class OAuth2Error extends Error {
	constructor(
		public error: OAuth2ErrorCode,
		public description?: string,
		public uri?: string,
		public statusCode: number = 400,
	) {
		super(description || error);
		this.name = "OAuth2Error";
	}

	toResponse(state?: string): OAuth2ErrorResponse {
		return {
			error: this.error,
			error_description: this.description,
			error_uri: this.uri,
			state,
		};
	}
}

/**
 * SMART on FHIR specific error
 */
export class SMARTError extends OAuth2Error {
	constructor(
		error: OAuth2ErrorCode,
		description?: string,
		public fhirContext?: string,
	) {
		super(error, description);
		this.name = "SMARTError";
	}
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * PKCE Code Challenge and Verifier
 */
export interface PKCEChallenge {
	code_verifier: string;
	code_challenge: string;
	code_challenge_method: "S256";
}

/**
 * Token Introspection Response (RFC 7662)
 */
export interface TokenIntrospectionResponse {
	active: boolean;

	// Token metadata (if active)
	client_id?: string;
	username?: string;
	scope?: string;
	exp?: number;
	iat?: number;
	sub?: string;
	aud?: string | string[];
	iss?: string;
	jti?: string;

	// SMART context (if applicable)
	patient?: string;
	encounter?: string;
	fhirUser?: string;
}

/**
 * Client Credentials (for client authentication)
 */
export interface ClientCredentials {
	client_id: string;
	client_secret?: string;
	client_assertion?: string;
	client_assertion_type?: string;
}

/**
 * FHIR Context for SMART on FHIR
 */
export interface FHIRContext {
	patient?: string;
	encounter?: string;
	user?: string;
}

/**
 * Launch Context for SMART on FHIR apps
 */
export interface LaunchContext {
	launch_id: string;
	client_id: string;
	context: FHIRContext;
	created_at: Date;
	expires_at: Date;
}
