import type { OperationDefinition } from '../types/index.js';

export class OperationRegistry {
  private operations: Map<string, OperationDefinition>;

  constructor() {
    this.operations = new Map();
  }

  register(operation: OperationDefinition): void {
    const key = this.getKey(operation.resource, operation.name, operation.type || operation.instance || operation.system);
    this.operations.set(key, operation);
  }

  get(resource: string | string[] | null, name: string, type: boolean | undefined): OperationDefinition | undefined {
    const key = this.getKey(resource, name, type);
    return this.operations.get(key);
  }

  private getKey(resource: string | string[] | null | undefined, name: string, type: boolean | undefined): string {
    const resourceStr = Array.isArray(resource) ? resource.join(',') : (resource || 'system');
    const typeStr = type ? 'true' : 'false';
    return `${typeStr}:${resourceStr}:${name}`;
  }

  getAll(): OperationDefinition[] {
    return Array.from(this.operations.values());
  }
}