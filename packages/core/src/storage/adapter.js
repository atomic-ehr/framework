class StorageAdapter {
  async create(resourceType, resource) {
    throw new Error('create method must be implemented');
  }

  async read(resourceType, id) {
    throw new Error('read method must be implemented');
  }

  async update(resourceType, id, resource) {
    throw new Error('update method must be implemented');
  }

  async delete(resourceType, id) {
    throw new Error('delete method must be implemented');
  }

  async search(resourceType, params) {
    throw new Error('search method must be implemented');
  }

  async history(resourceType, id, options) {
    throw new Error('history method must be implemented');
  }

  async transaction(bundle) {
    throw new Error('transaction method must be implemented');
  }
}

export default StorageAdapter;