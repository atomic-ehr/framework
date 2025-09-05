import type { HandlerContext } from "@atomic-fhir/core";
import type { AuthenticationResult, FHIRPermissions } from "../types/index.ts";
import {
	type AuthorizationServerConfig,
	type FHIRContext,
	OAuth2Error,
	type SMARTAuthenticatedUser,
	SMARTError,
	type SMARTScope,
	type TokenIntrospectionResponse,
} from "../types/oauth2.ts";
import { BaseAuthStrategy } from "./base-strategy.ts";

// ============================================================================
// SMART Scope Parser
// ============================================================================

/**
 * Parser for SMART on FHIR scopes
 */
export class SMARTScopeParser {
	/**
	 * Parse SMART scope string into structured scopes
	 */
	parseScopes(scopeString: string): SMARTScope[] {
		if (!scopeString?.trim()) {
			return [];
		}

		return scopeString
			.split(/\s+/)
			.map((scope) => this.parseScope(scope.trim()));
	}

	/**
	 * Parse individual SMART scope
	 */
	private parseScope(scope: string): SMARTScope {
		// Handle standard SMART scopes: patient/Patient.read, user/Observation.*, system/*.write
		const smartMatch = scope.match(/^(patient|user|system)\/([^.]+|\*)\.(.+)$/);
		if (smartMatch) {
			const [, context, resourceType, access] = smartMatch;
			return {
				context: context as "patient" | "user" | "system",
				resourceType,
				access: access as "read" | "write" | "*",
				originalScope: scope,
			};
		}

		// Handle special scopes
		const specialScopes = [
			"openid",
			"profile",
			"email",
			"phone",
			"address",
			"fhirUser",
			"launch",
			"launch/patient",
			"launch/encounter",
			"online_access",
			"offline_access",
		];

		if (specialScopes.includes(scope)) {
			return {
				context: "system",
				resourceType: "*",
				access: "*",
				originalScope: scope,
				special: scope,
			};
		}

		// Invalid scope
		throw new SMARTError("invalid_scope", `Unsupported scope: ${scope}`);
	}

	/**
	 * Convert SMART scopes to FHIR permissions
	 */
	scopesToPermissions(scopes: SMARTScope[]): FHIRPermissions {
		const permissions: FHIRPermissions = {
			canRead: false,
			canWrite: false,
			canDelete: false,
			resources: {},
			operations: {},
			custom: {
				smartScopes: scopes,
			},
		};

		for (const scope of scopes) {
			// Skip special scopes for permission calculation
			if (scope.special) {
				continue;
			}

			// Handle wildcard resource type
			if (scope.resourceType === "*") {
				if (scope.access === "read" || scope.access === "*") {
					permissions.canRead = true;
				}
				if (scope.access === "write" || scope.access === "*") {
					permissions.canWrite = true;
					permissions.canDelete = true; // Write implies delete capability
				}
				continue;
			}

			// Resource-specific permissions
			if (!permissions.resources![scope.resourceType]) {
				permissions.resources![scope.resourceType] = {};
			}

			const resourcePerms = permissions.resources![scope.resourceType];

			if (scope.access === "read" || scope.access === "*") {
				resourcePerms.read = true;
				resourcePerms.vread = true;
				resourcePerms.search = true;
				resourcePerms["history-type"] = true;
				resourcePerms.history = true;
			}

			if (scope.access === "write" || scope.access === "*") {
				resourcePerms.create = true;
				resourcePerms.update = true;
				resourcePerms.patch = true;
				resourcePerms.delete = true;
			}
		}

		return permissions;
	}
}

// ============================================================================
// OAuth2/SMART Authentication Strategy
// ============================================================================

/**
 * OAuth2/SMART on FHIR Authentication Strategy
 *
 * This strategy handles OAuth2 Bearer tokens with SMART context validation.
 * It extends the JWT strategy to include SMART-specific features like:
 * - FHIR context validation and injection
 * - SMART scope parsing and permission mapping
 * - Token introspection for external OAuth2 servers
 * - Launch context resolution
 */
