import { defineMiddleware } from '@atomic/framework';

// This middleware will be auto-discovered and applied globally

export default defineMiddleware({
  name: 'request-logger',
  
  async before(req, context) {
    console.log(`📥 ${req.method} ${req.url}`);
    context.startTime = Date.now();
  },
  
  async after(response, context) {
    const duration = Date.now() - context.startTime;
    console.log(`📤 ${response.status} (${duration}ms)`);
    return response;
  }
});