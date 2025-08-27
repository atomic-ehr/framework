import SQLiteAdapter from './sqlite-adapter.js';
import type { StorageConfig } from '../types/index.js';
import type StorageAdapter from './adapter.js';

interface HistoryOptions {
  count?: number;
  since?: string;
  at?: string;
}

interface TransactionBundle {
  resourceType: 'Bundle';
  type: 'transaction';
  entry?: Array<{
    request: {
      method: string;
      url: string;
    };
    resource?: any;
  }>;
}

class StorageManager {
  private config: StorageConfig;
  private adapter: StorageAdapter;

  constructor(config: StorageConfig = {}) {
    this.config = config;
    this.adapter = this.createAdapter();
  }

  private createAdapter(): StorageAdapter {
    switch (this.config.adapter) {
      case 'sqlite':
        return new SQLiteAdapter(this.config.config || {});
      // Future adapters: postgres, mongodb, etc.
      default:
        return new SQLiteAdapter(this.config.config || {});
    }
  }

  async create(resourceType: string, resource: any): Promise<any> {
    return await this.adapter.create(resourceType, resource);
  }

  async read(resourceType: string, id: string): Promise<any | null> {
    return await this.adapter.read(resourceType, id);
  }

  async update(resourceType: string, id: string, resource: any): Promise<any> {
    return await this.adapter.update(resourceType, id, resource);
  }

  async delete(resourceType: string, id: string): Promise<boolean> {
    return await this.adapter.delete(resourceType, id);
  }

  async search(resourceType: string, params: Record<string, any>): Promise<any[]> {
    return await this.adapter.search(resourceType, params);
  }

  async history(resourceType: string, id: string, options?: HistoryOptions): Promise<any[]> {
    return await this.adapter.history(resourceType, id, options);
  }

  async transaction(bundle: TransactionBundle): Promise<any> {
    return await this.adapter.transaction(bundle);
  }
}

export default StorageManager;