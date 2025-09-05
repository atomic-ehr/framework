import type { HandlerContext, MiddlewareDefinition } from "@atomic-fhir/core";
import {
	type AuthorizationRequest,
	type AuthorizationServerConfig,
	type AuthorizationServerMetadata,
	type FHIRContext,
	type LaunchContext,
	OAuth2Error,
	type OAuth2ErrorResponse,
	type SMARTClient,
	type SMARTConfiguration,
	type TokenRequest,
	type TokenResponse,
} from "../types/oauth2.ts";

// ============================================================================
// OAuth2 Authorization Server Endpoints
// ============================================================================

/**
 * Authorization Endpoint Handler
 * Implements RFC 6749 Section 4.1.1 - Authorization Request
 */
class AuthorizationEndpoint {
	constructor(private config: AuthorizationServerConfig) {}

	async handle(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const authRequest = this.parseAuthorizationRequest(url.searchParams);

			// Validate client
			const client = await this.validateClient(
				authRequest.client_id,
				authRequest.redirect_uri,
			);

			// Validate scopes
			const validatedScopes = this.validateScopes(authRequest.scope, client);

			// Handle SMART launch context
			let launchContext: LaunchContext | undefined;
			if (authRequest.launch) {
				launchContext = await this.resolveLaunchContext(authRequest.launch);
			}

			// For this design phase, we'll return a simple consent page
			// In production, this would redirect to a proper consent UI
			return this.renderConsentPage({
				client,
				scopes: validatedScopes,
				authRequest,
				launchContext,
			});
		} catch (error) {
			return this.handleAuthorizationError(error, req);
		}
	}

	private parseAuthorizationRequest(
		params: URLSearchParams,
	): AuthorizationRequest {
		const response_type = params.get("response_type");
		const client_id = params.get("client_id");
		const redirect_uri = params.get("redirect_uri");
		const scope = params.get("scope");
		const state = params.get("state");

		if (!response_type || !client_id || !redirect_uri || !scope) {
			throw new OAuth2Error("invalid_request", "Missing required parameters");
		}

		if (response_type !== "code") {
			throw new OAuth2Error(
				"unsupported_response_type",
				"Only authorization_code flow supported",
			);
		}

		return {
			response_type: "code",
			client_id,
			redirect_uri,
			scope,
			state: state || "",
			code_challenge: params.get("code_challenge") || undefined,
			code_challenge_method:
				(params.get("code_challenge_method") as "S256" | "plain") || undefined,
			aud: params.get("aud") || undefined,
			launch: params.get("launch") || undefined,
			nonce: params.get("nonce") || undefined,
		};
	}

	private async validateClient(
		clientId: string,
		redirectUri: string,
	): Promise<SMARTClient> {
		// This would integrate with the client registry
		// For now, return a mock client
		return {
			client_id: clientId,
			client_name: "Example SMART App",
			client_type: "public",
			redirect_uris: [redirectUri],
			scopes: ["patient/Patient.read", "patient/Observation.read"],
			fhir_versions: ["4.0.1"],
			created_at: new Date(),
			status: "active",
		};
	}

	private validateScopes(scopeString: string, client: SMARTClient): string[] {
		const requestedScopes = scopeString.split(" ");
		const allowedScopes = client.scopes;

		const validScopes = requestedScopes.filter(
			(scope) =>
				allowedScopes.includes(scope) || this.config.scopes.includes(scope),
		);

		if (validScopes.length === 0) {
			throw new OAuth2Error("invalid_scope", "No valid scopes requested");
		}

		return validScopes;
	}

	private async resolveLaunchContext(
		launchId: string,
	): Promise<LaunchContext | undefined> {
		// This would integrate with launch context storage
		// For now, return mock context
		return {
			launch_id: launchId,
			client_id: "example-client",
			context: {
				patient: "patient-123",
				encounter: "encounter-456",
			},
			created_at: new Date(),
			expires_at: new Date(Date.now() + this.config.launch_context_ttl * 1000),
		};
	}

	private renderConsentPage(data: {
		client: SMARTClient;
		scopes: string[];
		authRequest: AuthorizationRequest;
		launchContext?: LaunchContext;
	}): Response {
		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Required</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .app-info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          .scope-list { list-style-type: none; padding: 0; }
          .scope-item { padding: 8px; margin: 5px 0; background: #e8f4fd; border-radius: 3px; }
          .context-info { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .buttons { text-align: center; margin-top: 30px; }
          button { margin: 0 10px; padding: 10px 30px; font-size: 16px; border-radius: 5px; cursor: pointer; }
          .approve { background: #28a745; color: white; border: none; }
          .deny { background: #dc3545; color: white; border: none; }
        </style>
      </head>
      <body>
        <div class="app-info">
          <h2>${data.client.client_name}</h2>
          <p>This application is requesting access to your FHIR data.</p>
        </div>
        
        <h3>Requested Permissions:</h3>
        <ul class="scope-list">
          ${data.scopes.map((scope) => `<li class="scope-item">${scope}</li>`).join("")}
        </ul>
        
        ${
					data.launchContext
						? `
          <div class="context-info">
            <h4>Launch Context:</h4>
            <p><strong>Patient:</strong> ${data.launchContext.context.patient || "Not specified"}</p>
            <p><strong>Encounter:</strong> ${data.launchContext.context.encounter || "Not specified"}</p>
          </div>
        `
						: ""
				}
        
        <div class="buttons">
          <form method="POST" style="display: inline;">
            <input type="hidden" name="client_id" value="${data.authRequest.client_id}">
            <input type="hidden" name="redirect_uri" value="${data.authRequest.redirect_uri}">
            <input type="hidden" name="scope" value="${data.authRequest.scope}">
            <input type="hidden" name="state" value="${data.authRequest.state}">
            <input type="hidden" name="code_challenge" value="${data.authRequest.code_challenge || ""}">
            <input type="hidden" name="code_challenge_method" value="${data.authRequest.code_challenge_method || ""}">
            <input type="hidden" name="launch" value="${data.authRequest.launch || ""}">
            <input type="hidden" name="action" value="approve">
            <button type="submit" class="approve">Authorize</button>
          </form>
          
          <form method="POST" style="display: inline;">
            <input type="hidden" name="client_id" value="${data.authRequest.client_id}">
            <input type="hidden" name="redirect_uri" value="${data.authRequest.redirect_uri}">
            <input type="hidden" name="state" value="${data.authRequest.state}">
            <input type="hidden" name="action" value="deny">
            <button type="submit" class="deny">Deny</button>
          </form>
        </div>
      </body>
      </html>
    `;

		return new Response(html, {
			headers: { "Content-Type": "text/html" },
		});
	}

	private handleAuthorizationError(error: unknown, _req: Request): Response {
		if (error instanceof OAuth2Error) {
			const errorResponse: OAuth2ErrorResponse = {
				error: error.error,
				error_description: error.description,
				error_uri: error.uri,
			};

			return new Response(JSON.stringify(errorResponse), {
				status: error.statusCode,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(
			JSON.stringify({
				error: "server_error",
				error_description: "Internal server error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

/**
 * Token Endpoint Handler
 * Implements RFC 6749 Section 4.1.3 - Access Token Request
 */
class TokenEndpoint {
	constructor(private config: AuthorizationServerConfig) {}

	async handle(req: Request): Promise<Response> {
		try {
			if (req.method !== "POST") {
				throw new OAuth2Error("invalid_request", "POST method required");
			}

			const tokenRequest = await this.parseTokenRequest(req);
			const client = await this.authenticateClient(req, tokenRequest);

			let tokenResponse: TokenResponse;

			switch (tokenRequest.grant_type) {
				case "authorization_code":
					tokenResponse = await this.handleAuthorizationCodeGrant(
						tokenRequest,
						client,
					);
					break;
				case "refresh_token":
					tokenResponse = await this.handleRefreshTokenGrant(
						tokenRequest,
						client,
					);
					break;
				default:
					throw new OAuth2Error(
						"unsupported_grant_type",
						`Grant type ${tokenRequest.grant_type} not supported`,
					);
			}

			return new Response(JSON.stringify(tokenResponse), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			});
		} catch (error) {
			return this.handleTokenError(error);
		}
	}

	private async parseTokenRequest(req: Request): Promise<TokenRequest> {
		const contentType = req.headers.get("content-type");
		if (!contentType?.includes("application/x-www-form-urlencoded")) {
			throw new OAuth2Error("invalid_request", "Invalid content type");
		}

		const body = await req.text();
		const params = new URLSearchParams(body);

		const grant_type = params.get("grant_type") as TokenRequest["grant_type"];
		if (!grant_type) {
			throw new OAuth2Error("invalid_request", "Missing grant_type parameter");
		}

		return {
			grant_type,
			code: params.get("code") || undefined,
			redirect_uri: params.get("redirect_uri") || undefined,
			client_id: params.get("client_id") || "",
			client_secret: params.get("client_secret") || undefined,
			code_verifier: params.get("code_verifier") || undefined,
			refresh_token: params.get("refresh_token") || undefined,
			scope: params.get("scope") || undefined,
		};
	}

	private async authenticateClient(
		req: Request,
		tokenReq: TokenRequest,
	): Promise<SMARTClient> {
		// Try client_secret_basic (Authorization header)
		const authHeader = req.headers.get("Authorization");
		if (authHeader?.startsWith("Basic ")) {
			return this.authenticateBasicAuth(authHeader);
		}

		// Try client_secret_post (request body)
		if (tokenReq.client_secret) {
			return this.authenticateClientSecret(
				tokenReq.client_id,
				tokenReq.client_secret,
			);
		}

		// Public client (no authentication required)
		const client = await this.getClient(tokenReq.client_id);
		if (client?.client_type === "public") {
			return client;
		}

		throw new OAuth2Error("invalid_client", "Client authentication failed");
	}

	private authenticateBasicAuth(authHeader: string): Promise<SMARTClient> {
		const credentials = atob(authHeader.slice(6)); // Remove "Basic "
		const [clientId, clientSecret] = credentials.split(":");
		return this.authenticateClientSecret(clientId, clientSecret);
	}

	private async authenticateClientSecret(
		clientId: string,
		clientSecret: string,
	): Promise<SMARTClient> {
		const client = await this.getClient(clientId);
		if (!client || client.client_secret !== clientSecret) {
			throw new OAuth2Error("invalid_client", "Invalid client credentials");
		}
		return client;
	}

	private async getClient(clientId: string): Promise<SMARTClient | null> {
		// This would integrate with client storage
		// For now, return mock client
		return {
			client_id: clientId,
			client_secret: "secret-for-confidential-client",
			client_name: "Example SMART App",
			client_type: "public",
			redirect_uris: ["http://localhost:3000/callback"],
			scopes: ["patient/Patient.read", "patient/Observation.read"],
			fhir_versions: ["4.0.1"],
			created_at: new Date(),
			status: "active",
		};
	}

	private async handleAuthorizationCodeGrant(
		tokenReq: TokenRequest,
		client: SMARTClient,
	): Promise<TokenResponse> {
		if (!tokenReq.code) {
			throw new OAuth2Error("invalid_request", "Missing authorization code");
		}

		// Validate authorization code (mock validation for design)
		const authCode = await this.validateAuthorizationCode(tokenReq.code);

		// Validate PKCE if present
		if (authCode.code_challenge && tokenReq.code_verifier) {
			this.validatePKCE(authCode.code_challenge, tokenReq.code_verifier);
		} else if (authCode.code_challenge && !tokenReq.code_verifier) {
			throw new OAuth2Error(
				"invalid_request",
				"Missing code_verifier for PKCE",
			);
		}

		// Generate tokens
		const accessToken = this.generateAccessToken(authCode, client);
		const refreshToken = this.generateRefreshToken(authCode, client);

		return {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: this.config.access_token_ttl,
			refresh_token: refreshToken,
			scope: authCode.scopes.join(" "),
			// SMART context
			patient: authCode.launch_context?.context?.patient,
			encounter: authCode.launch_context?.context?.encounter,
		};
	}

	private async handleRefreshTokenGrant(
		tokenReq: TokenRequest,
		client: SMARTClient,
	): Promise<TokenResponse> {
		if (!tokenReq.refresh_token) {
			throw new OAuth2Error("invalid_request", "Missing refresh_token");
		}

		// Validate refresh token (mock validation for design)
		const refreshTokenData = await this.validateRefreshToken(
			tokenReq.refresh_token,
		);

		// Generate new access token
		const accessToken = this.generateAccessTokenFromRefresh(
			refreshTokenData,
			client,
		);

		return {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: this.config.access_token_ttl,
			scope: refreshTokenData.scopes.join(" "),
			// Include SMART context if available
			patient: refreshTokenData.launch_context?.context?.patient,
			encounter: refreshTokenData.launch_context?.context?.encounter,
		};
	}

	private async validateAuthorizationCode(code: string) {
		// Mock authorization code validation
		return {
			code,
			client_id: "example-client",
			user_id: "user-123",
			scopes: ["patient/Patient.read", "patient/Observation.read"],
			redirect_uri: "http://localhost:3000/callback",
			code_challenge: "mock-challenge",
			code_challenge_method: "S256" as const,
			launch_context: {
				launch_id: "launch-123",
				client_id: "example-client",
				context: {
					patient: "patient-123",
					encounter: "encounter-456",
				},
				created_at: new Date(),
				expires_at: new Date(),
			},
			created_at: new Date(),
			expires_at: new Date(),
			used: false,
		};
	}

	private validatePKCE(codeChallenge: string, codeVerifier: string): void {
		// For S256 method - in production, validate the code challenge properly
		const encoder = new TextEncoder();
		const data = encoder.encode(codeVerifier);
		if (crypto.subtle) {
			// Use proper SHA-256 hashing in production
			console.log("PKCE validation would use SHA-256:", data.length, "bytes");
		}

		// In production, properly validate the challenge
		// For now, assume valid
		console.log("PKCE validation:", { codeChallenge, codeVerifier });
	}

	private generateAccessToken(authCode: any, client: SMARTClient): string {
		// In production, generate proper JWT with signing
		const payload = {
			iss: this.config.issuer,
			sub: authCode.user_id,
			aud: this.config.fhir_server_url,
			client_id: client.client_id,
			scope: authCode.scopes.join(" "),
			exp: Math.floor(Date.now() / 1000) + this.config.access_token_ttl,
			iat: Math.floor(Date.now() / 1000),
			// SMART context
			patient: authCode.launch_context?.context.patient,
			encounter: authCode.launch_context?.context.encounter,
			fhirUser: authCode.launch_context?.context.user,
		};

		// Mock JWT generation
		return btoa(JSON.stringify(payload));
	}

	private generateRefreshToken(_authCode: any, _client: SMARTClient): string {
		// Generate secure refresh token
		return `refresh_${Date.now()}_${Math.random().toString(36)}`;
	}

	private async validateRefreshToken(token: string) {
		// Mock refresh token validation
		return {
			token_hash: token,
			client_id: "example-client",
			user_id: "user-123",
			scopes: ["patient/Patient.read", "patient/Observation.read"],
			created_at: new Date(),
			expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
			launch_context: {
				launch_id: "launch-123",
				client_id: "example-client",
				context: {
					patient: "patient-123",
					encounter: "encounter-456",
				},
				created_at: new Date(),
				expires_at: new Date(),
			},
		};
	}

	private generateAccessTokenFromRefresh(
		refreshData: any,
		client: SMARTClient,
	): string {
		return this.generateAccessToken(refreshData, client);
	}

	private handleTokenError(error: unknown): Response {
		if (error instanceof OAuth2Error) {
			return new Response(
				JSON.stringify({
					error: error.error,
					error_description: error.description,
				}),
				{
					status: error.statusCode,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response(
			JSON.stringify({
				error: "server_error",
				error_description: "Internal server error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

/**
 * Discovery Endpoint Handler
 * Implements RFC 8414 - OAuth 2.0 Authorization Server Metadata
 */
class DiscoveryEndpoint {
	constructor(private config: AuthorizationServerConfig) {}

	async handle(_req: Request): Promise<Response> {
		const metadata: AuthorizationServerMetadata = {
			issuer: this.config.issuer,
			authorization_endpoint: this.config.authorization_endpoint,
			token_endpoint: this.config.token_endpoint,
			jwks_uri: this.config.jwks_uri,
			introspection_endpoint: this.config.introspection_endpoint,
			revocation_endpoint: this.config.revocation_endpoint,
			userinfo_endpoint: this.config.userinfo_endpoint,
			scopes_supported: this.config.scopes,
			response_types_supported: this.config.response_types,
			grant_types_supported: this.config.grant_types,
			token_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
				"none",
			],
			code_challenge_methods_supported: this.config.pkce_methods,
		};

		return new Response(JSON.stringify(metadata), {
			headers: { "Content-Type": "application/json" },
		});
	}
}

/**
 * SMART Configuration Endpoint Handler
 */
class SMARTDiscoveryEndpoint {
	constructor(private config: AuthorizationServerConfig) {}

	async handle(_req: Request): Promise<Response> {
		const smartConfig: SMARTConfiguration = {
			authorization_endpoint: this.config.authorization_endpoint,
			token_endpoint: this.config.token_endpoint,
			token_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
				"none",
			],
			scopes_supported: this.config.scopes,
			response_types_supported: this.config.response_types,
			capabilities: [
				"launch-ehr",
				"launch-standalone",
				"client-public",
				"client-confidential-symmetric",
				"sso-openid-connect",
				"context-passthrough-banner",
				"context-passthrough-style",
			],
			code_challenge_methods_supported: this.config.pkce_methods,
		};

		return new Response(JSON.stringify(smartConfig), {
			headers: { "Content-Type": "application/json" },
		});
	}
}

// ============================================================================
// OAuth2 Middleware Factory
// ============================================================================

/**
 * Create OAuth2 Authorization Server Middleware
 */
export function createOAuth2Middleware(
	config: AuthorizationServerConfig,
): MiddlewareDefinition {
	const authzEndpoint = new AuthorizationEndpoint(config);
	const tokenEndpoint = new TokenEndpoint(config);
	const discoveryEndpoint = new DiscoveryEndpoint(config);
	const smartDiscoveryEndpoint = new SMARTDiscoveryEndpoint(config);

	return {
		name: "oauth2-authorization-server",

		async before(req: Request, _context: HandlerContext) {
			const url = new URL(req.url);

			// Handle OAuth2 authorization endpoint
			if (url.pathname === "/oauth/authorize") {
				// Since middleware can't directly return Response, we'll log for now
				// In a real implementation, this would be handled by custom route handlers
				const response = await authzEndpoint.handle(req);
				console.log("OAuth2 authorization handled:", response.status);
				return undefined;
			}

			// Handle OAuth2 token endpoint
			if (url.pathname === "/oauth/token") {
				const response = await tokenEndpoint.handle(req);
				console.log("OAuth2 token handled:", response.status);
				return undefined;
			}

			// Handle discovery endpoints
			if (
				url.pathname === "/.well-known/oauth-authorization-server" ||
				url.pathname === "/.well-known/openid_configuration"
			) {
				const response = await discoveryEndpoint.handle(req);
				console.log("OAuth2 discovery handled:", response.status);
				return undefined;
			}

			if (url.pathname === "/.well-known/smart-configuration") {
				const response = await smartDiscoveryEndpoint.handle(req);
				console.log("SMART discovery handled:", response.status);
				return undefined;
			}

			// Continue with normal request processing
			return undefined;
		},
	};
}

/**
 * Create SMART Context Injection Middleware
 */
export function createSMARTContextMiddleware(): MiddlewareDefinition {
	return {
		name: "smart-context-injection",
		// priority: 15, // After authentication, before request processing

		async before(req: Request, context: HandlerContext) {
			const { user } = context as any;

			if (!user?.metadata?.smartContext) {
				return undefined;
			}

			const smartContext = user.metadata.smartContext as FHIRContext;
			const url = new URL(req.url);

			// Add patient context to search requests
			if (
				smartContext.patient &&
				req.method === "GET" &&
				!url.pathname.includes("metadata")
			) {
				// Extract resource type from path
				const pathParts = url.pathname.split("/").filter(Boolean);
				const resourceType = pathParts[0];

				// Add patient filter for patient-contextual resources
				const patientContextualResources = [
					"AllergyIntolerance",
					"CarePlan",
					"CareTeam",
					"Condition",
					"DiagnosticReport",
					"DocumentReference",
					"Encounter",
					"Goal",
					"Immunization",
					"MedicationRequest",
					"Observation",
					"Procedure",
					"Patient",
				];

				if (patientContextualResources.includes(resourceType)) {
					if (resourceType === "Patient") {
						// For Patient resource, filter to specific patient
						url.searchParams.set("_id", smartContext.patient);
					} else {
						// For other resources, filter by patient reference
						if (
							!url.searchParams.has("patient") &&
							!url.searchParams.has("subject")
						) {
							url.searchParams.set("patient", smartContext.patient);
						}
					}

					// Update request URL
					(req as any).url = url.toString();
				}
			}

			return undefined;
		},
	};
}

/**
 * Create SMART Scope Enforcement Middleware
 */
export function createSMARTScopeMiddleware(): MiddlewareDefinition {
	return {
		name: "smart-scope-enforcement",
		// priority: 20, // After context injection

		async before(req: Request, context: HandlerContext) {
			const { user } = context as any;

			if (!user?.metadata?.smartScopes) {
				return undefined;
			}

			const smartScopes = user.metadata.smartScopes;
			const url = new URL(req.url);
			const pathParts = url.pathname.split("/").filter(Boolean);

			// Skip metadata endpoints
			if (pathParts[0] === "metadata" || pathParts[0] === ".well-known") {
				return undefined;
			}

			const resourceType = pathParts[0];
			const method = req.method;

			// Check if user has required scope for this operation
			const hasScope = checkResourceAccess(smartScopes, resourceType, method);

			if (!hasScope) {
				// In a real implementation, this would throw an error or modify the request
				// For now, we'll just log the access denial
				console.warn(
					`Access denied: ${method} ${resourceType} - insufficient scope`,
				);
			}

			return undefined;
		},
	};
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if scopes allow access to a resource and operation
 */
function checkResourceAccess(
	scopes: any[],
	resourceType: string,
	method: string,
): boolean {
	for (const scope of scopes) {
		// Skip special scopes
		if (scope.special) continue;

		// Check if scope covers this resource
		if (scope.resourceType !== "*" && scope.resourceType !== resourceType) {
			continue;
		}

		// Check if scope covers this operation
		const isReadOperation = ["GET", "HEAD"].includes(method);
		const isWriteOperation = ["POST", "PUT", "PATCH", "DELETE"].includes(
			method,
		);

		if (isReadOperation && (scope.access === "read" || scope.access === "*")) {
			return true;
		}

		if (
			isWriteOperation &&
			(scope.access === "write" || scope.access === "*")
		) {
			return true;
		}
	}

	return false;
}

// Export all middleware factory functions
export default {
	createOAuth2Middleware,
	createSMARTContextMiddleware,
	createSMARTScopeMiddleware,
};
