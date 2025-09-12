import type { MiddlewareDefinition, HandlerContext } from '../types/index.js';

interface MiddlewareScope {
  resources?: string[];
  operations?: string[];
}

interface MiddlewareWithScope extends MiddlewareDefinition {
  scope?: MiddlewareScope;
}

export class MiddlewareManager {
  private middleware: MiddlewareWithScope[];

  constructor() {
    this.middleware = [];
  }

  use(middleware: MiddlewareWithScope): void {
    this.middleware.push(middleware);
  }

  register(middleware: MiddlewareDefinition): void {
    this.middleware.push(middleware);
  }

  async executeBefore(context: HandlerContext & { req: Request; resourceType?: string; operation?: string }): Promise<any> {
    console.log(`[MIDDLEWARE] Executing ${this.middleware.length} middleware before handlers`);
    for (const mw of this.middleware) {
      if (mw.before && this.shouldExecute(mw, context)) {
        console.log(`[MIDDLEWARE] Executing middleware: ${mw.name || 'unnamed'}`);
        const result = await mw.before(context.req, context);
        if (result && this.isHandlerResponse(result)) {
          console.log(`[MIDDLEWARE] Middleware ${mw.name || 'unnamed'} returned response - short-circuiting`);
          return result;
        } else if (result instanceof Request) {
          // Update the request in context if middleware returned a modified Request
          context.req = result;
        }
      }
    }
    return null;
  }

  async executeAfter(response: Response, context: HandlerContext & { resourceType?: string; operation?: string }): Promise<Response> {
    for (const mw of this.middleware) {
      if (mw.after && this.shouldExecute(mw, context)) {
        const result = await mw.after(response, context);
        if (result) {
          response = result;
        }
      }
    }
    return response;
  }

  private shouldExecute(middleware: MiddlewareWithScope, context: { resourceType?: string; operation?: string }): boolean {
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

  private isHandlerResponse(result: any): boolean {
    // Check if result looks like a HandlerResponse object
    return result && typeof result === 'object' && 
           (typeof result.status === 'number' || 
            result.headers !== undefined || 
            result.body !== undefined) &&
           !(result instanceof Request);
  }
}