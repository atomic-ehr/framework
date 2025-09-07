import { defineHook } from "@atomic-fhir/core";

// Create read permission enforcement hook
export default defineHook({
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