export class OAuth2Strategy extends BaseAuthStrategy {
	protected readonly config: AuthorizationServerConfig;
	private readonly scopeParser: SMARTScopeParser;

	constructor(config: AuthorizationServerConfig) {
		super(config);
		this.config = config;
		this.scopeParser = new SMARTScopeParser();
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
	 * Authenticate request using OAuth2 Bearer token
	 */
	async authenticate(
		req: Request,
		context: HandlerContext,
	): Promise<AuthenticationResult> {
		const startTime = Date.now();

		try {
			// Extract Bearer token
			const token = this.extractTokenFromRequest(req);
			if (!token) {
				return this.createFailureResult("No Bearer token provided", 401);
			}

			// Validate token and get user information
			const tokenInfo = await this.validateBearerToken(token);

			// Extract user information from token
			const user = await this.extractUserFromToken(tokenInfo, token);

			// Validate SMART context if present
			if (user.metadata?.smartContext) {
				await this.validateFHIRContext(user.metadata.smartContext, context);
			}

			const duration = Date.now() - startTime;
			this.logAuthEvent("auth_success", req, user, undefined, { duration });

			return this.createSuccessResult(user);
		} catch (error) {
			const duration = Date.now() - startTime;
			const errorMessage =
				error instanceof Error ? error.message : "OAuth2 authentication error";
			this.logAuthEvent("auth_failure", req, undefined, errorMessage, {
				duration,
			});

			if (error instanceof OAuth2Error || error instanceof SMARTError) {
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
				message: "Please provide a valid OAuth2 Bearer token",
				authorization_endpoint: this.config.authorization_endpoint,
				token_endpoint: this.config.token_endpoint,
				scopes_supported: this.config.scopes,
			}),
			{
				status: 401,
				headers: {
					"Content-Type": "application/json",
					"WWW-Authenticate": `Bearer realm="${this.config.issuer}"`,
				},
			},
		);
	}

	// ============================================================================
	// Token Validation Methods
	// ============================================================================

	/**
	 * Validate Bearer token (could be JWT or opaque token)
	 */
	private async validateBearerToken(
		token: string,
	): Promise<TokenIntrospectionResponse> {
		// If token looks like JWT, try to parse it directly
		if (this.isJWT(token)) {
			return this.parseJWTToken(token);
		}

		// Otherwise, use token introspection
		return this.introspectToken(token);
	}

	/**
	 * Check if token appears to be a JWT
	 */
	private isJWT(token: string): boolean {
		return token.includes(".") && token.split(".").length === 3;
	}

	/**
	 * Parse JWT token for SMART information
	 */
	private parseJWTToken(token: string): TokenIntrospectionResponse {
		try {
			const parts = token.split(".");
			if (parts.length !== 3) {
				throw new OAuth2Error("invalid_token", "Invalid JWT format");
			}

			// Decode payload (simplified - production should validate signature)
			const payload = JSON.parse(this.base64UrlDecode(parts[1]));

			// Validate timing claims
			const currentTime = Math.floor(Date.now() / 1000);
			if (payload.exp && currentTime > payload.exp) {
				throw new OAuth2Error("invalid_token", "Token has expired");
			}

			if (payload.nbf && currentTime < payload.nbf) {
				throw new OAuth2Error("invalid_token", "Token not yet valid");
			}

			return {
				active: true,
				client_id: payload.client_id || payload.azp,
				username: payload.preferred_username || payload.name,
				scope: payload.scope,
				exp: payload.exp,
				iat: payload.iat,
				sub: payload.sub,
				aud: payload.aud,
				iss: payload.iss,
				jti: payload.jti,
				// SMART context
				patient: payload.patient,
				encounter: payload.encounter,
				fhirUser: payload.fhirUser || payload.sub,
				...payload, // Include any additional claims
			};
		} catch (error) {
			if (error instanceof OAuth2Error) {
				throw error;
			}
			throw new OAuth2Error("invalid_token", "Failed to parse JWT token");
		}
	}

