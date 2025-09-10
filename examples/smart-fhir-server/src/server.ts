/**
 * SMART on FHIR Server Example
 *
 * This example demonstrates a complete FHIR server with SMART on FHIR authentication,
 * OAuth2 authorization flows, and scope-based access control.
 *
 * Features:
 * - OAuth2 Authorization Code Flow with PKCE
 * - SMART on FHIR scope validation
 * - Automatic user and client seeding
 * - Responsive login UI
 * - Comprehensive access control
 *
 * Usage:
 *   bun run dev
 *
 * Default credentials:
 *   - admin / admin123 (full access)
 *   - doctor / doctor123 (limited access)
 *
 * Test clients:
 *   - demo-public-client (for web apps)
 *   - demo-confidential-client (for server apps)
 */

import { Atomic, type AtomicConfig } from "@atomic-fhir/core";
import { enableAuth } from "@atomic-fhir/auth";
import seedProvider from "./seed-provider.js";

// Server configuration
const config: AtomicConfig = {
	server: {
		name: "SMART on FHIR Server",
		version: "1.0.0",
		port: 3008,
		fhirVersion: "4.0.1",
		url: "http://localhost:3008",
	},

	// Load R4 Core package for FHIR resources
	packages: {
		path: ".packages",
		list: [
			{
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				npmRegistry: "https://get-ig.org",
			},
		],
	},

	// Enable autoload for custom components
	autoload: {
		enabled: true,
		paths: {
			resources: "src/resources",
			operations: "src/operations",
			hooks: "src/hooks",
			middleware: "src/middleware",
		},
	},

	// Middleware will be auto-loaded from the auth package

	// Storage configuration (SQLite for demo)
	storage: {
		adapter: "sqlite",
		config: {
			database: "./fhir-smart-server.db",
		},
	},
};

// Initialize Atomic server
const app = new Atomic(config);

// Register authentication with autoload system
// This automatically:
// - Registers the embedded auth FHIR package with StructureDefinitions
// - Loads middleware from auth package (security context middleware)
// - Loads hooks from auth package (audit hooks)
// - Registers HTTP routes (/auth/authorize, /auth/token, etc.)
// - Sets up seeding with default users and clients
// - Serves static login UI assets
await enableAuth(app);

// Register seed provider for demo users and clients
app.seedingManager?.registerProvider(seedProvider);

// Start the server
app.start().then(() => {
	console.log(`
🚀 SMART on FHIR Server is running!

📍 Server URL: ${config.server?.url}
🔒 Authentication: OAuth2 + SMART on FHIR

🎯 ENDPOINTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 FHIR Base:     ${config.server?.url}/
🔐 Authorization: ${config.server?.url}/auth/authorize
🔑 Token:         ${config.server?.url}/auth/token
📋 Login UI:      ${config.server?.url}/auth/static/login.html
⚙️  Config:        ${config.server?.url}/.well-known/smart-configuration

📚 EXAMPLE REQUESTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔓 Public (no auth required):
curl ${config.server?.url}/metadata

🔒 Protected (requires authentication):
# 1. Get authorization code
curl "${config.server?.url}/auth/authorize?response_type=code&client_id=demo-public-client&redirect_uri=http://localhost:3000/callback&scope=patient/*.read&state=abc123"

# 2. Login with: admin / admin123 or doctor / doctor123

# 3. Exchange code for token
curl -X POST ${config.server?.url}/auth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code&code=YOUR_CODE&redirect_uri=http://localhost:3000/callback&client_id=demo-public-client"

# 4. Use token to access FHIR data
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ${config.server?.url}/Patient

👥 DEFAULT USERS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 admin / admin123      → Full system access
👨‍⚕️ doctor / doctor123    → Limited patient/observation access

🔧 TEST CLIENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 demo-public-client         → Public client for web apps
🖥️  demo-confidential-client  → Confidential client (secret: demo-secret-123)

🎯 SMART SCOPES EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
patient/*.read         → Read all patient data
user/Patient.read      → Read patients user can access
system/Patient.*       → Full patient access (system context)
launch/patient         → Request patient context at launch
offline_access         → Request refresh token
  `);
});
