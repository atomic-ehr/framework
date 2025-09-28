/**
 * FHIR Router implementation with pattern matching and route management
 */

import type {
  FhirRoute,
  FhirRouteMatch,
  ParsedFhirUrl,
  CompiledPattern,
  RouterConfig,
  RouterStats,
  RouteMatchOptions
} from './types.js';

import {
  FhirUrlPattern,
  FhirOperation
} from './types.js';

import {
  compilePattern,
  matchPattern,
  parseFhirUrl,
  normalizePath,
  extractQueryParams,
  getOperationLevel
} from './patterns.js';

import {
  defaultReadHandler,
  defaultVreadHandler,
  defaultCreateHandler,
  defaultUpdateHandler,
  defaultPatchHandler,
  defaultDeleteHandler,
  defaultSearchHandler,
  defaultSearchSystemHandler,
  defaultHistoryHandler,
  defaultCapabilitiesHandler,
  defaultBatchHandler,
  defaultTransactionHandler,
  defaultOperationHandler,
  defaultNotFoundHandler
} from './handlers.js';

/**
 * Main FHIR router implementation
 */
export class FhirRouter {
  private routes: Map<string, FhirRoute[]> = new Map();
  private compiledPatterns: Map<string, CompiledPattern> = new Map();
  private config: Required<RouterConfig>;
  private stats: RouterStats;

  constructor(config: RouterConfig = {}) {
    this.config = {
      caseSensitive: false,
      strict: false,
      enableStats: true,
      maxRoutes: 1000,
      defaultPriority: 100,
      ...config
    };

    this.stats = this.initializeStats();
    this.initializeDefaultRoutes();
  }

  /**
   * Add a route to the router
   */
  addRoute(route: FhirRoute): void {
    if (this.getTotalRoutes() >= this.config.maxRoutes) {
      throw new Error(`Maximum number of routes (${this.config.maxRoutes}) exceeded`);
    }

    // Validate route
    this.validateRoute(route);

    // Set default priority if not specified
    if (route.priority === undefined) {
      route.priority = this.config.defaultPriority;
    }

    // Create route key
    const key = this.createRouteKey(route.method, route.pattern);

    // Get or create route list for this key
    if (!this.routes.has(key)) {
      this.routes.set(key, []);
    }

    const routeList = this.routes.get(key)!;

    // Check for duplicate routes
    const existingRoute = routeList.find(r =>
      r.method === route.method &&
      r.pattern === route.pattern &&
      r.operation === route.operation
    );

    if (existingRoute) {
      throw new Error(`Route already exists: ${route.method} ${route.pattern}`);
    }

    // Add route and sort by priority (higher priority first)
    routeList.push(route);
    routeList.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Compile pattern for faster matching
    if (!this.compiledPatterns.has(route.pattern)) {
      const compiled = compilePattern(route.pattern, {
        caseSensitive: this.config.caseSensitive,
        strict: this.config.strict
      });
      this.compiledPatterns.set(route.pattern, compiled);
    }

    // Update stats
    if (this.config.enableStats) {
      this.stats.totalRoutes++;
      this.stats.routesByMethod[route.method] = (this.stats.routesByMethod[route.method] || 0) + 1;
      this.stats.routesByOperation[route.operation] = (this.stats.routesByOperation[route.operation] || 0) + 1;
    }
  }

  /**
   * Remove a route from the router
   */
  removeRoute(method: string, pattern: FhirUrlPattern): void {
    const key = this.createRouteKey(method, pattern);
    const routeList = this.routes.get(key);

    if (routeList) {
      const initialLength = routeList.length;
      const filteredRoutes = routeList.filter(r => r.pattern !== pattern);

      if (filteredRoutes.length < initialLength) {
        if (filteredRoutes.length === 0) {
          this.routes.delete(key);
        } else {
          this.routes.set(key, filteredRoutes);
        }

        // Update stats
        if (this.config.enableStats) {
          const removedCount = initialLength - filteredRoutes.length;
          this.stats.totalRoutes -= removedCount;
          this.stats.routesByMethod[method] = Math.max(0, (this.stats.routesByMethod[method] || 0) - removedCount);
        }
      }
    }
  }

