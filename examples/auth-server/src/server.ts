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
 *
 * 📁 DIRECTORY STRUCTURE:
 * This example now uses the recommended directory structure with autoload:
 * • src/hooks/ - Permission enforcement hooks
 * • src/middleware/ - Authentication middleware
 * • All components are auto-discovered and loaded
 */

import { Atomic, type AtomicConfig } from "@atomic-fhir/core";
import { createComprehensiveAuditHook } from "@atomic-fhir/auth";

// Server configuration with authentication
const config: AtomicConfig = {
	server: {
		name: "Authenticated FHIR Server with Autoload",
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
	// Enable autoload to discover components from src/ directories
	autoload: {
		enabled: true,
	},
	// Additional hooks not in filesystem (optional)
	hooks: [
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

🏗️  AUTOLOAD STRUCTURE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
src/
├── hooks/                    # Auto-discovered permission hooks
│   ├── permission-enforcement.ts    # Create permission hook
│   ├── read-permission.ts           # Read permission hook
│   ├── update-permission.ts         # Update permission hook
│   └── delete-permission.ts         # Delete permission hook
└── middleware/               # Auto-discovered middleware
    └── auth.ts              # Authentication middleware

Authentication Examples:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Basic Auth:
curl -u admin:secret123 http://localhost:3008/Patient
curl -u doctor:doctor123 http://localhost:3008/Patient  
curl -u nurse:nurse123 http://localhost:3008/Patient

Bearer Token:
curl -H "Authorization: Bearer admin-token-123" http://localhost:3008/Patient
curl -H "Authorization: Bearer api-key-456" http://localhost:3008/Patient
curl -H "Authorization: Bearer research-token-789" http://localhost:3008/Patient

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

✅ AUTOLOAD BENEFITS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Cleaner server.ts configuration (${config.server?.name})
• Organized component structure in src/ directories
• Automatic discovery and loading of hooks and middleware
• Better maintainability and modularity
`);
