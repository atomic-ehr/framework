import { defineHook } from "@atomic-fhir/core";
import { AuthorizationError } from "@atomic-fhir/auth";

// Create permission enforcement hook that works correctly in request scope
export default defineHook({
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