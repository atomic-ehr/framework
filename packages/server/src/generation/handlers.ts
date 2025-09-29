/**
 * Dynamic resource handler for FHIR operations
 */

import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import type { HttpRequestContext, HttpResponseContext } from '../types.js';
import type { StorageAdapter, SearchParams, HistoryParams } from './storage.js';
import { randomBytes } from 'crypto';

/**
 * Resource capabilities configuration
 */
export interface ResourceCapabilities {
  read?: boolean;
  vread?: boolean;
  update?: boolean;
  patch?: boolean;
  create?: boolean;
  delete?: boolean;
  searchType?: boolean;
  historyInstance?: boolean;
  historyType?: boolean;
}

/**
 * Dynamic resource handler that works with any FHIR resource type
 */
export class ResourceHandler {
  constructor(
    private resourceType: string,
    private schema: FHIRSchema | undefined,
    private storage: StorageAdapter,
    private capabilities: ResourceCapabilities
  ) {}

  /**
   * Handle READ operation
   */
  async read(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.read) {
      return this.createNotSupportedResponse(context, 'read');
    }

    const id = context.params.id;
    if (!id) {
      return this.createErrorResponse(context, 400, 'invalid', 'Resource ID is required');
    }

    try {
      const result = await this.storage.read(this.resourceType, id);

      if (!result.found) {
        return this.createNotFoundResponse(context, id);
      }

      return {
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId,
          'ETag': `W/"${result.versionId}"`,
          'Last-Modified': result.lastModified?.toUTCString() || new Date().toUTCString()
        },
        responseBody: result.resource,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to read resource: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle VREAD operation
   */
  async vread(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.vread) {
      return this.createNotSupportedResponse(context, 'vread');
    }

    const id = context.params.id;
    const vid = context.params.vid;

    if (!id || !vid) {
      return this.createErrorResponse(context, 400, 'invalid', 'Resource ID and version ID are required');
    }

    try {
      const result = await this.storage.vread(this.resourceType, id, vid);

      if (!result.found) {
        return this.createNotFoundResponse(context, id, vid);
      }

      return {
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId,
          'ETag': `W/"${result.versionId}"`,
          'Last-Modified': result.lastModified?.toUTCString() || new Date().toUTCString()
        },
        responseBody: result.resource,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to read resource version: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle CREATE operation
   */
  async create(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.create) {
      return this.createNotSupportedResponse(context, 'create');
    }

    if (!context.body) {
      return this.createErrorResponse(context, 400, 'invalid', 'Request body is required');
    }

    // Validate resource type matches
    if (context.body.resourceType && context.body.resourceType !== this.resourceType) {
      return this.createErrorResponse(
        context,
        400,
        'invalid',
        `Resource type in body (${context.body.resourceType}) does not match URL (${this.resourceType})`
      );
    }

    // Ensure resourceType is set
    const resource = {
      ...context.body,
      resourceType: this.resourceType,
      id: context.body.id || this.generateId()
    };

    // Validate against schema if available
    if (this.schema) {
      const validation = this.validateResource(resource);
      if (!validation.valid) {
        return this.createValidationErrorResponse(context, validation.errors);
      }
    }

    try {
      const result = await this.storage.create(this.resourceType, resource);

      return {
        statusCode: 201,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId,
          'Location': `/${this.resourceType}/${result.resource.id}`,
          'ETag': `W/"${result.versionId}"`
        },
        responseBody: result.resource,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to create resource: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle UPDATE operation
   */
  async update(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.update) {
      return this.createNotSupportedResponse(context, 'update');
    }

    const id = context.params.id;
    if (!id) {
      return this.createErrorResponse(context, 400, 'invalid', 'Resource ID is required');
    }

    if (!context.body) {
      return this.createErrorResponse(context, 400, 'invalid', 'Request body is required');
    }

    // Ensure resource has correct type and ID
    const resource = {
      ...context.body,
      resourceType: this.resourceType,
      id
    };

    // Validate against schema if available
    if (this.schema) {
      const validation = this.validateResource(resource);
      if (!validation.valid) {
        return this.createValidationErrorResponse(context, validation.errors);
      }
    }

    try {
      const result = await this.storage.update(this.resourceType, id, resource);

      return {
        statusCode: result.created ? 201 : 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId,
          'Location': `/${this.resourceType}/${id}`,
          'ETag': `W/"${result.versionId}"`
        },
        responseBody: result.resource,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to update resource: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle PATCH operation
   */
  async patch(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.patch) {
      return this.createNotSupportedResponse(context, 'patch');
    }

    const id = context.params.id;
    if (!id) {
      return this.createErrorResponse(context, 400, 'invalid', 'Resource ID is required');
    }

    if (!context.body) {
      return this.createErrorResponse(context, 400, 'invalid', 'Patch document is required');
    }

    try {
      const result = await this.storage.patch(this.resourceType, id, context.body);

      if (!result.found) {
        return this.createNotFoundResponse(context, id);
      }

      return {
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId,
          'Location': `/${this.resourceType}/${id}`,
          'ETag': `W/"${result.versionId}"`
        },
        responseBody: result.resource,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to patch resource: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle DELETE operation
   */
  async delete(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.delete) {
      return this.createNotSupportedResponse(context, 'delete');
    }

    const id = context.params.id;
    if (!id) {
      return this.createErrorResponse(context, 400, 'invalid', 'Resource ID is required');
    }

    try {
      const result = await this.storage.delete(this.resourceType, id);

      if (!result.found) {
        return this.createNotFoundResponse(context, id);
      }

      return {
        statusCode: 204,
        responseHeaders: {
          'X-Request-ID': context.requestId
        },
        responseBody: undefined,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to delete resource: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle SEARCH operation
   */
  async search(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.searchType) {
      return this.createNotSupportedResponse(context, 'search-type');
    }

    const searchParams: SearchParams = {
      query: context.query || {},
      _count: context.query._count ? parseInt(context.query._count as string) : 20,
      _offset: context.query._offset ? parseInt(context.query._offset as string) : 0,
      _sort: context.query._sort as string,
      _include: context.query._include ? this.toArray(context.query._include) : [],
      _revinclude: context.query._revinclude ? this.toArray(context.query._revinclude) : []
    };

    try {
      const result = await this.storage.search(this.resourceType, searchParams);

      const bundle = this.createSearchBundle(
        result.resources,
        result.total,
        result.offset,
        searchParams._count!,
        context.url
      );

      return {
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId
        },
        responseBody: bundle,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to search resources: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle HISTORY-INSTANCE operation
   */
  async historyInstance(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.historyInstance) {
      return this.createNotSupportedResponse(context, 'history-instance');
    }

    const id = context.params.id;
    if (!id) {
      return this.createErrorResponse(context, 400, 'invalid', 'Resource ID is required');
    }

    const historyParams: HistoryParams = {
      _count: context.query._count ? parseInt(context.query._count as string) : 20,
      _since: context.query._since as string,
      _at: context.query._at as string
    };

    try {
      const result = await this.storage.history(this.resourceType, id, historyParams);

      const bundle = this.createHistoryBundle(result.resources, result.total, context.url);

      return {
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId
        },
        responseBody: bundle,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to get resource history: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle HISTORY-TYPE operation
   */
  async historyType(context: HttpRequestContext): Promise<HttpResponseContext> {
    if (!this.capabilities.historyType) {
      return this.createNotSupportedResponse(context, 'history-type');
    }

    const historyParams: HistoryParams = {
      _count: context.query._count ? parseInt(context.query._count as string) : 20,
      _since: context.query._since as string,
      _at: context.query._at as string
    };

    try {
      const result = await this.storage.history(this.resourceType, undefined, historyParams);

      const bundle = this.createHistoryBundle(result.resources, result.total, context.url);

      return {
        statusCode: 200,
        responseHeaders: {
          'Content-Type': 'application/fhir+json; charset=utf-8',
          'X-Request-ID': context.requestId
        },
        responseBody: bundle,
        timing: this.createTiming(context)
      };
    } catch (error) {
      return this.createErrorResponse(
        context,
        500,
        'exception',
        `Failed to get type history: ${(error as Error).message}`
      );
    }
  }

  /**
   * Validate a resource against its schema
   */
  private validateResource(resource: any): { valid: boolean; errors: string[] } {
    // Basic validation - in production use full FHIRSchema validation
    const errors: string[] = [];

    if (!resource.resourceType) {
      errors.push('resourceType is required');
    }

    if (resource.resourceType !== this.resourceType) {
      errors.push(`resourceType must be ${this.resourceType}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a unique resource ID
   */
  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Convert to array if not already
   */
  private toArray(value: string | string[]): string[] {
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Create a search bundle
   */
  private createSearchBundle(
    resources: any[],
    total: number,
    offset: number,
    count: number,
    requestUrl: string
  ): any {
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total,
      link: [
        {
          relation: 'self',
          url: requestUrl
        }
      ],
      entry: resources.map(resource => ({
        fullUrl: `/${resource.resourceType}/${resource.id}`,
        resource,
        search: {
          mode: 'match'
        }
      }))
    };
  }

  /**
   * Create a history bundle
   */
  private createHistoryBundle(resources: any[], total: number, requestUrl: string): any {
    return {
      resourceType: 'Bundle',
      type: 'history',
      total,
      link: [
        {
          relation: 'self',
          url: requestUrl
        }
      ],
      entry: resources.map(resource => ({
        fullUrl: `/${resource.resourceType}/${resource.id}`,
        resource,
        request: {
          method: 'GET',
          url: `/${resource.resourceType}/${resource.id}`
        },
        response: {
          status: '200',
          lastModified: resource.meta?.lastUpdated
        }
      }))
    };
  }

  /**
   * Create timing information
   */
  private createTiming(context: HttpRequestContext) {
    const endTime = Date.now();
    return {
      startTime: context.startTime,
      endTime,
      duration: endTime - context.startTime,
      hookDuration: 0
    };
  }

  /**
   * Create not supported response
   */
  private createNotSupportedResponse(
    context: HttpRequestContext,
    operation: string
  ): HttpResponseContext {
    return {
      statusCode: 405,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'not-supported',
          diagnostics: `Operation ${operation} is not supported for ${this.resourceType}`
        }]
      },
      timing: this.createTiming(context)
    };
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    context: HttpRequestContext,
    statusCode: number,
    code: string,
    message: string
  ): HttpResponseContext {
    return {
      statusCode,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code,
          diagnostics: message
        }]
      },
      timing: this.createTiming(context)
    };
  }

  /**
   * Create not found response
   */
  private createNotFoundResponse(
    context: HttpRequestContext,
    id: string,
    vid?: string
  ): HttpResponseContext {
    const message = vid
      ? `${this.resourceType}/${id}/_history/${vid} not found`
      : `${this.resourceType}/${id} not found`;

    return {
      statusCode: 404,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'not-found',
          diagnostics: message
        }]
      },
      timing: this.createTiming(context)
    };
  }

  /**
   * Create validation error response
   */
  private createValidationErrorResponse(
    context: HttpRequestContext,
    errors: string[]
  ): HttpResponseContext {
    return {
      statusCode: 422,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: errors.map(error => ({
          severity: 'error',
          code: 'invalid',
          diagnostics: error
        }))
      },
      timing: this.createTiming(context)
    };
  }
}