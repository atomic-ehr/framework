export class OperationRegistry {
  constructor() {
    this.operations = new Map();
  }

  register(operation) {
    const key = this.getKey(operation.resource, operation.name, operation.type);
    this.operations.set(key, operation);
  }

  get(resource, name, type) {
    const key = this.getKey(resource, name, type);
    return this.operations.get(key);
  }

  getKey(resource, name, type) {
    return `${type}:${resource || 'system'}:${name}`;
  }

  getAll() {
    return Array.from(this.operations.values());
  }
}