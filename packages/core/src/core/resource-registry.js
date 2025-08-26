export class ResourceRegistry {
  constructor() {
    this.resources = new Map();
  }

  register(resourceType, definition) {
    this.resources.set(resourceType, definition);
  }

  get(resourceType) {
    return this.resources.get(resourceType);
  }

  getAll() {
    return Array.from(this.resources.entries());
  }

  has(resourceType) {
    return this.resources.has(resourceType);
  }
}