import type { HandlerContext, MiddlewareDefinition } from "@atomic-fhir/core";
import { SMARTScopes, type SecurityContext } from "@atomic-fhir/core";

/**
 * OAuth2 Token Validation Middleware
 * Extracts and validates Bearer tokens, setting security context on request
 */
export function createOAuth2Middleware(): MiddlewareDefinition {
	return {
		name: "oauth2-token-validation",

		async before(req: Request, context: HandlerContext) {
			const authHeader = req.headers.get('authorization');
			
			// Skip if no authorization header or not Bearer token
			if (!authHeader?.startsWith('Bearer ')) {
				return undefined;
			}

			const accessToken = authHeader.substring(7);
			
			try {
				// Look up token in storage using the auth package search pattern
				const tokenBundle = await context.storage.search('Basic', {
					code: 'token',
					'access-token': accessToken
				});

				if (!tokenBundle?.entry?.length) {
					return undefined; // Token not found, continue without context
				}

				const tokenResource = tokenBundle.entry[0].resource;
				
				// Check token expiration
				const expiresAt = getExtensionValue(tokenResource, 'expires-at');
				if (expiresAt && new Date(expiresAt) < new Date()) {
					return undefined; // Token expired
				}

				// Check if token is active
				const active = getExtensionValue(tokenResource, 'active-status');
				if (active === false) {
					return undefined; // Token inactive
				}

				// Extract scopes
				const scopes = tokenResource.extension
					?.filter((ext: any) => ext.url.endsWith('token-scope'))
					?.map((ext: any) => ext.valueString)
					?.filter(Boolean) || [];

				// Get associated client and user info
				const clientId = getExtensionValue(tokenResource, 'associated-client-id');
				const userId = getExtensionValue(tokenResource, 'associated-user-id');

				// Build security context using core types
				const securityContext: SecurityContext = {
					scopes,
					client: clientId ? {
						id: clientId,
						type: 'public' // TODO: get from client resource
					} : undefined,
					user: userId ? {
						id: userId,
						roles: [], // TODO: get from user resource
						metadata: {
							tokenExpiresAt: expiresAt,
							tokenIssuedAt: getExtensionValue(tokenResource, 'issued-at')
						}
					} : undefined
				};

				// Use core library's security context setter
				SMARTScopes.setSecurityContext(req, securityContext);
				
				return undefined;
			} catch (error) {
				console.error('[OAuth2 Middleware] Token validation error:', error);
				return undefined;
			}
		}
	};
}

/**
 * SMART Context Injection Middleware
 * Adds SMART launch context to requests based on token context
 */
export function createSMARTContextMiddleware(): MiddlewareDefinition {
	return {
		name: "smart-context-injection",

		async before(req: Request, _context: HandlerContext) {
			const securityContext = SMARTScopes.getSecurityContext(req);
			
			if (!securityContext?.user?.metadata) {
				return undefined;
			}

			// Check for patient launch context in scopes
			const parsedScopes = SMARTScopes.parseSMARTScopes(securityContext.scopes);
			const launchPatientScope = parsedScopes.find(s => s.raw === 'launch/patient');
			
			if (!launchPatientScope) {
				return undefined;
			}

			// Get patient context from token metadata (would be stored during token issuance)
			const patientId = securityContext.user.metadata.smartContext?.patient;
			
			if (!patientId) {
				return undefined;
			}

			const url = new URL(req.url);

			// Skip metadata endpoints
			if (url.pathname.includes('metadata') || url.pathname.includes('.well-known')) {
				return undefined;
			}

			// Add patient context to search requests
			if (req.method === "GET") {
				// Extract resource type from path
				const pathParts = url.pathname.split("/").filter(Boolean);
				const resourceType = pathParts[0];

				// Add patient filter for patient-contextual resources
				const patientContextualResources = [
					"AllergyIntolerance", "CarePlan", "CareTeam", "Condition",
					"DiagnosticReport", "DocumentReference", "Encounter", "Goal",
					"Immunization", "MedicationRequest", "Observation", "Procedure", "Patient"
				];

				if (patientContextualResources.includes(resourceType)) {
					if (resourceType === "Patient") {
						// For Patient resource, filter to specific patient
						if (!url.searchParams.has('_id')) {
							url.searchParams.set("_id", patientId);
						}
					} else {
						// For other resources, filter by patient reference
						if (!url.searchParams.has("patient") && !url.searchParams.has("subject")) {
							url.searchParams.set("patient", `Patient/${patientId}`);
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
 * SMART Scope Enforcement Middleware
 * Enforces SMART scope permissions for FHIR resource access
 */
export function createSMARTScopeMiddleware(): MiddlewareDefinition {
	return {
		name: "smart-scope-enforcement",

		async before(req: Request, _context: HandlerContext) {
			const securityContext = SMARTScopes.getSecurityContext(req);
			
			if (!securityContext?.scopes?.length) {
				return undefined; // No scopes to enforce
			}

			const url = new URL(req.url);
			const pathParts = url.pathname.split("/").filter(Boolean);

			// Skip metadata endpoints
			if (pathParts[0] === "metadata" || pathParts[0] === ".well-known" || pathParts[0] === "auth") {
				return undefined;
			}

			if (pathParts.length === 0) {
				return undefined; // Root endpoint
			}

			const resourceType = pathParts[0];
			const operation = mapHttpMethodToFHIROperation(req.method, pathParts);

			// Use core library's scope validation
			const hasPermission = SMARTScopes.scopesToPermissions(
				securityContext.scopes,
				resourceType,
				operation
			);

			if (!hasPermission) {
				// Throw proper FHIR OperationOutcome error
				const error = new Error(`Insufficient scope for ${req.method} ${resourceType}`);
				error.name = 'ForbiddenError';
				(error as any).statusCode = 403;
				(error as any).operationOutcome = {
					resourceType: 'OperationOutcome',
					issue: [{
						severity: 'error',
						code: 'forbidden',
						diagnostics: `Insufficient scope. Required: ${operation} permission for ${resourceType}`,
						details: {
							text: `Available scopes: ${securityContext.scopes.join(', ')}`
						}
					}]
				};
				throw error;
			}

			return undefined;
		},
	};
}

// Helper function for extension values
function getExtensionValue(resource: any, urlSuffix: string): any {
	const fullUrl = `http://atomic-fhir.org/ig/auth/StructureDefinition/${urlSuffix}`;
	const extension = resource.extension?.find((ext: any) => ext.url === fullUrl);
	return extension?.valueString || extension?.valueBoolean || extension?.valueDateTime || null;
}

// Helper function to map HTTP methods to FHIR operations
function mapHttpMethodToFHIROperation(method: string, pathParts: string[]): string {
	switch (method) {
		case 'GET':
			return pathParts.length === 1 ? 'search-type' : 'read';
		case 'POST':
			return 'create';
		case 'PUT':
			return 'update';
		case 'PATCH':
			return 'patch';
		case 'DELETE':
			return 'delete';
		default:
			return 'read';
	}
}

// Export all middleware factory functions
export default {
	createOAuth2Middleware,
	createSMARTContextMiddleware,
	createSMARTScopeMiddleware,
};