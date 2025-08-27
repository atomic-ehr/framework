import { defineMiddleware, type MiddlewareDefinition, type HandlerContext } from '@atomic-fhir/core';

// This middleware will be auto-discovered and applied globally

export default defineMiddleware({
  name: 'request-logger',
  
  async before(req: Request, context: HandlerContext): Promise<Request | void> {
    console.log(`📥 ${req.method} ${req.url}`);
    (context as any).startTime = Date.now();
  },
  
  async after(response: Response, context: HandlerContext): Promise<Response | void> {
    const duration = Date.now() - (context as any).startTime;
    console.log(`📤 ${response.status} (${duration}ms)`);
    return response;
  }
});