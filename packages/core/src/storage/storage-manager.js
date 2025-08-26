import SQLiteAdapter from './sqlite-adapter.js';

class StorageManager {
  constructor(config = {}) {
    this.config = config;
    this.adapter = this.createAdapter();
  }

  createAdapter() {
    switch (this.config.adapter) {
      case 'sqlite':
        return new SQLiteAdapter(this.config.config || {});
      // Future adapters: postgres, mongodb, etc.
      default:
        return new SQLiteAdapter(this.config.config || {});
    }
  }

  async create(resourceType, resource) {
    return await this.adapter.create(resourceType, resource);
  }

  async read(resourceType, id) {
    return await this.adapter.read(resourceType, id);
  }

  async update(resourceType, id, resource) {
    return await this.adapter.update(resourceType, id, resource);
  }

  async delete(resourceType, id) {
    return await this.adapter.delete(resourceType, id);
  }

  async search(resourceType, params) {
    return await this.adapter.search(resourceType, params);
  }

  async history(resourceType, id, options) {
    return await this.adapter.history(resourceType, id, options);
  }

  async transaction(bundle) {
    return await this.adapter.transaction(bundle);
  }
}

export default StorageManager;
