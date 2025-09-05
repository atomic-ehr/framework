/**
 * FHIR Authentication Server with Dynamic Permission Conditions
 *
 * This example demonstrates advanced authentication and authorization patterns including:
 *
 * 🔒 DYNAMIC PERMISSION CONDITIONS:
 * • Field-based conditions (user.practitionerId matching resource.performer)
 * • Time-based access control (work hours restrictions)
 * • Custom validators for complex business rules
 * • Rate limiting for API users
 * • Content filtering (sensitive data exclusions)
 * • Research data access controls with consent validation
 *
 * 📊 CONDITION TYPES:
 * • 'eq'/'ne': Equality/inequality checks
 * • 'in'/'not-in': Array membership checks
 * • 'contains': String/array containment
 * • 'custom': Custom validation functions
 *
 * 🎭 USER ROLES & CONDITIONS:
 * • admin: Full access (no conditions)
 * • doctor: Patient relationship + organization boundaries
 * • nurse: Time-based + location-based restrictions
 * • api-user: Rate limiting + temporal data filtering
 * • researcher: Consent-based + age restrictions + study-specific data
 *
 * 🚀 USAGE:
 * Each user demonstrates different permission condition patterns that can be
 * combined and customized for real-world healthcare scenarios.
 */

import { Atomic, type AtomicConfig } from "@atomic-fhir/core";
import {
	AuthManager,
	BasicAuthStrategy,
	BearerTokenStrategy,
	createAuthMiddleware,
	createComprehensiveAuditHook,
	AuditManager,
	ConsoleAuditBackend,
	AuthorizationError,
} from "@atomic-fhir/auth";
import { defineHook } from "@atomic-fhir/core";

