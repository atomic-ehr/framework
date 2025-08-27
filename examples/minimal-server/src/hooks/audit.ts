import { defineHook, type HookDefinition, type HandlerContext } from '@atomic-fhir/core';

// Audit logging hook
export default defineHook({
  name: 'audit-log',
  type: 'afterCreate', // You can create separate hooks for afterUpdate, afterDelete
  resources: '*', // Apply to all resources
  async handler(resource: any, context: HandlerContext): Promise<void> {
    const auditEntry = {
      action: 'CREATE',
      resourceType: resource.resourceType,
      resourceId: resource.id,
      timestamp: new Date().toISOString(),
      user: (context as any).req?.headers?.['x-user-id'] || 'anonymous'
    };
    
    console.log(`🔍 AUDIT: CREATE ${resource.resourceType}/${resource.id} by ${auditEntry.user}`);
    
    // In production, you would save this to an AuditEvent resource
    // await context.storage.create('AuditEvent', auditEvent);
  }
});