	/**
	 * Introspect opaque token
	 */
	private async introspectToken(
		token: string,
	): Promise<TokenIntrospectionResponse> {
		if (!this.config.introspection_endpoint) {
			throw new OAuth2Error(
				"server_error",
				"Token introspection not configured",
			);
		}

		try {
			const response = await fetch(this.config.introspection_endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: this.getClientAuthorizationHeader(),
				},
				body: new URLSearchParams({
					token: token,
					token_type_hint: "access_token",
				}),
			});

			if (!response.ok) {
				throw new OAuth2Error(
					"server_error",
					`Token introspection failed: ${response.status}`,
				);
			}

			const introspectionResult =
				(await response.json()) as TokenIntrospectionResponse;

			if (!introspectionResult.active) {
				throw new OAuth2Error("invalid_token", "Token is not active");
			}

			return introspectionResult;
		} catch (error) {
			if (error instanceof OAuth2Error) {
				throw error;
			}
			throw new OAuth2Error("server_error", "Token introspection failed");
		}
	}

	// ============================================================================
	// User Extraction and Context Validation
	// ============================================================================

	/**
	 * Extract user information from validated token
	 */
	private async extractUserFromToken(
		tokenInfo: TokenIntrospectionResponse,
		token: string,
	): Promise<SMARTAuthenticatedUser> {
		// Parse SMART scopes
		const scopes = tokenInfo.scope
			? this.scopeParser.parseScopes(tokenInfo.scope)
			: [];

		// Convert scopes to permissions
		const permissions = this.scopeParser.scopesToPermissions(scopes);

		// Extract FHIR context
		const smartContext: FHIRContext = {
			patient: tokenInfo.patient,
			encounter: tokenInfo.encounter,
			user: tokenInfo.fhirUser || tokenInfo.sub,
		};

		// Create SMART-enhanced user
		const user: SMARTAuthenticatedUser = {
			id: tokenInfo.sub || tokenInfo.username || "unknown",
			username: tokenInfo.username,
			email: (tokenInfo as any).email,
			roles: this.extractRolesFromToken(tokenInfo),
			permissions,
			metadata: {
				strategy: this.name,
				authenticatedAt: new Date().toISOString(),
				// OAuth2 metadata
				client_id: tokenInfo.client_id,
				token_type: "Bearer",
				scope: tokenInfo.scope,
				// SMART metadata
				smartContext,
				smartScopes: scopes,
				fhir_version: this.config.supported_fhir_versions[0],
				fhir_user: tokenInfo.fhirUser,
				// Token metadata
				tokenInfo: {
					type: "bearer",
					token,
					expiresAt: tokenInfo.exp ? new Date(tokenInfo.exp * 1000) : undefined,
					issuedAt: tokenInfo.iat ? new Date(tokenInfo.iat * 1000) : new Date(),
				},
			},
		};

		return user;
	}

	/**
	 * Extract roles from token information
	 */
	private extractRolesFromToken(
		tokenInfo: TokenIntrospectionResponse,
	): string[] {
		// Try various role claims
		const roleFields = ["roles", "role", "groups", "authorities"];

		for (const field of roleFields) {
			const roleValue = (tokenInfo as any)[field];
			if (Array.isArray(roleValue)) {
				return roleValue.filter((role) => typeof role === "string");
			}
			if (typeof roleValue === "string") {
				return [roleValue];
			}
		}

		// Default role based on SMART context
		if (tokenInfo.patient) {
			return ["patient"];
		}
		if (tokenInfo.fhirUser) {
			return ["practitioner"];
		}

		return ["user"];
	}

	/**
	 * Validate FHIR context against actual resources
	 */
	private async validateFHIRContext(
		context: FHIRContext,
		handlerContext: HandlerContext,
	): Promise<void> {
		const { storage } = handlerContext;

		// Validate patient exists and is accessible
		if (context.patient) {
			try {
				const patient = await storage.read("Patient", context.patient);
				if (!patient) {
					throw new SMARTError(
						"invalid_request",
						"Patient not found in context",
						context.patient,
					);
				}
			} catch (error) {
				throw new SMARTError(
					"access_denied",
					"Cannot access patient in context",
					context.patient,
				);
			}
		}

		// Validate encounter exists and is associated with patient
		if (context.encounter) {
			try {
				const encounter = await storage.read("Encounter", context.encounter);
				if (!encounter) {
					throw new SMARTError(
						"invalid_request",
						"Encounter not found in context",
						context.encounter,
					);
				}

				// Verify encounter-patient association
				if (context.patient) {
					const patientRef = encounter.subject?.reference;
					const expectedRef = `Patient/${context.patient}`;
					if (patientRef !== expectedRef) {
						throw new SMARTError(
							"access_denied",
							"Encounter not associated with patient in context",
						);
					}
				}
			} catch (error) {
				if (error instanceof SMARTError) {
					throw error;
				}
				throw new SMARTError(
					"access_denied",
					"Cannot access encounter in context",
					context.encounter,
				);
			}
		}

		// Validate user/practitioner exists
		if (context.user && context.user !== "system") {
			try {
				// Try to find user as Practitioner, Person, or RelatedPerson
				const resourceTypes = ["Practitioner", "Person", "RelatedPerson"];
				let userFound = false;

				for (const resourceType of resourceTypes) {
					try {
						const user = await storage.read(resourceType, context.user);
						if (user) {
							userFound = true;
							break;
						}
					} catch {
						// Continue to next resource type
					}
				}

				if (!userFound) {
					throw new SMARTError(
						"invalid_request",
						"User not found in context",
						context.user,
					);
				}
			} catch (error) {
				if (error instanceof SMARTError) {
					throw error;
				}
				throw new SMARTError(
					"access_denied",
					"Cannot access user in context",
					context.user,
				);
			}
		}
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	/**
	 * Extract Bearer token from Authorization header
	 */
	private extractTokenFromRequest(req: Request): string | null {
		const authHeader = this.getAuthorizationHeader(req);
		if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
			return null;
		}

		return authHeader.slice(7).trim(); // Remove "Bearer " prefix
	}

	/**
	 * Get client authorization header for introspection
	 */
	private getClientAuthorizationHeader(): string {
		// For simplicity, assume client credentials are configured
		// In production, this would be properly configured per client
		const credentials = btoa("introspection-client:introspection-secret");
		return `Basic ${credentials}`;
	}

	/**
	 * Base64URL decode utility
	 */
	private base64UrlDecode(str: string): string {
		// Add padding if necessary
		str += new Array(5 - (str.length % 4)).join("=");
		return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
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
	protected createSuccessResult(
		user: SMARTAuthenticatedUser,
	): AuthenticationResult {
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
	 * Log authentication event with additional OAuth2/SMART context
	 */
	protected logAuthEvent(
		event: "auth_success" | "auth_failure",
		req: Request,
		user?: SMARTAuthenticatedUser,
		error?: string,
		metadata?: Record<string, any>,
	): void {
		const logData = {
			type: event,
			timestamp: new Date().toISOString(),
			strategy: this.name,
			userId: user?.id,
			username: user?.username,
			clientId: user?.metadata?.client_id,
			smartContext: user?.metadata?.smartContext,
			scopes: user?.metadata?.scope,
			success: event === "auth_success",
			error,
			metadata: {
				userAgent: req.headers.get("user-agent"),
				ipAddress:
					req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
				...metadata,
			},
		};

		console.log(`[OAUTH2_STRATEGY] ${JSON.stringify(logData)}`);
	}
}
