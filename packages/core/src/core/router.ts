import FindMyWay from 'find-my-way';
import type { HandlerResponse } from '../types/index.js';

type RouteHandler = (req: Request) => Promise<HandlerResponse>;
type FindMyWayHandler = (req: Request, res: any, params: any, store: any, searchParams: any) => Promise<HandlerResponse>;

interface RouteMatch {
  handler: FindMyWayHandler;
  params: Record<string, string>;
  store: any;
  searchParams: any;
}

export class Router {
  private fmw: any;

  constructor() {
    // Create find-my-way router instance with custom options
    this.fmw = FindMyWay({
      ignoreTrailingSlash: true,
      allowUnsafeRegex: true,
      caseSensitive: true,
      maxParamLength: 500,
      // Custom 404 handler
      defaultRoute: (_req: any, _res: any) => {
        return {
          status: 404,
          body: JSON.stringify({ error: 'Not found' })
        };
      }
    });
  }

  get(path: string, handler: RouteHandler): void {
    this.fmw.on('GET', this.normalizePath(path), this.wrapHandler(handler));
  }

  post(path: string, handler: RouteHandler): void {
    this.fmw.on('POST', this.normalizePath(path), this.wrapHandler(handler));
  }

  put(path: string, handler: RouteHandler): void {
    this.fmw.on('PUT', this.normalizePath(path), this.wrapHandler(handler));
  }

  delete(path: string, handler: RouteHandler): void {
    this.fmw.on('DELETE', this.normalizePath(path), this.wrapHandler(handler));
  }

  patch(path: string, handler: RouteHandler): void {
    this.fmw.on('PATCH', this.normalizePath(path), this.wrapHandler(handler));
  }

  // Normalize path to work with find-my-way's expectations
  private normalizePath(path: string): string {
    // Convert Express-style params to find-my-way style
    // :resourceType -> :resourceType
    // $:operation -> $:operation (keep $ as literal)
    
    // find-my-way handles :param notation natively
    // We just need to ensure $ is treated as a literal character
    return path;
  }

  // Wrap handler to work with find-my-way's callback style
  private wrapHandler(handler: RouteHandler): FindMyWayHandler {
    return async (req: Request, _res: any, params: any, _store: any, _searchParams: any): Promise<HandlerResponse> => {
      // Add params and query to request object for compatibility
      (req as any).params = params || {};
      
      // Parse query parameters from URL
      const url = new URL(req.url);
      (req as any).query = Object.fromEntries(url.searchParams);
      
      // Call the original handler and return the response
      const response = await handler(req);
      
      // find-my-way expects us to handle the response ourselves
      // We'll store it on the request for retrieval in handle()
      (req as any)._response = response;
      
      return response;
    };
  }

  async handle(req: Request): Promise<HandlerResponse> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const pathname = url.pathname;

    // Create a mock response object for find-my-way
    const res = {};
    
    // Use find-my-way's lookup method
    const route: RouteMatch | null = this.fmw.find(method, pathname);
    
    if (!route) {
      return {
        status: 404,
        body: JSON.stringify({ error: 'Not found' })
      };
    }

    // Execute the handler
    try {
      const result = await route.handler(req, res, route.params, route.store, route.searchParams);
      
      // The handler should return the response object
      return result || (req as any)._response || {
        status: 500,
        body: JSON.stringify({ error: 'No response from handler' })
      };
    } catch (error) {
      return {
        status: 500,
        body: JSON.stringify({ error: (error as Error).message })
      };
    }
  }
}