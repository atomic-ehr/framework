# Phase 5: Search Semantics & Observability

**Timeline**: Week 3-4
**Goal**: Codify search behaviour and operational visibility.

## Overview

This phase implements comprehensive FHIR search capabilities and adds observability features for production deployments. It defines supported search parameters, implements advanced search features, and exposes health/metrics endpoints.

## Search Feature Matrix

| Feature | Status | Priority |
|---------|--------|----------|
| Basic search parameters | To implement | High |
| Chaining (_.) | To implement | High |
| Reverse chaining (_has) | To implement | Medium |
| Include (_include) | To implement | High |
| Reverse include (_revinclude) | To implement | High |
| Summary (_summary) | To implement | Medium |
| Count (_count) | To implement | High |
| Pagination (page/offset) | To implement | High |
| Sorting (_sort) | To implement | Medium |
| Total modes (none/accurate/estimate) | To implement | Medium |

## Tasks

### 1. Define Supported Search Parameter Matrix

Document which search features are supported.

**Implementation**:
```typescript
// packages/interactions/src/search/features.ts
export interface SearchFeatureMatrix {
  basicParameters: boolean;          // name=John
  chaining: boolean;                 // subject.name=John
  reverseChaining: boolean;          // _has:Observation:subject:code=http://...
  include: boolean;                  // _include=Patient:organization
  revInclude: boolean;               // _revinclude=Observation:subject
  summary: boolean;                  // _summary=true|text|data|count
  count: boolean;                    // _count=10
  pagination: boolean;               // page=2 or offset=10
  sorting: boolean;                  // _sort=name,-birthdate
  totalModes: boolean;               // _total=none|accurate|estimate
}

export const supportedFeatures: SearchFeatureMatrix = {
  basicParameters: true,
  chaining: true,
  reverseChaining: true,
  include: true,
  revInclude: true,
  summary: true,
  count: true,
  pagination: true,
  sorting: true,
  totalModes: true
};
```

**Acceptance Criteria**:
- [ ] Feature matrix documented
- [ ] Supported features clearly marked
- [ ] Future features identified
- [ ] Tests verify feature availability

### 2. Implement Search Registry

Map search parameters to repository index strategies.

**Implementation**:
```typescript
// packages/interactions/src/search/registry.ts
export interface SearchStrategy {
  parameterCode: string;
  type: 'string' | 'token' | 'reference' | 'date' | 'number' | 'quantity';
  expression: string; // FHIRPath
  indexType: 'btree' | 'gin' | 'gist' | 'hash';
  extractValue: (resource: any) => any[];
  buildQuery: (value: string) => QueryClause;
}

export class SearchRegistry {
  private strategies: Map<string, Map<string, SearchStrategy>> = new Map();

  register(
    resourceType: string,
    parameter: SearchParameter
  ): void {
    if (!this.strategies.has(resourceType)) {
      this.strategies.set(resourceType, new Map());
    }

    const strategy: SearchStrategy = {
      parameterCode: parameter.code,
      type: parameter.type,
      expression: parameter.expression,
      indexType: this.determineIndexType(parameter),
      extractValue: this.createExtractor(parameter),
      buildQuery: this.createQueryBuilder(parameter)
    };

    this.strategies.get(resourceType)!.set(parameter.code, strategy);
  }

  getStrategy(resourceType: string, code: string): SearchStrategy | undefined {
    return this.strategies.get(resourceType)?.get(code);
  }

  private determineIndexType(param: SearchParameter): 'btree' | 'gin' | 'gist' | 'hash' {
    switch (param.type) {
      case 'string':
        return 'gin'; // Full-text search
      case 'token':
        return 'hash'; // Exact match
      case 'date':
      case 'number':
        return 'btree'; // Range queries
      case 'reference':
        return 'btree'; // FK lookups
      default:
        return 'btree';
    }
  }

  private createExtractor(param: SearchParameter): (resource: any) => any[] {
    return (resource) => {
      // Use FHIRPath to extract values
      return evaluate(param.expression, { input: resource });
    };
  }

  private createQueryBuilder(param: SearchParameter): (value: string) => QueryClause {
    return (value) => {
      switch (param.type) {
        case 'string':
          return { field: param.code, operator: 'contains', value };
        case 'token':
          return { field: param.code, operator: 'eq', value };
        case 'date':
          return this.buildDateQuery(param.code, value);
        case 'reference':
          return this.buildReferenceQuery(param.code, value);
        default:
          return { field: param.code, operator: 'eq', value };
      }
    };
  }
}
```

