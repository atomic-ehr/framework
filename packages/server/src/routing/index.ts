/**
 * Main exports for FHIR routing system
 */

import type {
  FhirRoute,
  FhirOperationHandler,
  FhirOperationLevel,
  RouterConfig
} from './types.js';

import {
  FhirUrlPattern,
  FhirOperation
} from './types.js';

import { FhirRouter } from './router.js';

// Core router
export { FhirRouter } from './router.js';

// Types and enums
export type {
  FhirRoute,
  FhirRouteMatch,
  FhirOperationHandler,
  ParsedFhirUrl,
  CompiledPattern,
  RouterConfig,
  RouterStats,
  FhirOperationLevel
} from './types.js';

export {
  FhirUrlPattern,
  FhirOperation,
  FhirRoutingError
} from './types.js';

// Pattern utilities
export {
  compilePattern,
  matchPattern,
  parseFhirUrl,
  isValidResourceType,
  isValidFhirId,
  normalizePath,
  extractQueryParams,
  buildUrl,
  getOperationLevel
} from './patterns.js';

// Default handlers
export {
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
  defaultNotFoundHandler,
  defaultUnsupportedHandler
} from './handlers.js';

/**
 * Create a new FHIR router with default configuration
 */
export function createFhirRouter(config?: RouterConfig): FhirRouter {
  return new FhirRouter(config);
}

/**
 * Route builder utility for fluent route creation
 */
export class RouteBuilder {
  private route: Partial<FhirRoute> = {};

  method(method: string): RouteBuilder {
    this.route.method = method;
    return this;
  }

  pattern(pattern: FhirUrlPattern): RouteBuilder {
    this.route.pattern = pattern;
    return this;
  }

  operation(operation: FhirOperation): RouteBuilder {
    this.route.operation = operation;
    return this;
  }

  level(level: FhirOperationLevel): RouteBuilder {
    this.route.level = level;
    return this;
  }

  handler(handler: FhirOperationHandler): RouteBuilder {
    this.route.handler = handler;
    return this;
  }

  priority(priority: number): RouteBuilder {
    this.route.priority = priority;
    return this;
  }

  description(description: string): RouteBuilder {
    this.route.description = description;
    return this;
  }

  build(): FhirRoute {
    if (!this.route.method) {
      throw new Error('Route method is required');
    }
    if (!this.route.pattern) {
      throw new Error('Route pattern is required');
    }
    if (!this.route.operation) {
      throw new Error('Route operation is required');
    }
    if (!this.route.level) {
      throw new Error('Route level is required');
    }
    if (!this.route.handler) {
      throw new Error('Route handler is required');
    }

    return this.route as FhirRoute;
  }
}

/**
 * Create a new route builder
 */
export function createRoute(): RouteBuilder {
  return new RouteBuilder();
}

/**
 * Convenience functions for common route patterns
 */
export const RouteHelpers = {
  /**
   * Create a read route for a resource type
   */
  read(resourceType: string, handler: FhirOperationHandler): FhirRoute {
    return createRoute()
      .method('GET')
      .pattern(FhirUrlPattern.READ)
      .operation(FhirOperation.READ)
      .level('instance')
      .handler(handler)
      .description(`Read ${resourceType} instances`)
      .build();
  },

  /**
   * Create a create route for a resource type
   */
  create(resourceType: string, handler: FhirOperationHandler): FhirRoute {
    return createRoute()
      .method('POST')
      .pattern(FhirUrlPattern.CREATE)
      .operation(FhirOperation.CREATE)
      .level('type')
      .handler(handler)
      .description(`Create ${resourceType} instances`)
      .build();
  },

  /**
   * Create an update route for a resource type
   */
  update(resourceType: string, handler: FhirOperationHandler): FhirRoute {
    return createRoute()
      .method('PUT')
      .pattern(FhirUrlPattern.UPDATE)
      .operation(FhirOperation.UPDATE)
      .level('instance')
      .handler(handler)
      .description(`Update ${resourceType} instances`)
      .build();
  },

  /**
   * Create a delete route for a resource type
   */
  delete(resourceType: string, handler: FhirOperationHandler): FhirRoute {
    return createRoute()
      .method('DELETE')
      .pattern(FhirUrlPattern.DELETE)
      .operation(FhirOperation.DELETE)
      .level('instance')
      .handler(handler)
      .description(`Delete ${resourceType} instances`)
      .build();
  },

  /**
   * Create a search route for a resource type
   */
  search(resourceType: string, handler: FhirOperationHandler): FhirRoute {
    return createRoute()
      .method('GET')
      .pattern(FhirUrlPattern.SEARCH_TYPE)
      .operation(FhirOperation.SEARCH_TYPE)
      .level('type')
      .handler(handler)
      .description(`Search ${resourceType} instances`)
      .build();
  },

  /**
   * Create a custom operation route
   */
  operation(
    operationName: string,
    level: FhirOperationLevel,
    handler: FhirOperationHandler
  ): FhirRoute {
    let pattern: FhirUrlPattern;

    switch (level) {
      case 'system':
        pattern = FhirUrlPattern.SYSTEM_OPERATION;
        break;
      case 'type':
        pattern = FhirUrlPattern.TYPE_OPERATION;
        break;
      case 'instance':
        pattern = FhirUrlPattern.INSTANCE_OPERATION;
        break;
      default:
        throw new Error(`Invalid operation level: ${level}`);
    }

    return createRoute()
      .method('POST')
      .pattern(pattern)
      .operation(FhirOperation.OPERATION)
      .level(level)
      .handler(handler)
      .description(`${level} operation: $${operationName}`)
      .build();
  }
};

/**
 * Default export is the FhirRouter class
 */
export default FhirRouter;