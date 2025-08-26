import FindMyWay from 'find-my-way';

export class Router {
  constructor() {
    // Create find-my-way router instance with custom options
    this.fmw = FindMyWay({
      ignoreTrailingSlash: true,
      allowUnsafeRegex: true,
      caseSensitive: true,
      maxParamLength: 500,
      // Custom 404 handler
      defaultRoute: (req, res) => {
        return {
          status: 404,
          body: JSON.stringify({ error: 'Not found' })
        };
      }
    });
  }

  get(path, handler) {
    this.fmw.on('GET', this.normalizePath(path), this.wrapHandler(handler));
  }

  post(path, handler) {
    this.fmw.on('POST', this.normalizePath(path), this.wrapHandler(handler));
  }

  put(path, handler) {
    this.fmw.on('PUT', this.normalizePath(path), this.wrapHandler(handler));
  }

  delete(path, handler) {
    this.fmw.on('DELETE', this.normalizePath(path), this.wrapHandler(handler));
  }

  patch(path, handler) {
    this.fmw.on('PATCH', this.normalizePath(path), this.wrapHandler(handler));
  }

  // Normalize path to work with find-my-way's expectations
  normalizePath(path) {
    // Convert Express-style params to find-my-way style
    // :resourceType -> :resourceType
    // $:operation -> $:operation (keep $ as literal)
    
    // find-my-way handles :param notation natively
    // We just need to ensure $ is treated as a literal character
    return path;
  }

  // Wrap handler to work with find-my-way's callback style
  wrapHandler(handler) {
    return async (req, res, params, store, searchParams) => {
      // Add params and query to request object for compatibility
      req.params = params || {};
      
      // Parse query parameters from URL
      const url = new URL(req.url);
      req.query = Object.fromEntries(url.searchParams);
      
      // Call the original handler and return the response
      const response = await handler(req);
      
      // find-my-way expects us to handle the response ourselves
      // We'll store it on the request for retrieval in handle()
      req._response = response;
      
      return response;
    };
  }

  async handle(req) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const pathname = url.pathname;

    // Create a mock response object for find-my-way
    const res = {};
    
    // Use find-my-way's lookup method
    const route = this.fmw.find(method, pathname);
    
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
      return result || req._response || {
        status: 500,
        body: JSON.stringify({ error: 'No response from handler' })
      };
    } catch (error) {
      return {
        status: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }
}