**Acceptance Criteria**:
- [ ] Search registry maps all parameter types
- [ ] Index strategies determined automatically
- [ ] Value extraction via FHIRPath
- [ ] Query builders for all types
- [ ] Tests verify strategy creation

### 3. Implement Advanced Search Features

Add chaining, include, revinclude, etc.

**Chaining**:
```typescript
// packages/interactions/src/search/chaining.ts
export function parseChainedSearch(
  parameter: string,
  value: string
): ChainedSearch {
  // Example: subject.name=John
  const parts = parameter.split('.');

  return {
    baseParam: parts[0],          // subject
    chain: parts.slice(1),         // [name]
    value                          // John
  };
}

export async function executeChainedSearch(
  repository: Repository,
  resourceType: string,
  chain: ChainedSearch
): Promise<any[]> {
  // 1. Find the target resource type from base parameter
  const targetType = getTargetType(resourceType, chain.baseParam);

  // 2. Search target resources
  const targetResources = await repository.search({
    resourceType: targetType,
    parameters: { [chain.chain.join('.')]: chain.value }
  });

  // 3. Extract IDs
  const targetIds = targetResources.resources.map(r => `${targetType}/${r.id}`);

  // 4. Search base resources referencing targets
  return repository.search({
    resourceType,
    parameters: { [chain.baseParam]: targetIds.join(',') }
  });
}
```

**Include**:
```typescript
// packages/interactions/src/search/include.ts
export async function processIncludes(
  repository: Repository,
  results: SearchResult,
  includes: string[]
): Promise<Resource[]> {
  const included: Resource[] = [];

  for (const include of includes) {
    // Parse: _include=Patient:organization
    const [resourceType, paramCode, targetType] = include.split(':');

    for (const resource of results.resources) {
      if (resource.resourceType !== resourceType) continue;

      // Extract reference values
      const references = extractReferences(resource, paramCode);

      // Fetch referenced resources
      for (const ref of references) {
        const [type, id] = ref.split('/');
        if (targetType && type !== targetType) continue;

        const referenced = await repository.read(type, id);
        if (referenced) {
          included.push(referenced);
        }
      }
    }
  }

  return included;
}
```

**Reverse Include**:
```typescript
// packages/interactions/src/search/revinclude.ts
export async function processRevIncludes(
  repository: Repository,
  results: SearchResult,
  revIncludes: string[]
): Promise<Resource[]> {
  const included: Resource[] = [];

  for (const revInclude of revIncludes) {
    // Parse: _revinclude=Observation:subject
    const [resourceType, paramCode] = revInclude.split(':');

    // Find all resources that reference the results
    for (const resource of results.resources) {
      const references = await repository.search({
        resourceType,
        parameters: {
          [paramCode]: `${resource.resourceType}/${resource.id}`
        }
      });

      included.push(...references.resources);
    }
  }

  return included;
}
```

**Acceptance Criteria**:
- [ ] Chaining implemented and tested
- [ ] Include implemented and tested
- [ ] Reverse include implemented and tested
- [ ] Reverse chaining (_has) implemented
- [ ] Summary modes implemented
- [ ] Tests cover all features

### 4. Provide Pagination, Sorting, and Total Modes

Implement pagination links and sorting.

**Pagination**:
```typescript
// packages/interactions/src/search/pagination.ts
export function buildPaginationLinks(
  context: HandlerContext,
  result: SearchResult
): BundleLink[] {
  const { baseUrl, url, query } = context;
  const count = parseInt(query._count || '20');
  const offset = parseInt(query.offset || '0');

  const links: BundleLink[] = [
    { relation: 'self', url }
  ];

  // Previous page
  if (offset > 0) {
    const prevOffset = Math.max(0, offset - count);
    links.push({
      relation: 'previous',
      url: buildUrl(baseUrl, query, { offset: prevOffset })
    });
  }

  // Next page
  if (offset + count < result.total) {
    const nextOffset = offset + count;
    links.push({
      relation: 'next',
      url: buildUrl(baseUrl, query, { offset: nextOffset })
    });
  }

  // First page
  links.push({
    relation: 'first',
    url: buildUrl(baseUrl, query, { offset: 0 })
  });

  // Last page
  const lastOffset = Math.floor(result.total / count) * count;
  links.push({
    relation: 'last',
    url: buildUrl(baseUrl, query, { offset: lastOffset })
  });

  return links;
}
```

