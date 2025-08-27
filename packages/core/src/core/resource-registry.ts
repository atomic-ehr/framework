import type { ResourceDefinition } from '../types/index.js';

export class ResourceRegistry {
  private resources: Map<string, ResourceDefinition>;

  constructor() {
    this.resources = new Map();
  }

  register(resourceType: string, definition: ResourceDefinition): void {
    this.resources.set(resourceType, definition);
  }

  get(resourceType: string): ResourceDefinition | undefined {
    return this.resources.get(resourceType);
  }

  getAll(): [string, ResourceDefinition][] {
    return Array.from(this.resources.entries());
  }

  has(resourceType: string): boolean {
    return this.resources.has(resourceType);
  }
}