import { Database } from 'bun:sqlite';
import { StorageAdapter } from './adapter.js';
import { randomUUID } from 'crypto';

export class SQLiteAdapter extends StorageAdapter {
  constructor(config = {}) {
    super();
    this.db = new Database(config.database || ':memory:');
    this.initializeSchema();
  }

  initializeSchema() {
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

  async create(resourceType, resource) {
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

  async read(resourceType, id) {
    const stmt = this.db.prepare(`
      SELECT data FROM resources 
      WHERE resource_type = ? AND id = ? AND deleted = 0
    `);
    
    const row = stmt.get(resourceType, id);
    return row ? JSON.parse(row.data) : null;
  }

  async update(resourceType, id, resource) {
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

  async delete(resourceType, id) {
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

  async search(resourceType, params = {}) {
    // Basic search implementation
    let query = `SELECT data FROM resources WHERE resource_type = ? AND deleted = 0`;
    const values = [resourceType];

    // Handle _count parameter
    const limit = params._count ? parseInt(params._count) : 100;
    query += ` LIMIT ?`;
    values.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values);
    
    return rows.map(row => JSON.parse(row.data));
  }

  async history(resourceType, id, options = {}) {
    const stmt = this.db.prepare(`
      SELECT data, version_id, last_updated, operation 
      FROM resource_history 
      WHERE resource_type = ? AND id = ?
      ORDER BY last_updated DESC
    `);
    
    const rows = stmt.all(resourceType, id);
    
    return rows.map(row => ({
      resource: JSON.parse(row.data),
      versionId: row.version_id,
      lastUpdated: row.last_updated,
      operation: row.operation
    }));
  }

  async transaction(bundle) {
    // Simple transaction implementation
    const results = [];
    
    for (const entry of bundle.entry || []) {
      const { method, url, resource } = entry.request;
      const [resourceType, id] = url.split('/');
      
      let result;
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

  close() {
    this.db.close();
  }
}