**Sorting**:
```typescript
// packages/interactions/src/search/sorting.ts
export function parseSortParameters(sort?: string): SortClause[] {
  if (!sort) return [];

  return sort.split(',').map(param => {
    const descending = param.startsWith('-');
    const field = descending ? param.slice(1) : param;

    return {
      field,
      direction: descending ? 'desc' : 'asc'
    };
  });
}

export function applySorting(
  results: Resource[],
  sort: SortClause[]
): Resource[] {
  return results.sort((a, b) => {
    for (const clause of sort) {
      const aVal = getNestedValue(a, clause.field);
      const bVal = getNestedValue(b, clause.field);

      const comparison = compare(aVal, bVal);
      if (comparison !== 0) {
        return clause.direction === 'desc' ? -comparison : comparison;
      }
    }
    return 0;
  });
}
```

**Total Modes**:
```typescript
// packages/interactions/src/search/total.ts
export async function calculateTotal(
  repository: Repository,
  query: SearchQuery,
  mode: 'none' | 'accurate' | 'estimate'
): Promise<number | undefined> {
  switch (mode) {
    case 'none':
      return undefined;

    case 'accurate':
      return repository.count(query);

    case 'estimate':
      // Use database statistics for estimate
      return repository.estimateCount(query);
  }
}
```

**Acceptance Criteria**:
- [ ] Pagination with prev/next/first/last links
- [ ] Sorting by multiple fields
- [ ] Total modes (none/accurate/estimate)
- [ ] Tests for pagination and sorting

### 5. Add Resource-Specific Search Tests

Create acceptance tests using example packages.

**Test Structure**:
```typescript
// packages/interactions/test/search/patient.test.ts
describe('Patient Search', () => {
  test('search by name', async () => {
    const result = await search('Patient', { name: 'John' });
    expect(result.total).toBeGreaterThan(0);
    expect(result.resources[0].name[0].family).toContain('John');
  });

  test('search with chaining', async () => {
    const result = await search('Observation', { 'subject.name': 'John' });
    expect(result.total).toBeGreaterThan(0);
  });

  test('search with include', async () => {
    const result = await search('Patient', {
      name: 'John',
      _include: 'Patient:organization'
    });

    expect(result.included).toBeDefined();
    expect(result.included.some(r => r.resourceType === 'Organization')).toBe(true);
  });

  test('search with sorting', async () => {
    const result = await search('Patient', { _sort: 'birthDate' });

    const dates = result.resources.map(p => p.birthDate);
    expect(dates).toEqual([...dates].sort());
  });
});
```

**Acceptance Criteria**:
- [ ] Tests for all resource types
- [ ] Tests for all search parameter types
- [ ] Tests for chaining, include, sorting
- [ ] Tests verify pagination
- [ ] Full coverage of search features

### 6. Expose Health Endpoints

Add liveness and readiness endpoints.

**Implementation**:
```typescript
// packages/server/src/health/liveness.ts
export function registerLivenessEndpoint(server: FhirServer): void {
  server.addRoute({
    method: 'GET',
    pattern: '/health/live',
    async handler(context) {
      return {
        statusCode: 200,
        body: {
          status: 'ok',
          timestamp: new Date().toISOString()
        }
      };
    }
  });
}

// packages/server/src/health/readiness.ts
export function registerReadinessEndpoint(server: FhirServer): void {
  server.addRoute({
    method: 'GET',
    pattern: '/health/ready',
    async handler(context) {
      const { services } = context;

      // Check if services are ready
      const checks = {
        canonicals: await checkCanonicals(services.canonicals),
        repository: await checkRepository(services.repository),
        validator: await checkValidator(services.validator)
      };

      const allReady = Object.values(checks).every(c => c.ready);

      return {
        statusCode: allReady ? 200 : 503,
        body: {
          status: allReady ? 'ready' : 'not-ready',
          checks,
          timestamp: new Date().toISOString()
        }
      };
    }
  });
}

async function checkCanonicals(canonicals: CanonicalManager): Promise<HealthCheck> {
  try {
    // Try to resolve a canonical
    await canonicals.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
    return { ready: true };
  } catch (error) {
    return { ready: false, error: error.message };
  }
}
```

