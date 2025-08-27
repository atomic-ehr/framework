import type { MiddlewareDefinition, HandlerContext } from '../types/index.js';

export function defineMiddleware(definition: Partial<MiddlewareDefinition> & {
  name?: string;
  scope?: Record<string, any>;
  before?: (req: Request, context: HandlerContext) => Promise<Request | void>;
  after?: (res: Response, context: HandlerContext) => Promise<Response | void>;
}): MiddlewareDefinition & { scope: Record<string, any> } {
  return {
    name: definition.name,
    scope: definition.scope || {},
    before: definition.before,
    after: definition.after
  };
}