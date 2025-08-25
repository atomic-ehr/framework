import { afterCreate, afterUpdate, afterDelete } from '@atomic/framework';

// Audit logging hooks
const auditLog = (action) => async (resource, context) => {
  const auditEntry = {
    action,
    resourceType: resource.resourceType,
    resourceId: resource.id,
    timestamp: new Date().toISOString(),
    user: context.req?.headers?.['x-user-id'] || 'anonymous'
  };
  
  console.log(`🔍 AUDIT: ${action} ${resource.resourceType}/${resource.id} by ${auditEntry.user}`);
  
  // In production, you would save this to an AuditEvent resource
  // await context.storage.create('AuditEvent', auditEvent);
};

// Export multiple hooks as an array
export default [
  afterCreate('audit-create', auditLog('CREATE')),
  afterUpdate('audit-update', auditLog('UPDATE')),
  afterDelete('audit-delete', auditLog('DELETE'))
];