// Configure authentication strategies
const authManager = new AuthManager({
	strategies: [
		// Basic Auth Strategy
		new BasicAuthStrategy({
			name: "basic-auth",
			users: {
				admin: {
					password: "secret123",
					user: {
						id: "admin-001",
						username: "admin",
						email: "admin@example.com",
						roles: ["admin", "practitioner"],
						permissions: {
							canRead: true,
							canWrite: true,
							canDelete: true,
							resources: {
								"*": {
									read: true,
									create: true,
									update: true,
									delete: true,
									search: true,
								},
							},
						},
					},
				},
				doctor: {
					password: "doctor123",
					user: {
						id: "doctor-001",
						username: "doctor",
						email: "doctor@example.com",
						roles: ["practitioner"],
						// Add practitioner reference for condition matching
						metadata: {
							practitionerId: "Practitioner/practitioner-001",
							organizationId: "Organization/hospital-001",
						},
						permissions: {
							canRead: true,
							canWrite: true,
							resources: {
								Patient: {
									create: true,
									read: true,
									update: true,
									search: true,
									// Dynamic condition: only patients assigned to this practitioner
									conditions: [
										{
											field: "generalPractitioner.reference",
											operator: "eq",
											value: "{{user.metadata.practitionerId}}",
											context: {
												description:
													"Doctor can only access patients where they are the general practitioner",
											},
										},
									],
								},
								Observation: {
									create: true,
									read: true,
									search: true,
									// Dynamic condition: only observations they performed or for their patients
									conditions: [
										{
											field: "performer[*].reference",
											operator: "in",
											value: ["{{user.metadata.practitionerId}}"],
											context: {
												description:
													"Doctor can access observations they performed",
											},
										},
										{
											field: "subject.reference",
											operator: "custom",
											value: null, // Not used for custom validator
											customValidator: (resource, user) => {
												// Check if the observation's subject is one of the doctor's patients
												// This would typically involve a database lookup
												console.log(
													`Checking if ${user.username} can access observation for patient ${resource.subject?.reference}`,
												);
												return true; // Simplified for demo
											},
											context: {
												description:
													"Doctor can access observations for their patients",
											},
										},
									],
								},
								Practitioner: {
									read: true,
									// Can only read practitioners in the same organization
									conditions: [
										{
											field: "managingOrganization.reference",
											operator: "eq",
											value: "{{user.metadata.organizationId}}",
											context: {
												description:
													"Doctor can only view practitioners in same organization",
											},
										},
									],
								},
							},
						},
					},
				},
				nurse: {
					password: "nurse123",
					user: {
						id: "nurse-001",
						username: "nurse",
						email: "nurse@example.com",
						roles: ["nurse"],
						metadata: {
							practitionerId: "Practitioner/nurse-001",
							unitId: "Location/icu-unit",
						},
						permissions: {
							canRead: true,
							resources: {
								Patient: {
									read: true,
									search: true,
									// Time-based condition: only during work hours
									conditions: [
										{
											field: "managingOrganization",
											operator: "custom",
											value: null, // Not used for custom validator
											customValidator: (_resource, user, _context) => {
												const now = new Date();
												const hour = now.getHours();
												const isWorkHours = hour >= 7 && hour <= 19; // 7 AM to 7 PM

												if (!isWorkHours) {
													console.log(
														`Access denied for ${user.username}: outside work hours (${hour}:00)`,
													);
													return false;
												}

												return true;
											},
											context: {
												description:
													"Nurse can only access patients during work hours (7 AM - 7 PM)",
											},
										},
										{
											field: "location[*].location.reference",
											operator: "contains",
											value: "{{user.metadata.unitId}}",
											context: {
												description:
													"Nurse can only access patients in their assigned unit",
											},
										},
									],
								},
								Observation: {
									create: true,
									read: true,
									search: true,
									// Complex condition: observations they created OR for patients in their unit
									conditions: [
										{
											field: "performer[*].reference",
											operator: "eq",
											value: "{{user.metadata.practitionerId}}",
											context: {
												description:
													"Nurse can access observations they performed",
											},
										},
										{
											field: "category[*].coding[*].code",
											operator: "in",
											value: ["vital-signs", "nursing-assessment"],
											context: {
												description:
													"Nurse can access vital signs and nursing assessments",
											},
										},
									],
								},
							},
						},
					},
				},
			},
		}),

		// Bearer Token Strategy
		new BearerTokenStrategy({
			name: "bearer-token",
			tokens: {
				"admin-token-123": {
					id: "admin-001",
					username: "admin",
					email: "admin@example.com",
					roles: ["admin", "practitioner"],
					permissions: {
						canRead: true,
						canWrite: true,
						canDelete: true,
						resources: {
							"*": {
								read: true,
								create: true,
								update: true,
								delete: true,
								search: true,
							},
						},
					},
				},
				"api-key-456": {
					id: "api-user-001",
					username: "api-user",
					email: "api@example.com",
					roles: ["api"],
					// API metadata for conditions
					metadata: {
						clientType: "mobile-app",
						rateLimit: 1000, // requests per hour
					},
					permissions: {
						canRead: true,
						canWrite: false, // Explicitly deny write access
						canDelete: false, // Explicitly deny delete access
						resources: {
							Patient: {
								read: true,
								search: true,
								// Rate limiting condition for API users
								conditions: [
									{
										field: "meta.lastUpdated",
										operator: "custom",
										value: null,
										customValidator: (_resource, user, context) => {
											// Simple rate limiting example
											const userRequests = context?.requestCount || 0;
											const maxRequests = user.metadata?.rateLimit || 100;

											if (userRequests >= maxRequests) {
												console.log(
													`Rate limit exceeded for API user ${user.username}: ${userRequests}/${maxRequests}`,
												);
												return false;
											}

											return true;
										},
										context: {
											description:
												"API rate limiting - max 1000 requests per hour",
											metadata: {
												rateLimitType: "hourly",
												maxRequests: 1000,
											},
										},
									},
								],
							},
							Observation: {
								read: true,
								search: true,
								// Content filtering for API users
								conditions: [
									{
										field: "category[*].coding[*].code",
										operator: "not-in",
										value: ["sensitive-data", "restricted"],
										context: {
											description:
												"API users cannot access sensitive or restricted observations",
										},
									},
									{
										field: "effectiveDateTime",
										operator: "custom",
										value: null,
										customValidator: (resource, _user, _context) => {
											// Only allow access to observations from last 30 days for API users
											if (resource.effectiveDateTime) {
												const observationDate = new Date(
													resource.effectiveDateTime,
												);
												const thirtyDaysAgo = new Date();
												thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

												return observationDate >= thirtyDaysAgo;
											}
											return true; // Allow if no date specified
										},
										context: {
											description:
												"API users can only access observations from the last 30 days",
										},
									},
								],
							},
						},
					},
				},
				// Research API token with specific dataset access
				"research-token-789": {
					id: "research-001",
					username: "research-api",
					email: "research@hospital.org",
					roles: ["researcher"],
					metadata: {
						datasetId: "covid-study-2024",
						institutionId: "IRB-2024-001",
					},
					permissions: {
						canRead: true,
						resources: {
							Patient: {
								read: true,
								search: true,
								conditions: [
									{
										field: "extension[*].url",
										operator: "contains",
										value: "research-consent",
										context: {
											description:
												"Researcher can only access patients who have consented to research",
										},
									},
									{
										field: "birthDate",
										operator: "custom",
										value: null,
										customValidator: (resource, _user, _context) => {
											// De-identification: remove specific birth dates, only allow age ranges
											if (resource.birthDate) {
												const birthYear = new Date(
													resource.birthDate,
												).getFullYear();
												const currentYear = new Date().getFullYear();
												const age = currentYear - birthYear;

												// Only allow access if patient is adult (for this research study)
												return age >= 18;
											}
											return false;
										},
										context: {
											description:
												"Research API only accesses adult patients (18+) for current study",
										},
									},
								],
							},
							Observation: {
								read: true,
								search: true,
								conditions: [
									{
										field: "code.coding[*].code",
										operator: "in",
										value: ["33747-0", "94500-6", "94558-4"], // COVID-related LOINC codes
										context: {
											description:
												"Research API limited to COVID-related observations",
											metadata: {
												study: "COVID-19 Longitudinal Study 2024",
												loincCodes: ["33747-0", "94500-6", "94558-4"],
											},
										},
									},
								],
							},
						},
					},
				},
			},
		}),
	],
});

