export class Router {
  constructor() {
    this.routes = {
      GET: [],
      POST: [],
      PUT: [],
      DELETE: [],
      PATCH: []
    };
  }

  get(path, handler) {
    this.addRoute('GET', path, handler);
  }

  post(path, handler) {
    this.addRoute('POST', path, handler);
  }

  put(path, handler) {
    this.addRoute('PUT', path, handler);
  }

  delete(path, handler) {
    this.addRoute('DELETE', path, handler);
  }

  patch(path, handler) {
    this.addRoute('PATCH', path, handler);
  }

  addRoute(method, path, handler) {
    const regex = this.pathToRegex(path);
    const params = this.extractParams(path);
    this.routes[method].push({ path, regex, params, handler });
  }

  pathToRegex(path) {
    const pattern = path
      .replace(/\//g, '\\/')
      .replace(/:(\w+)/g, '([^/]+)')
      .replace(/\$/g, '\\$');
    return new RegExp(`^${pattern}$`);
  }

  extractParams(path) {
    const params = [];
    const matches = path.matchAll(/:(\w+)/g);
    for (const match of matches) {
      params.push(match[1]);
    }
    return params;
  }

  async handle(req) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const pathname = url.pathname;

    const routes = this.routes[method] || [];
    
    for (const route of routes) {
      const match = pathname.match(route.regex);
      if (match) {
        const params = {};
        for (let i = 0; i < route.params.length; i++) {
          params[route.params[i]] = match[i + 1];
        }
        
        req.params = params;
        req.query = Object.fromEntries(url.searchParams);
        
        return await route.handler(req);
      }
    }

    return {
      status: 404,
      body: JSON.stringify({ error: 'Not found' })
    };
  }
}