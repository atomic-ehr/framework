import type { StorageConfig } from '../types/index.js';

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

abstract class StorageAdapter {
  protected config: StorageConfig;

  constructor(config: StorageConfig = {}) {
    this.config = config;
  }

  abstract create(resourceType: string, resource: any): Promise<any>;
  abstract read(resourceType: string, id: string): Promise<any | null>;
  abstract update(resourceType: string, id: string, resource: any): Promise<any>;
  abstract delete(resourceType: string, id: string): Promise<boolean>;
  abstract search(resourceType: string, params: Record<string, any>): Promise<any[]>;
  abstract history(resourceType: string, id: string, options?: HistoryOptions): Promise<any[]>;
  abstract transaction(bundle: TransactionBundle): Promise<any>;
}

export default StorageAdapter;