// Configure permissions (for future use)
// const permissionManager = new FHIRPermissionManager({
//   roleTemplates: {
//     admin: {
//       '*': {
//         create: true,
//         read: true,
//         update: true,
//         delete: true,
//         search: true
//       }
//     },
//     practitioner: {
//       'Patient': {
//         create: true,
//         read: true,
//         update: true,
//         search: true
//       },
//       'Observation': {
//         create: true,
//         read: true,
//         update: true,
//         search: true
//       },
//       'Practitioner': {
//         read: true
//       },
//       'Organization': {
//         read: true
//       }
//     },
//     nurse: {
//       'Patient': {
//         read: true,
//         search: true
//       },
//       'Observation': {
//         create: true,
//         read: true,
//         search: true
//       }
//     },
//     api: {
//       'Patient': {
//         read: true,
//         search: true
//       },
//       'Observation': {
//         read: true,
//         search: true
//       }
//     }
//   }
// });

// Configure audit logging
const auditManager = new AuditManager({
	enabled: true,
	backends: [
		{
			name: "console",
			type: "console",
			enabled: true,
			config: {},
		},
	],
	logLevel: "info",
});

// Add the console backend manually
auditManager.addBackend(new ConsoleAuditBackend());

// Create permission enforcement hook that works correctly in request scope
const permissionEnforcementHook = defineHook({
	name: "permission-enforcement",
	type: "beforeCreate",
	resources: "*",
	priority: 2000, // Higher priority than audit hooks
	
	async handler(resource: any, context: any) {
		const resourceType = resource.resourceType;
		const user = context.user;
		
		if (!user || !context.isAuthenticated) {
			throw new AuthorizationError(`Access denied: Authentication required`);
		}
		
		console.log(`[PERMISSION] Checking ${user.username} access to CREATE ${resourceType}`);
		
		// Check global permissions first
		if (!user.permissions?.canWrite) {
			throw new AuthorizationError(`Access denied: User ${user.username} is not allowed to create resources`);
		}
		
		// Check resource-specific permissions
		const resourcePerms = user.permissions?.resources?.[resourceType];
		if (!resourcePerms) {
			// Check if user has wildcard permissions
			const wildcardPerms = user.permissions?.resources?.["*"];
			if (!wildcardPerms?.create) {
				throw new AuthorizationError(`Access denied: User ${user.username} is not allowed to create ${resourceType} resources`);
			}
		} else if (!resourcePerms.create) {
			throw new AuthorizationError(`Access denied: User ${user.username} is not allowed to create ${resourceType} resources`);
		}
		
		console.log(`[PERMISSION] ✓ User ${user.username} allowed to CREATE ${resourceType}`);
		return resource;
	},
});

