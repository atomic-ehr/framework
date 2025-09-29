/**
 * Storage abstraction layer for FHIR resources
 * Aligns with @atomic-ehr/core ResourceRepository interface
 */

import type { Resource, ResourceRepository } from '@atomic-ehr/core';

/**
 * Search parameters for FHIR search operations
 */
export interface SearchParams {
  query: Record<string, string | string[]>;
  _count?: number;
  _offset?: number;
  _sort?: string;
  _include?: string[];
  _revinclude?: string[];
}

/**
 * History parameters for FHIR history operations
 */
export interface HistoryParams {
  _count?: number;
  _since?: string;
  _at?: string;
}

/**
 * Result of a storage operation
 */
export interface StorageResult {
  resource?: any;
  found: boolean;
  created?: boolean;
  updated?: boolean;
  deleted?: boolean;
  versionId?: string;
  lastModified?: Date;
}

/**
 * Result of a search operation
 */
export interface SearchResult {
  resources: any[];
  total: number;
  hasMore: boolean;
  offset: number;
}

/**
 * Result of a history operation
 */
export interface HistoryResult {
  resources: any[];
  total: number;
  hasMore: boolean;
}

/**
 * Storage adapter interface for FHIR resources
 * Extends core ResourceRepository with additional server-specific methods
 */
export interface StorageAdapter {
  /**
   * Create a new resource
   */
  create(resourceType: string, resource: any): Promise<StorageResult>;

  /**
   * Read a resource by ID
   */
  read(resourceType: string, id: string): Promise<StorageResult>;

  /**
   * Update an existing resource
   */
  update(resourceType: string, id: string, resource: any): Promise<StorageResult>;

  /**
   * Patch an existing resource
   */
  patch(resourceType: string, id: string, patchDoc: any): Promise<StorageResult>;

  /**
   * Delete a resource
   */
  delete(resourceType: string, id: string): Promise<StorageResult>;

  /**
   * Search for resources
   */
  search(resourceType: string, params: SearchParams): Promise<SearchResult>;

  /**
   * Count resources matching search criteria
   */
  count(resourceType: string, params: SearchParams): Promise<number>;

  /**
   * Get history for a resource or resource type
   */
  history(resourceType: string, id?: string, params?: HistoryParams): Promise<HistoryResult>;

  /**
   * Read a specific version of a resource
   */
  vread(resourceType: string, id: string, versionId: string): Promise<StorageResult>;

  /**
   * Process a transaction bundle
   */
  transaction(bundle: any): Promise<any>;

  /**
   * Process a batch bundle
   */
  batch(bundle: any): Promise<any>;

  /**
   * Check if a resource exists
   */
  exists(resourceType: string, id: string): Promise<boolean>;

  /**
   * Clear all data (useful for testing)
   */
  clear?(): Promise<void>;
}

/**
 * Adapter to bridge ResourceRepository to StorageAdapter
 */
export class ResourceRepositoryAdapter implements StorageAdapter {
  constructor(private repository: ResourceRepository) {}

  async create(resourceType: string, resource: any): Promise<StorageResult> {
    try {
      const created = await this.repository.create({ resourceType, resource });
      return {
        resource: created,
        found: true,
        created: true,
        versionId: created.meta?.versionId || '1',
        lastModified: created.meta?.lastUpdated ? new Date(created.meta.lastUpdated) : new Date()
      };
    } catch (error) {
      throw error;
    }
  }

  async read(resourceType: string, id: string): Promise<StorageResult> {
    try {
      const resource = await this.repository.read({ resourceType, id });
      return {
        resource,
        found: true,
        versionId: resource.meta?.versionId,
        lastModified: resource.meta?.lastUpdated ? new Date(resource.meta.lastUpdated) : undefined
      };
    } catch (error) {
      return { found: false };
    }
  }

  async update(resourceType: string, id: string, resource: any): Promise<StorageResult> {
    try {
      const updated = await this.repository.update({ resourceType, id, resource });
      return {
        resource: updated,
        found: true,
        updated: true,
        versionId: updated.meta?.versionId,
        lastModified: updated.meta?.lastUpdated ? new Date(updated.meta.lastUpdated) : new Date()
      };
    } catch (error) {
      throw error;
    }
  }

  async patch(resourceType: string, id: string, patchDoc: any): Promise<StorageResult> {
    try {
      const patched = await this.repository.patch({ resourceType, id, resource: patchDoc });
      return {
        resource: patched,
        found: true,
        updated: true,
        versionId: patched.meta?.versionId,
        lastModified: patched.meta?.lastUpdated ? new Date(patched.meta.lastUpdated) : new Date()
      };
    } catch (error) {
      return { found: false };
    }
  }

  async delete(resourceType: string, id: string): Promise<StorageResult> {
    try {
      await this.repository.delete({ resourceType, id });
      return {
        found: true,
        deleted: true,
        lastModified: new Date()
      };
    } catch (error) {
      return { found: false };
    }
  }

  async search(resourceType: string, params: SearchParams): Promise<SearchResult> {
    try {
      // Convert SearchParams to query string for core repository
      const queryString = Object.entries(params.query)
        .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
        .join('&');

      const resources = await this.repository.search({ resourceType, query: queryString });

      return {
        resources,
        total: resources.length,
        hasMore: false,
        offset: params._offset || 0
      };
    } catch (error) {
      return {
        resources: [],
        total: 0,
        hasMore: false,
        offset: 0
      };
    }
  }

  async count(resourceType: string, params: SearchParams): Promise<number> {
    const result = await this.search(resourceType, params);
    return result.total;
  }

  async history(resourceType: string, id?: string, params?: HistoryParams): Promise<HistoryResult> {
    try {
      const resources = id
        ? await this.repository.history({ resourceType, id })
        : await this.repository.typeHistory({ resourceType });

      return {
        resources,
        total: resources.length,
        hasMore: false
      };
    } catch (error) {
      return {
        resources: [],
        total: 0,
        hasMore: false
      };
    }
  }

  async vread(resourceType: string, id: string, versionId: string): Promise<StorageResult> {
    // Note: Core ResourceRepository doesn't have vread, so we try to get from history
    try {
      const historyResult = await this.repository.history({ resourceType, id });
      const version = historyResult.find((r: any) => r.meta?.versionId === versionId);

      if (!version) {
        return { found: false };
      }

      return {
        resource: version,
        found: true,
        versionId: version.meta?.versionId,
        lastModified: version.meta?.lastUpdated ? new Date(version.meta.lastUpdated) : undefined
      };
    } catch (error) {
      return { found: false };
    }
  }

  async transaction(bundle: any): Promise<any> {
    throw new Error('Transaction not implemented in ResourceRepositoryAdapter');
  }

  async batch(bundle: any): Promise<any> {
    throw new Error('Batch not implemented in ResourceRepositoryAdapter');
  }

  async exists(resourceType: string, id: string): Promise<boolean> {
    const result = await this.read(resourceType, id);
    return result.found;
  }

  async clear(): Promise<void> {
    // Not supported in core ResourceRepository
    throw new Error('Clear not supported in ResourceRepositoryAdapter');
  }
}