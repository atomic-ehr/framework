export class MiddlewareManager {
  constructor() {
    this.middleware = [];
  }

  use(middleware) {
    this.middleware.push(middleware);
  }

  async executeBefore(context) {
    for (const mw of this.middleware) {
      if (mw.before && this.shouldExecute(mw, context)) {
        await mw.before(context.req, context);
      }
    }
  }

  async executeAfter(response, context) {
    for (const mw of this.middleware) {
      if (mw.after && this.shouldExecute(mw, context)) {
        response = await mw.after(response, context) || response;
      }
    }
    return response;
  }

  shouldExecute(middleware, context) {
    if (!middleware.scope) return true;
    
    const { resources, operations } = middleware.scope;
    
    if (resources && context.resourceType) {
      if (!resources.includes(context.resourceType)) return false;
    }
    
    if (operations && context.operation) {
      if (!operations.includes(context.operation)) return false;
    }
    
    return true;
  }
}