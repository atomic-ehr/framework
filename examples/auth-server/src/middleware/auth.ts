import { 
	AuthManager,
	BasicAuthStrategy,
	BearerTokenStrategy,
	createAuthMiddleware,
	AuditManager,
	ConsoleAuditBackend,
} from "@atomic-fhir/auth";

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

// Export the middleware for autoload
export default createAuthMiddleware(authManager, {
	requireAuth: true, // Require authentication for all endpoints
	skipPaths: ["/metadata", "/health"], // Public endpoints
	auditEnabled: true,
	auditManager,
});