**Acceptance Criteria**:
- [ ] Liveness endpoint returns 200
- [ ] Readiness endpoint checks all services
- [ ] Readiness returns 503 if not ready
- [ ] Tests verify health endpoints

### 7. Emit Metrics and Tracing

Add metrics for provisioning, search, and request latency.

**Implementation**:
```typescript
// packages/server/src/metrics/collector.ts
export class MetricsCollector {
  private metrics: Map<string, Metric> = new Map();

  recordCanonicalLoad(duration: number, packageId: string): void {
    this.increment('canonical_loads_total', { package: packageId });
    this.observe('canonical_load_duration_ms', duration, { package: packageId });
  }

  recordSearchExecution(duration: number, resourceType: string, paramCount: number): void {
    this.increment('search_total', { resourceType });
    this.observe('search_duration_ms', duration, { resourceType });
    this.observe('search_param_count', paramCount, { resourceType });
  }

  recordRequest(duration: number, method: string, path: string, statusCode: number): void {
    this.increment('requests_total', { method, path, statusCode });
    this.observe('request_duration_ms', duration, { method, path });
  }

  private increment(name: string, labels: Record<string, any>): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const metric = this.metrics.get(key) || { name, type: 'counter', value: 0, labels };
    metric.value += 1;
    this.metrics.set(key, metric);
  }

  private observe(name: string, value: number, labels: Record<string, any>): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const metric = this.metrics.get(key) || { name, type: 'histogram', values: [], labels };
    metric.values.push(value);
    this.metrics.set(key, metric);
  }

  getMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }
}

// Register metrics endpoint
server.addRoute({
  method: 'GET',
  pattern: '/metrics',
  async handler(context) {
    const metrics = context.metrics.getMetrics();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: formatPrometheus(metrics)
    };
  }
});
```

**Acceptance Criteria**:
- [ ] Metrics collected for canonical loads
- [ ] Metrics collected for search execution
- [ ] Metrics collected for request latency
- [ ] Metrics exposed at /metrics endpoint
- [ ] Prometheus format supported
- [ ] Tests verify metrics collection

### 8. Document Troubleshooting Workflows

Create observability documentation.

**Documentation**:
```markdown
# Observability Guide

## Health Checks

- `GET /health/live` - Liveness probe (always returns 200)
- `GET /health/ready` - Readiness probe (returns 200 when ready, 503 otherwise)

## Metrics

- `GET /metrics` - Prometheus-formatted metrics

Key metrics:
- `canonical_loads_total` - Total package loads
- `canonical_load_duration_ms` - Package load latency
- `search_total` - Total searches
- `search_duration_ms` - Search execution time
- `requests_total` - Total requests
- `request_duration_ms` - Request latency

## Logging

Structured logs include:
- `timestamp` - ISO 8601 timestamp
- `level` - Log level (info/warn/error)
- `message` - Log message
- `requestId` - Unique request identifier
- `resourceType` - FHIR resource type
- `duration` - Operation duration

## Troubleshooting

### Server not starting
1. Check logs for bootstrap errors
2. Verify package downloads succeeded
3. Check database connectivity

### Searches returning no results
1. Check search parameters are registered
2. Verify repository indexes are created
3. Check search parameter extraction

### Slow search performance
1. Check metrics for search_duration_ms
2. Verify indexes are being used
3. Consider adding database indexes
```

**Acceptance Criteria**:
- [ ] Observability guide documented
- [ ] Troubleshooting workflows defined
- [ ] Example queries provided
- [ ] Integration with logging/metrics systems

## Deliverables

- ✅ Search behaviour spec with automated verification
- ✅ Repository adapters honoring search registry
- ✅ Healthz/readiness endpoints wired into presets
- ✅ Metrics hooks exporting canonical load + search timings

## Dependencies

- Phase 3: Interaction layer for search handlers
- Phase 4: Server integration for health endpoints
- `@atomic-ehr/fhirpath` for parameter extraction

## Success Metrics

- [ ] All search features implemented and tested
- [ ] Health endpoints functional
- [ ] Metrics collection working
- [ ] Documentation complete
- [ ] Ready for Phase 6

---

**Status**: Not Started
**Previous Phase**: [04-server-integration.md](./04-server-integration.md)
**Next Phase**: [06-documentation-examples.md](./06-documentation-examples.md)
