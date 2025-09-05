// Main exports for @atomic-fhir/auth package

// Export audit logging system
export {
	type AuditBackend,
	type AuditBackendConfig,
	type AuditConfig,
	AuditManager,
	type AuditQueryFilters,
	type AuditSeverity,
	type AuditStats,
	type AuthAuditEvent,
	type AuthAuditEventType,
	ConsoleAuditBackend,
	createAuditEvent,
	createAuthAttemptEvent,
	createAuthFailureEvent,
	createAuthSuccessEvent,
	createPermissionCheckEvent,
	createSessionEvent,
	createTokenEvent,
	DatabaseAuditBackend,
	determineSeverity,
	extractSecurityContext,
	FileAuditBackend,
	generateEventId,
	WebhookAuditBackend,
} from "./core/audit-logging.ts";

// Export authentication context functionality
export * from "./core/auth-context.ts";

// Export core authentication manager
export * from "./core/auth-manager.ts";
// Export permissions system
export {
	type ConditionalRule,
	DEFAULT_ROLE_TEMPLATES,
	type EffectiveFHIRPermissions,
	expandPermissionShorthand,
	extractFieldValue,
	FHIR_OPERATIONS,
	FHIRPermissionManager,
	OWNERSHIP_PATTERNS,
	type PermissionContext,
	type PermissionOperator,
	type PermissionPerformanceMetrics,
	type PermissionRequest,
	type PermissionResult,
	type PermissionShorthand,
	permissionCache,
	type RolePermissionTemplate,
	substituteTemplateVariables,
} from "./core/permissions.ts";
// Export audit hooks
export {
	createAuthenticationAuditHook,
	createComprehensiveAuditHook,
	createCreateAuditHook,
	createDeleteAuditHook,
	createReadAuditHook,
	createResourceAuditHook,
	createSearchAuditHook,
	createUpdateAuditHook,
	getAuditManager,
	registerAllAuditHooks,
	setAuditManager,
} from "./hooks/audit-auth.ts";
// Export middleware
export { createAuthMiddleware } from "./middleware/auth-middleware.ts";
// OAuth2/SMART Middleware
export {
	createOAuth2Middleware,
	createSMARTContextMiddleware,
	createSMARTScopeMiddleware,
} from "./middleware/oauth2-middleware.ts";
// Export base strategy
export * from "./strategies/base-strategy.ts";
// Export authentication strategies
export { BasicAuthStrategy } from "./strategies/basic-auth.ts";
export { BearerTokenStrategy } from "./strategies/bearer-token.ts";
export { JWTStrategy } from "./strategies/jwt-strategy.ts";
// Export all types first
export * from "./types/index.ts";

// Version info
export const version = "0.1.0";
