import { defineMiddleware } from '@atomic/framework';

const auditLog = [];

export default defineMiddleware({
  name: 'audit-logger',
  
  async before(req, context) {
    // Capture request details
    context.auditEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      startTime: Date.now()
    };
  },
  
  async after(response, context) {
    // Complete audit entry with response details
    if (context.auditEntry) {
      context.auditEntry.endTime = Date.now();
      context.auditEntry.duration = context.auditEntry.endTime - context.auditEntry.startTime;
      context.auditEntry.status = response.status;
      
      // Parse resource type and operation from URL
      const url = new URL(context.auditEntry.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      if (pathParts.length > 0) {
        context.auditEntry.resourceType = pathParts[0];
        context.auditEntry.resourceId = pathParts[1];
        
        if (pathParts[1]?.startsWith('$')) {
          context.auditEntry.operation = pathParts[1];
        } else if (pathParts[2]?.startsWith('$')) {
          context.auditEntry.operation = pathParts[2];
        }
      }
      
      // Log the audit entry
      auditLog.push(context.auditEntry);
      
      console.log(`[AUDIT] ${context.auditEntry.method} ${context.auditEntry.resourceType || 'system'}${context.auditEntry.operation || ''} - ${context.auditEntry.status} (${context.auditEntry.duration}ms)`);
      
      // In production, you would persist this to a database or audit service
      // await persistAuditLog(context.auditEntry);
    }
    
    return response;
  }
});

// Export function to retrieve audit logs (for testing/debugging)
export function getAuditLog() {
  return auditLog;
}