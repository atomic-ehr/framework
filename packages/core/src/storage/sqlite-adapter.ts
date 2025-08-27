import { Database } from 'bun:sqlite';
import StorageAdapter from './adapter.js';
import { randomUUID } from 'crypto';

interface SQLiteConfig {
  database?: string;
}

interface ResourceRow {
  data: string;
}

interface HistoryRow {
  data: string;
  version_id: string;
  last_updated: string;
  operation: string;
}

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

class SQLiteAdapter extends StorageAdapter {
  private db: Database;

  constructor(config: SQLiteConfig = {}) {
    super();
    this.db = new Database(config.database || ':memory:');
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create main resources table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        data TEXT NOT NULL,
        version_id TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        deleted INTEGER DEFAULT 0
      )
    `);

    // Create history table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS resource_history (
        id TEXT,
        resource_type TEXT NOT NULL,
        version_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        operation TEXT NOT NULL
      )
    `);

    // Create indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_resources_updated ON resources(last_updated)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_history_id ON resource_history(id)`);
  }

  async create(resourceType: string, resource: any): Promise<any> {
    const id = resource.id || randomUUID();
    const versionId = randomUUID();
    const lastUpdated = new Date().toISOString();
    
    const fullResource = {
      ...resource,
      id,
      resourceType,
      meta: {
        ...resource.meta,
        versionId,
        lastUpdated
      }
    };

    const stmt = this.db.prepare(`
      INSERT INTO resources (id, resource_type, data, version_id, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, resourceType, JSON.stringify(fullResource), versionId, lastUpdated);

    // Add to history
    const histStmt = this.db.prepare(`
      INSERT INTO resource_history (id, resource_type, version_id, data, last_updated, operation)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    histStmt.run(id, resourceType, versionId, JSON.stringify(fullResource), lastUpdated, 'create');

    return fullResource;
  }

  async read(resourceType: string, id: string): Promise<any | null> {
    const stmt = this.db.prepare(`
      SELECT data FROM resources 
      WHERE resource_type = ? AND id = ? AND deleted = 0
    `);
    
    const row = stmt.get(resourceType, id) as ResourceRow | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  async update(resourceType: string, id: string, resource: any): Promise<any> {
    const existing = await this.read(resourceType, id);
    if (!existing) {
      throw new Error('Resource not found');
    }

    const versionId = randomUUID();
    const lastUpdated = new Date().toISOString();
    
    const fullResource = {
      ...resource,
      id,
      resourceType,
      meta: {
        ...resource.meta,
        versionId,
        lastUpdated
      }
    };

    const stmt = this.db.prepare(`
      UPDATE resources 
      SET data = ?, version_id = ?, last_updated = ?
      WHERE resource_type = ? AND id = ?
    `);
    
    stmt.run(JSON.stringify(fullResource), versionId, lastUpdated, resourceType, id);

    // Add to history
    const histStmt = this.db.prepare(`
      INSERT INTO resource_history (id, resource_type, version_id, data, last_updated, operation)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    histStmt.run(id, resourceType, versionId, JSON.stringify(fullResource), lastUpdated, 'update');

    return fullResource;
  }

  async delete(resourceType: string, id: string): Promise<boolean> {
    const existing = await this.read(resourceType, id);
    if (!existing) {
      throw new Error('Resource not found');
    }

    const versionId = randomUUID();
    const lastUpdated = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE resources 
      SET deleted = 1, version_id = ?, last_updated = ?
      WHERE resource_type = ? AND id = ?
    `);
    
    stmt.run(versionId, lastUpdated, resourceType, id);

    // Add to history
    const histStmt = this.db.prepare(`
      INSERT INTO resource_history (id, resource_type, version_id, data, last_updated, operation)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    histStmt.run(id, resourceType, versionId, '{}', lastUpdated, 'delete');

    return true;
  }

  async search(resourceType: string, params: Record<string, any> = {}): Promise<any[]> {
    // Basic search implementation
    let query = `SELECT data FROM resources WHERE resource_type = ? AND deleted = 0`;
    const values: any[] = [resourceType];

    // Handle _count parameter
    const limit = params._count ? parseInt(params._count) : 100;
    query += ` LIMIT ?`;
    values.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as ResourceRow[];
    
    return rows.map(row => JSON.parse(row.data));
  }

  async history(resourceType: string, id: string, _options: HistoryOptions = {}): Promise<any[]> {
    const stmt = this.db.prepare(`
      SELECT data, version_id, last_updated, operation 
      FROM resource_history 
      WHERE resource_type = ? AND id = ?
      ORDER BY last_updated DESC
    `);
    
    const rows = stmt.all(resourceType, id) as HistoryRow[];
    
    return rows.map(row => ({
      resource: JSON.parse(row.data),
      versionId: row.version_id,
      lastUpdated: row.last_updated,
      operation: row.operation
    }));
  }

  async transaction(bundle: TransactionBundle): Promise<any> {
    // Simple transaction implementation
    const results: any[] = [];
    
    for (const entry of bundle.entry || []) {
      const { method, url } = entry.request;
      const resource = entry.resource;
      const [resourceType, id] = url.split('/');
      
      let result: any;
      switch (method) {
        case 'POST':
          result = await this.create(resourceType, resource);
          break;
        case 'PUT':
          result = await this.update(resourceType, id, resource);
          break;
        case 'DELETE':
          await this.delete(resourceType, id);
          result = { status: 204 };
          break;
        case 'GET':
          result = await this.read(resourceType, id);
          break;
        default:
          throw new Error(`Unsupported transaction method: ${method}`);
      }
      
      results.push({
        response: {
          status: result.status || '200',
          location: result.id ? `${resourceType}/${result.id}` : undefined
        },
        resource: result
      });
    }
    
    return {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: results
    };
  }

  close(): void {
    this.db.close();
  }
}

export default SQLiteAdapter;