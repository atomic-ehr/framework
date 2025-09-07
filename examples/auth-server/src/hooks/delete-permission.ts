import { defineHook } from "@atomic-fhir/core";

// Create delete permission enforcement hook
export default defineHook({
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