  /**
   * Get all routes, optionally filtered by method
   */
  getRoutes(method?: string): FhirRoute[] {
    const allRoutes: FhirRoute[] = [];

    for (const [key, routeList] of this.routes.entries()) {
      if (!method || key.startsWith(`${method.toUpperCase()}:`)) {
        allRoutes.push(...routeList);
      }
    }

    return allRoutes.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Parse a FHIR URL and extract operation information
   */
  parseUrl(method: string, url: string): ParsedFhirUrl {
    const startTime = Date.now();

    try {
      const parsed = parseFhirUrl(method, url);

      if (this.config.enableStats) {
        this.updateMatchStats(Date.now() - startTime, true);
      }

      return parsed;
    } catch (error) {
      if (this.config.enableStats) {
        this.updateMatchStats(Date.now() - startTime, false);
      }
      throw error;
    }
  }

  /**
   * Match a URL against registered routes
   */
  match(method: string, url: string): FhirRouteMatch | null {
    const startTime = Date.now();

    try {
      // Normalize the URL path
      const [path] = url.split('?');
      const normalizedPath = normalizePath(path);
      const query = extractQueryParams(url);

      // Get potential routes for this method
      const methodKey = method.toUpperCase();
      const potentialRoutes: FhirRoute[] = [];

      for (const [key, routeList] of this.routes.entries()) {
        if (key.startsWith(`${methodKey}:`)) {
          potentialRoutes.push(...routeList);
        }
      }

      // Sort by priority
      potentialRoutes.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      // Try to match each route
      for (const route of potentialRoutes) {
        const compiledPattern = this.compiledPatterns.get(route.pattern);
        if (!compiledPattern) {
          continue;
        }

        const params = matchPattern(compiledPattern, normalizedPath);
        if (params) {
          const routeMatch: FhirRouteMatch = {
            route,
            params,
            operation: route.operation,
            level: route.level,
            query
          };

          // Extract common parameters
          if (params.resourceType) {
            routeMatch.resourceType = params.resourceType;
          }
          if (params.id) {
            routeMatch.id = params.id;
          }
          if (params.vid) {
            routeMatch.vid = params.vid;
          }
          if (params.operation) {
            routeMatch.operationName = params.operation;
          }

          if (this.config.enableStats) {
            this.updateMatchStats(Date.now() - startTime, true);
            this.updatePopularRoutes(route);
          }

          return routeMatch;
        }
      }

      // No route matched
      if (this.config.enableStats) {
        this.updateMatchStats(Date.now() - startTime, false);
      }

      return null;
    } catch (error) {
      if (this.config.enableStats) {
        this.updateMatchStats(Date.now() - startTime, false);
      }
      throw error;
    }
  }

  /**
   * Get router statistics
   */
  getStats(): RouterStats {
    return { ...this.stats };
  }

  /**
   * Reset router statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * Get total number of routes
   */
  getTotalRoutes(): number {
    return this.stats.totalRoutes;
  }

  /**
   * Check if a route exists
   */
  hasRoute(method: string, pattern: FhirUrlPattern): boolean {
    const key = this.createRouteKey(method, pattern);
    const routeList = this.routes.get(key);
    return routeList ? routeList.some(r => r.pattern === pattern) : false;
  }

  /**
   * Initialize default FHIR routes
   */
  private initializeDefaultRoutes(): void {
    const defaultRoutes: FhirRoute[] = [
      // Instance level operations
      {
        method: 'GET',
        pattern: FhirUrlPattern.READ,
        operation: FhirOperation.READ,
        level: 'instance',
        handler: defaultReadHandler,
        priority: 100,
        description: 'Read a resource instance'
      },
      {
        method: 'GET',
        pattern: FhirUrlPattern.VREAD,
        operation: FhirOperation.VREAD,
        level: 'instance',
        handler: defaultVreadHandler,
        priority: 110,
        description: 'Read a specific version of a resource'
      },
      {
        method: 'PUT',
        pattern: FhirUrlPattern.UPDATE,
        operation: FhirOperation.UPDATE,
        level: 'instance',
        handler: defaultUpdateHandler,
        priority: 100,
        description: 'Update a resource instance'
      },
      {
        method: 'PATCH',
        pattern: FhirUrlPattern.PATCH,
        operation: FhirOperation.PATCH,
        level: 'instance',
        handler: defaultPatchHandler,
        priority: 100,
        description: 'Patch a resource instance'
      },
      {
        method: 'DELETE',
        pattern: FhirUrlPattern.DELETE,
        operation: FhirOperation.DELETE,
        level: 'instance',
        handler: defaultDeleteHandler,
        priority: 100,
        description: 'Delete a resource instance'
      },
      {
        method: 'GET',
        pattern: FhirUrlPattern.HISTORY_INSTANCE,
        operation: FhirOperation.HISTORY_INSTANCE,
        level: 'instance',
        handler: defaultHistoryHandler,
        priority: 100,
        description: 'Get history of a resource instance'
      },

      // Type level operations
      {
        method: 'POST',
        pattern: FhirUrlPattern.CREATE,
        operation: FhirOperation.CREATE,
        level: 'type',
        handler: defaultCreateHandler,
        priority: 100,
        description: 'Create a new resource'
      },
      {
        method: 'GET',
        pattern: FhirUrlPattern.SEARCH_TYPE,
        operation: FhirOperation.SEARCH_TYPE,
        level: 'type',
        handler: defaultSearchHandler,
        priority: 90, // Lower than specific instance operations
        description: 'Search resources of a specific type'
      },
      {
        method: 'GET',
        pattern: FhirUrlPattern.HISTORY_TYPE,
        operation: FhirOperation.HISTORY_TYPE,
        level: 'type',
        handler: defaultHistoryHandler,
        priority: 100,
        description: 'Get history of a resource type'
      },

      // System level operations
      {
        method: 'GET',
        pattern: FhirUrlPattern.CAPABILITIES,
        operation: FhirOperation.CAPABILITIES,
        level: 'system',
        handler: defaultCapabilitiesHandler,
        priority: 200, // High priority for metadata
        description: 'Get server capabilities'
      },
      {
        method: 'GET',
        pattern: FhirUrlPattern.SEARCH_SYSTEM,
        operation: FhirOperation.SEARCH_SYSTEM,
        level: 'system',
        handler: defaultSearchSystemHandler,
        priority: 50, // Lowest priority - catch-all
        description: 'Search across all resource types'
      },
      {
        method: 'GET',
        pattern: FhirUrlPattern.HISTORY_SYSTEM,
        operation: FhirOperation.HISTORY_SYSTEM,
        level: 'system',
        handler: defaultHistoryHandler,
        priority: 100,
        description: 'Get system-wide history'
      },
      {
        method: 'POST',
        pattern: FhirUrlPattern.BATCH,
        operation: FhirOperation.BATCH,
        level: 'system',
        handler: defaultBatchHandler,
        priority: 150,
        description: 'Process a batch of operations'
      },

      // Custom operations
      {
        method: 'POST',
        pattern: FhirUrlPattern.SYSTEM_OPERATION,
        operation: FhirOperation.OPERATION,
        level: 'system',
        handler: defaultOperationHandler,
        priority: 120,
        description: 'Execute a system-level operation'
      },
      {
        method: 'POST',
        pattern: FhirUrlPattern.TYPE_OPERATION,
        operation: FhirOperation.OPERATION,
        level: 'type',
        handler: defaultOperationHandler,
        priority: 120,
        description: 'Execute a type-level operation'
      },
      {
        method: 'POST',
        pattern: FhirUrlPattern.INSTANCE_OPERATION,
        operation: FhirOperation.OPERATION,
        level: 'instance',
        handler: defaultOperationHandler,
        priority: 120,
        description: 'Execute an instance-level operation'
      }
    ];

    // Add all default routes
    for (const route of defaultRoutes) {
      try {
        this.addRoute(route);
      } catch (error) {
        console.warn(`Failed to add default route ${route.method} ${route.pattern}:`, error);
      }
    }
  }

  /**
   * Validate a route before adding it
   */
  private validateRoute(route: FhirRoute): void {
    if (!route.method || typeof route.method !== 'string') {
      throw new Error('Route method is required and must be a string');
    }

    if (!route.pattern || typeof route.pattern !== 'string') {
      throw new Error('Route pattern is required and must be a string');
    }

    if (!route.operation || typeof route.operation !== 'string') {
      throw new Error('Route operation is required and must be a string');
    }

    if (!route.level || !['system', 'type', 'instance'].includes(route.level)) {
      throw new Error('Route level must be "system", "type", or "instance"');
    }

    if (!route.handler || typeof route.handler !== 'function') {
      throw new Error('Route handler is required and must be a function');
    }

    // Validate that level matches pattern
    const expectedLevel = getOperationLevel(route.pattern as FhirUrlPattern);
    if (route.level !== expectedLevel) {
      throw new Error(`Route level "${route.level}" does not match pattern level "${expectedLevel}"`);
    }
  }

  /**
   * Create a unique key for a route
   */
  private createRouteKey(method: string, pattern: FhirUrlPattern): string {
    return `${method.toUpperCase()}:${pattern}`;
  }

  /**
   * Initialize statistics object
   */
  private initializeStats(): RouterStats {
    return {
      totalRoutes: 0,
      routesByMethod: {},
      routesByOperation: {},
      totalMatches: 0,
      successfulMatches: 0,
      failedMatches: 0,
      averageMatchTime: 0,
      popularRoutes: []
    };
  }

  /**
   * Update match statistics
   */
  private updateMatchStats(duration: number, success: boolean): void {
    this.stats.totalMatches++;

    if (success) {
      this.stats.successfulMatches++;
    } else {
      this.stats.failedMatches++;
    }

    // Update average match time
    this.stats.averageMatchTime =
      (this.stats.averageMatchTime * (this.stats.totalMatches - 1) + duration) / this.stats.totalMatches;
  }

  /**
   * Update popular routes statistics
   */
  private updatePopularRoutes(route: FhirRoute): void {
    const routeKey = `${route.method} ${route.pattern}`;
    const existing = this.stats.popularRoutes.find(r => r.route === routeKey);

    if (existing) {
      existing.count++;
    } else {
      this.stats.popularRoutes.push({ route: routeKey, count: 1 });
    }

    // Keep only top 10 popular routes
    this.stats.popularRoutes.sort((a, b) => b.count - a.count);
    this.stats.popularRoutes = this.stats.popularRoutes.slice(0, 10);
  }
}