// Create read permission enforcement hook
const readPermissionHook = defineHook({
	name: "read-permission-enforcement", 
	type: "beforeRead",
	resources: "*",
	priority: 2000,
	
	async handler(resource: any, context: any) {
		const user = context.user;
		const resourceType = resource?.resourceType;
		
		if (!user) {
			throw new Error("Authentication required");
		}
		
		console.log(`[PERMISSION] Checking ${user.username} access to READ ${resourceType}`);
		
		// Check global permissions
		if (!user.permissions?.canRead) {
			console.log(`[PERMISSION] DENIED: ${user.username} lacks canRead permission`);
			throw new Error(`Access denied: User ${user.username} is not allowed to read resources`);
		}
		
		// Check resource-specific permissions
		const resourcePerms = user.permissions?.resources?.[resourceType];
		if (!resourcePerms) {
			// Check wildcard permissions
			const wildcardPerms = user.permissions?.resources?.["*"];
			if (!wildcardPerms?.read) {
				console.log(`[PERMISSION] DENIED: ${user.username} has no READ permission for ${resourceType}`);
				throw new Error(`Access denied: User ${user.username} is not allowed to read ${resourceType} resources`);
			}
		} else if (!resourcePerms.read) {
			console.log(`[PERMISSION] DENIED: ${user.username} has no READ permission for ${resourceType}`);
			throw new Error(`Access denied: User ${user.username} is not allowed to read ${resourceType} resources`);
		}
		
		console.log(`[PERMISSION] GRANTED: ${user.username} can READ ${resourceType}`);
		return resource;
	},
});

// Create update permission enforcement hook
const updatePermissionHook = defineHook({
	name: "update-permission-enforcement",
	type: "beforeUpdate", 
	resources: "*",
	priority: 2000,
	
	async handler(resource: any, context: any) {
		const user = context.user;
		const resourceType = resource.resourceType;
		
		if (!user) {
			throw new Error("Authentication required");
		}
		
		console.log(`[PERMISSION] Checking ${user.username} access to UPDATE ${resourceType}`);
		
		// Check global permissions
		if (!user.permissions?.canWrite) {
			console.log(`[PERMISSION] DENIED: ${user.username} lacks canWrite permission`);
			throw new Error(`Access denied: User ${user.username} is not allowed to update resources`);
		}
		
		// Check resource-specific permissions
		const resourcePerms = user.permissions?.resources?.[resourceType];
		if (!resourcePerms) {
			// Check wildcard permissions
			const wildcardPerms = user.permissions?.resources?.["*"];
			if (!wildcardPerms?.update) {
				console.log(`[PERMISSION] DENIED: ${user.username} has no UPDATE permission for ${resourceType}`);
				throw new Error(`Access denied: User ${user.username} is not allowed to update ${resourceType} resources`);
			}
		} else if (!resourcePerms.update) {
			console.log(`[PERMISSION] DENIED: ${user.username} has no UPDATE permission for ${resourceType}`);
			throw new Error(`Access denied: User ${user.username} is not allowed to update ${resourceType} resources`);
		}
		
		console.log(`[PERMISSION] GRANTED: ${user.username} can UPDATE ${resourceType}`);
		return resource;
	},
});

