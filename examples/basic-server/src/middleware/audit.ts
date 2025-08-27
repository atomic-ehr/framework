import { defineMiddleware, type MiddlewareDefinition, type HandlerContext } from '@atomic-fhir/core';

const auditLog: any[] = [];

export default defineMiddleware({
  name: 'audit-logger',
  
  async before(req: Request, context: HandlerContext): Promise<Request | void> {
    // Capture request details
    (context as any).auditEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      startTime: Date.now()
    };
  },
  
  async after(response: Response, context: HandlerContext): Promise<Response | void> {
    // Complete audit entry with response details
    if ((context as any).auditEntry) {
      (context as any).auditEntry.endTime = Date.now();
      (context as any).auditEntry.duration = (context as any).auditEntry.endTime - (context as any).auditEntry.startTime;
      (context as any).auditEntry.status = response.status;
      
      // Parse resource type and operation from URL
      const url = new URL((context as any).auditEntry.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      if (pathParts.length > 0) {
        (context as any).auditEntry.resourceType = pathParts[0];
        (context as any).auditEntry.resourceId = pathParts[1];
        
        if (pathParts[1]?.startsWith('$')) {
          (context as any).auditEntry.operation = pathParts[1];
        } else if (pathParts[2]?.startsWith('$')) {
          (context as any).auditEntry.operation = pathParts[2];
        }
      }
      
      // Log the audit entry
      auditLog.push((context as any).auditEntry);
      
      console.log(`[AUDIT] ${(context as any).auditEntry.method} ${(context as any).auditEntry.resourceType || 'system'}${(context as any).auditEntry.operation || ''} - ${(context as any).auditEntry.status} (${(context as any).auditEntry.duration}ms)`);
      
      // In production, you would persist this to a database or audit service
      // await persistAuditLog(context.auditEntry);
    }
    
    return response;
  }
});

// Export function to retrieve audit logs (for testing/debugging)
export function getAuditLog(): any[] {
  return auditLog;
}