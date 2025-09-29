/**
 * In-memory storage adapter implementation for FHIR resources
 */

import { randomBytes } from 'crypto';
import type {
  StorageAdapter,
  StorageResult,
  SearchParams,
  SearchResult,
  HistoryParams,
  HistoryResult
} from './storage.js';

/**
 * Stored resource with metadata
 */
interface StoredResource {
  resource: any;
  versionId: string;
  lastModified: Date;
  deleted: boolean;
}

/**
 * Version history entry
 */
interface VersionEntry {
  resource: any;
  versionId: string;
  lastModified: Date;
  method: 'create' | 'update' | 'patch' | 'delete';
}

/**
 * In-memory storage implementation for development and testing
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private resources: Map<string, Map<string, StoredResource>> = new Map();
  private historyStore: Map<string, VersionEntry[]> = new Map();
  private versionCounter = 1;

  /**
   * Generate a unique resource ID
   */
  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate a version ID
   */
  private generateVersionId(): string {
    return String(this.versionCounter++);
  }

  /**
   * Get or create resource type storage
   */
  private getResourceTypeStorage(resourceType: string): Map<string, StoredResource> {
    if (!this.resources.has(resourceType)) {
      this.resources.set(resourceType, new Map());
    }
    return this.resources.get(resourceType)!;
  }

  /**
   * Get history key for a resource
   */
  private getHistoryKey(resourceType: string, id: string): string {
    return `${resourceType}/${id}`;
  }

  /**
   * Add version to history
   */
  private addToHistory(
    resourceType: string,
    id: string,
    resource: any,
    versionId: string,
    method: 'create' | 'update' | 'patch' | 'delete'
  ): void {
    const key = this.getHistoryKey(resourceType, id);
    if (!this.historyStore.has(key)) {
      this.historyStore.set(key, []);
    }

    this.historyStore.get(key)!.push({
      resource: JSON.parse(JSON.stringify(resource)),
      versionId,
      lastModified: new Date(),
      method
    });
  }

  /**
   * Create a new resource
   */
  async create(resourceType: string, resource: any): Promise<StorageResult> {
    const storage = this.getResourceTypeStorage(resourceType);
    const id = resource.id || this.generateId();
    const versionId = this.generateVersionId();
    const lastModified = new Date();

    // Check if resource already exists
    if (storage.has(id)) {
      throw new Error(`Resource ${resourceType}/${id} already exists`);
    }

    const storedResource: StoredResource = {
      resource: {
        ...resource,
        id,
        resourceType,
        meta: {
          ...resource.meta,
          versionId,
          lastUpdated: lastModified.toISOString()
        }
      },
      versionId,
      lastModified,
      deleted: false
    };

    storage.set(id, storedResource);
    this.addToHistory(resourceType, id, storedResource.resource, versionId, 'create');

    return {
      resource: storedResource.resource,
      found: true,
      created: true,
      versionId,
      lastModified
    };
  }

  /**
   * Read a resource by ID
   */
  async read(resourceType: string, id: string): Promise<StorageResult> {
    const storage = this.getResourceTypeStorage(resourceType);
    const storedResource = storage.get(id);

    if (!storedResource || storedResource.deleted) {
      return { found: false };
    }

    return {
      resource: storedResource.resource,
      found: true,
      versionId: storedResource.versionId,
      lastModified: storedResource.lastModified
    };
  }

  /**
   * Update an existing resource
   */
  async update(resourceType: string, id: string, resource: any): Promise<StorageResult> {
    const storage = this.getResourceTypeStorage(resourceType);
    const existingResource = storage.get(id);
    const versionId = this.generateVersionId();
    const lastModified = new Date();

    const storedResource: StoredResource = {
      resource: {
        ...resource,
        id,
        resourceType,
        meta: {
          ...resource.meta,
          versionId,
          lastUpdated: lastModified.toISOString()
        }
      },
      versionId,
      lastModified,
      deleted: false
    };

    storage.set(id, storedResource);
    this.addToHistory(resourceType, id, storedResource.resource, versionId, 'update');

    return {
      resource: storedResource.resource,
      found: true,
      created: !existingResource,
      updated: !!existingResource,
      versionId,
      lastModified
    };
  }

  /**
   * Patch an existing resource (JSON Patch)
   */
  async patch(resourceType: string, id: string, patchDoc: any): Promise<StorageResult> {
    const storage = this.getResourceTypeStorage(resourceType);
    const storedResource = storage.get(id);

    if (!storedResource || storedResource.deleted) {
      return { found: false };
    }

    // Simple patch implementation (only supports basic operations)
    // In production, use a proper JSON Patch library
    const patched = JSON.parse(JSON.stringify(storedResource.resource));

    if (Array.isArray(patchDoc)) {
      for (const operation of patchDoc) {
        if (operation.op === 'replace' && operation.path && operation.value !== undefined) {
          const path = operation.path.split('/').filter(Boolean);
          let target = patched;
          for (let i = 0; i < path.length - 1; i++) {
            target = target[path[i]];
          }
          target[path[path.length - 1]] = operation.value;
        }
      }
    }

    return this.update(resourceType, id, patched);
  }

  /**
   * Delete a resource
   */
  async delete(resourceType: string, id: string): Promise<StorageResult> {
    const storage = this.getResourceTypeStorage(resourceType);
    const storedResource = storage.get(id);

    if (!storedResource || storedResource.deleted) {
      return { found: false };
    }

    const versionId = this.generateVersionId();
    const lastModified = new Date();

    storedResource.deleted = true;
    storedResource.versionId = versionId;
    storedResource.lastModified = lastModified;

    this.addToHistory(resourceType, id, storedResource.resource, versionId, 'delete');

    return {
      found: true,
      deleted: true,
      versionId,
      lastModified
    };
  }

  /**
   * Search for resources
   */
  async search(resourceType: string, params: SearchParams): Promise<SearchResult> {
    const storage = this.getResourceTypeStorage(resourceType);
    let resources = Array.from(storage.values())
      .filter(stored => !stored.deleted)
      .map(stored => stored.resource);

    // Apply search filters
    const query = params.query || {};
    resources = this.applySearchFilters(resources, query);

    // Apply sorting
    if (params._sort) {
      resources = this.applySorting(resources, params._sort);
    }

    // Calculate pagination
    const total = resources.length;
    const offset = params._offset || 0;
    const count = params._count || 20;
    const paginatedResources = resources.slice(offset, offset + count);
    const hasMore = offset + count < total;

    return {
      resources: paginatedResources,
      total,
      hasMore,
      offset
    };
  }

  /**
   * Apply search filters to resources
   */
  private applySearchFilters(resources: any[], query: Record<string, string | string[]>): any[] {
    let filtered = resources;

    for (const [key, value] of Object.entries(query)) {
      // Skip FHIR control parameters
      if (key.startsWith('_')) {
        continue;
      }

      filtered = filtered.filter(resource => {
        const searchValue = Array.isArray(value) ? value : [value];
        return this.matchSearchParameter(resource, key, searchValue);
      });
    }

    return filtered;
  }

  /**
   * Match a search parameter against a resource
   */
  private matchSearchParameter(resource: any, param: string, values: string[]): boolean {
    // Simple string matching implementation
    // In production, implement full FHIR search parameter logic

    const resourceValue = this.getValueByPath(resource, param);
    if (resourceValue === undefined) {
      return false;
    }

    const resourceValueStr = String(resourceValue).toLowerCase();
    return values.some(v => resourceValueStr.includes(v.toLowerCase()));
  }

  /**
   * Get value from resource by path
   */
  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle arrays
      if (Array.isArray(current)) {
        // Check if any array element has the property
        for (const item of current) {
          const value = this.getValueByPath(item, parts.slice(parts.indexOf(part)).join('.'));
          if (value !== undefined) {
            return value;
          }
        }
        return undefined;
      }

      current = current[part];
    }

    return current;
  }

  /**
   * Apply sorting to resources
   */
  private applySorting(resources: any[], sortParam: string): any[] {
    const descending = sortParam.startsWith('-');
    const field = descending ? sortParam.substring(1) : sortParam;

    return resources.sort((a, b) => {
      const aValue = this.getValueByPath(a, field);
      const bValue = this.getValueByPath(b, field);

      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      if (aValue > bValue) comparison = 1;

      return descending ? -comparison : comparison;
    });
  }

  /**
   * Count resources matching search criteria
   */
  async count(resourceType: string, params: SearchParams): Promise<number> {
    const result = await this.search(resourceType, params);
    return result.total;
  }

  /**
   * Get history for a resource or resource type
   */
  async history(
    resourceType: string,
    id?: string,
    params?: HistoryParams
  ): Promise<HistoryResult> {
    let allVersions: VersionEntry[] = [];

    if (id) {
      // Instance history
      const key = this.getHistoryKey(resourceType, id);
      allVersions = this.historyStore.get(key) || [];
    } else {
      // Type history
      for (const [key, versions] of this.historyStore.entries()) {
        if (key.startsWith(`${resourceType}/`)) {
          allVersions.push(...versions);
        }
      }
    }

    // Filter by _since
    if (params?._since) {
      const since = new Date(params._since);
      allVersions = allVersions.filter(v => v.lastModified >= since);
    }

    // Filter by _at (point in time)
    if (params?._at) {
      const at = new Date(params._at);
      allVersions = allVersions.filter(v => v.lastModified <= at);
    }

    // Sort by lastModified descending (most recent first)
    allVersions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    // Apply pagination
    const count = params?._count || 20;
    const total = allVersions.length;
    const paginatedVersions = allVersions.slice(0, count);
    const hasMore = count < total;

    return {
      resources: paginatedVersions.map(v => v.resource),
      total,
      hasMore
    };
  }

  /**
   * Read a specific version of a resource
   */
  async vread(resourceType: string, id: string, versionId: string): Promise<StorageResult> {
    const key = this.getHistoryKey(resourceType, id);
    const versions = this.historyStore.get(key);

    if (!versions) {
      return { found: false };
    }

    const version = versions.find(v => v.versionId === versionId);
    if (!version) {
      return { found: false };
    }

    return {
      resource: version.resource,
      found: true,
      versionId: version.versionId,
      lastModified: version.lastModified
    };
  }

  /**
   * Process a transaction bundle
   */
  async transaction(bundle: any): Promise<any> {
    // Transaction processing should be atomic
    // For now, this is a placeholder
    throw new Error('Transaction not yet implemented in MemoryStorageAdapter');
  }

  /**
   * Process a batch bundle
   */
  async batch(bundle: any): Promise<any> {
    // Batch processing processes each entry independently
    // For now, this is a placeholder
    throw new Error('Batch not yet implemented in MemoryStorageAdapter');
  }

  /**
   * Check if a resource exists
   */
  async exists(resourceType: string, id: string): Promise<boolean> {
    const result = await this.read(resourceType, id);
    return result.found;
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.resources.clear();
    this.historyStore.clear();
    this.versionCounter = 1;
  }
}