// Create delete permission enforcement hook
const deletePermissionHook = defineHook({
	name: "delete-permission-enforcement",
	type: "beforeDelete",
	resources: "*", 
	priority: 2000,
	
	async handler(resource: any, context: any) {
		const user = context.user;
		const resourceType = resource?.resourceType;
		
		if (!user) {
			throw new Error("Authentication required");
		}
		
		console.log(`[PERMISSION] Checking ${user.username} access to DELETE ${resourceType}`);
		
		// Check global permissions
		if (!user.permissions?.canDelete) {
			console.log(`[PERMISSION] DENIED: ${user.username} lacks canDelete permission`);
			throw new Error(`Access denied: User ${user.username} is not allowed to delete resources`);
		}
		
		// Check resource-specific permissions
		const resourcePerms = user.permissions?.resources?.[resourceType];
		if (!resourcePerms) {
			// Check wildcard permissions
			const wildcardPerms = user.permissions?.resources?.["*"];
			if (!wildcardPerms?.delete) {
				console.log(`[PERMISSION] DENIED: ${user.username} has no DELETE permission for ${resourceType}`);
				throw new Error(`Access denied: User ${user.username} is not allowed to delete ${resourceType} resources`);
			}
		} else if (!resourcePerms.delete) {
			console.log(`[PERMISSION] DENIED: ${user.username} has no DELETE permission for ${resourceType}`);
			throw new Error(`Access denied: User ${user.username} is not allowed to delete ${resourceType} resources`);
		}
		
		console.log(`[PERMISSION] GRANTED: ${user.username} can DELETE ${resourceType}`);
		return resource;
	},
});

// Server configuration with authentication
const config: AtomicConfig = {
	server: {
		name: "Authenticated FHIR Server",
		port: 3008,
		// CORS configuration would be handled at the server level
		// cors: {
		//   origin: true,
		//   credentials: true
		// }
	},
	// Load R4 Core package for full FHIR resource support
	packages: [
		{
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			npmRegistry: "https://get-ig.org",
		},
	],
	// Authentication middleware
	middleware: [
		createAuthMiddleware(authManager, {
			requireAuth: true, // Require authentication for all endpoints
			skipPaths: ["/metadata", "/health"], // Public endpoints
			auditEnabled: true,
			auditManager,
		}),
	],
	// Enable hooks for permission enforcement and audit logging
	hooks: [
		permissionEnforcementHook,
		readPermissionHook,
		updatePermissionHook,
		deletePermissionHook,
		createComprehensiveAuditHook({
			resources: "*",
			priority: 1000,
			logLevel: "minimal",
		}),
	],
};

const app = new Atomic(config);

// Start the server
app.start();

console.log(`
🔐 FHIR Server with Dynamic Permission Conditions is running!

🚀 DYNAMIC CONDITIONS DEMO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This example demonstrates advanced permission conditions including:
• Field-based filtering (user.practitionerId matching resources)  
• Time-based access control (work hours for nurses)
• Custom validation logic (age restrictions, consent checks)
• Rate limiting for API users
• Content filtering (sensitive data exclusions)
• Research data access controls

Authentication Examples:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Basic Auth:
curl -u admin:secret123 http://localhost:3004/Patient
curl -u doctor:doctor123 http://localhost:3004/Patient  
curl -u nurse:nurse123 http://localhost:3004/Patient

Bearer Token:
curl -H "Authorization: Bearer admin-token-123" http://localhost:3004/Patient
curl -H "Authorization: Bearer api-key-456" http://localhost:3004/Patient
curl -H "Authorization: Bearer research-token-789" http://localhost:3004/Patient

User Roles & Dynamic Conditions:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 admin (admin:secret123)
   → Full access to all resources (no conditions)
   
👨‍⚕️ doctor (doctor:doctor123)  
   → Patients: Only where doctor is generalPractitioner
   → Observations: Only performed by doctor OR for doctor's patients
   → Practitioners: Only in same organization
   
👩‍⚕️ nurse (nurse:nurse123)
   → Patients: Only during work hours (7 AM - 7 PM) + in assigned unit
   → Observations: Only performed by nurse + vital signs/assessments
   
🤖 api-user (Bearer api-key-456)
   → Rate limited: max 1000 requests/hour
   → Observations: No sensitive data + last 30 days only
   
🔬 researcher (Bearer research-token-789)
   → Patients: Only with research consent + adults only (18+)
   → Observations: COVID study data only (specific LOINC codes)

🧪 TEST CONDITIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Try accessing resources at different times or with different users!
Conditions are evaluated in real-time and logged to console.
`);
