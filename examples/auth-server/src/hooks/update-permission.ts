import { defineHook } from "@atomic-fhir/core";

// Create update permission enforcement hook
export default defineHook({
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