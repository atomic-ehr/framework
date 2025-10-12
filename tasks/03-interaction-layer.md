# Phase 3: Interaction Layer & Capability Sync

**Timeline**: Week 2-3
**Goal**: Implement `@atomic-ehr/interactions` and sync capabilities with runtime state.

## Overview

The interactions layer is the contract boundary between HTTP concerns and pure services. It consumes canonical bundles from the provisioning pipeline and materializes concrete FHIR REST interactions (read, vread, update, delete, history, search, transaction, operations).

## Package Structure

```
packages/interactions/
├── src/
│   ├── graph/
│   │   ├── interaction-graph.ts       # Core graph structure
│   │   ├── builder.ts                 # Build graph from bundle
│   │   └── registry.ts                # Dynamic endpoint registry
│   ├── handlers/
│   │   ├── read.ts                    # GET [base]/[type]/[id]
│   │   ├── vread.ts                   # GET [base]/[type]/[id]/_history/[vid]
│   │   ├── update.ts                  # PUT [base]/[type]/[id]
│   │   ├── delete.ts                  # DELETE [base]/[type]/[id]
│   │   ├── create.ts                  # POST [base]/[type]
│   │   ├── search.ts                  # GET [base]/[type]
│   │   ├── history.ts                 # GET [base]/[type]/_history
│   │   ├── transaction.ts             # POST [base] (Bundle.type=transaction)
│   │   ├── batch.ts                   # POST [base] (Bundle.type=batch)
│   │   └── operations.ts              # POST [base]/$operation
│   ├── conditional/
│   │   ├── create.ts                  # Conditional create (If-None-Exist)
│   │   ├── update.ts                  # Conditional update
│   │   └── delete.ts                  # Conditional delete
│   ├── capability/
│   │   ├── generator.ts               # Generate CapabilityStatement
│   │   ├── publisher.ts               # Publish to $metadata endpoint
│   │   └── conformance.ts             # Conformance bundle
│   ├── outcome/
│   │   ├── normalizer.ts              # Normalize OperationOutcome
│   │   └── errors.ts                  # Error mapping
│   ├── watcher.ts                     # Watch canonical updates
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Tasks

### 1. Create Package Scaffolding

Set up the basic package structure.

**Acceptance Criteria**:
- [ ] Package created at `packages/interactions/`
- [ ] `package.json` configured with workspace dependencies
- [ ] `tsconfig.json` extends base config
- [ ] `tsup.config.ts` configured
- [ ] Directory structure created

### 2. Implement Interaction Graph Builder

Build the interaction graph from canonical bundle.

**Implementation**:
```typescript
// packages/interactions/src/graph/interaction-graph.ts
export interface InteractionGraph {
  resources: ResourceNode[];
  operations: OperationNode[];
  capability: CapabilityStatement;
  searchParameters: RegisteredSearchParameter[];
  metadata: {
    generatedAt: string;
    packageIds: string[];
  };
}

export interface ResourceNode {
  resourceType: string;
  profiles: string[];
  interactions: InteractionType[];
  searchParams: string[];
  operations: string[];
}

export type InteractionType =
  | 'read'
  | 'vread'
  | 'update'
  | 'patch'
  | 'delete'
  | 'history-instance'
  | 'history-type'
  | 'create'
  | 'search-type';

// packages/interactions/src/graph/builder.ts
export async function buildInteractionGraph(
  bundle: CanonicalBundle,
  config?: InteractionConfig
): Promise<InteractionGraph> {
  const resources: ResourceNode[] = [];

  // Build resource nodes from structure definitions
  for (const sd of bundle.structureDefinitions) {
    if (sd.kind !== 'resource') continue;

    const node: ResourceNode = {
      resourceType: sd.type,
      profiles: [sd.url],
      interactions: determineInteractions(sd, config),
      searchParams: getSearchParameters(sd, bundle.searchParameters),
      operations: getOperations(sd, bundle)
    };

    resources.push(node);
  }

  // Generate capability statement
  const capability = await generateCapabilityStatement(resources, bundle);

  // Register search parameters
  const searchParameters = await registerSearchParameters(
    bundle.searchParameters,
    resources
  );

  return {
    resources,
    operations: [],
    capability,
    searchParameters,
    metadata: {
      generatedAt: new Date().toISOString(),
      packageIds: [bundle.packageId]
    }
  };
}

function determineInteractions(
  sd: StructureDefinition,
  config?: InteractionConfig
): InteractionType[] {
  // Default: all CRUD operations
  const defaults: InteractionType[] = [
    'read',
    'vread',
    'update',
    'delete',
    'history-instance',
    'history-type',
    'create',
    'search-type'
  ];

  // Apply config overrides
  if (config?.resources?.[sd.type]) {
    return config.resources[sd.type].interactions || defaults;
  }

  return defaults;
}
```

**Acceptance Criteria**:
- [ ] Graph builder processes canonical bundles
- [ ] Creates resource nodes for all resource types
- [ ] Determines available interactions per resource
- [ ] Maps search parameters to resources
- [ ] Tests verify graph structure

### 3. Implement CRUD Interaction Handlers

Create handlers for read/vread/update/delete/create/search/history.

**Read Handler**:
```typescript
// packages/interactions/src/handlers/read.ts
export async function handleRead(
  context: HandlerContext
): Promise<HandlerResponse> {
  const { resourceType, id } = context.params;
  const { repository, logger } = context.services;

  logger.info('Read interaction', { resourceType, id });

  try {
    const resource = await repository.read(resourceType, id);

    if (!resource) {
      return {
        statusCode: 404,
        body: createOperationOutcome('error', 'not-found', `Resource ${resourceType}/${id} not found`)
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/fhir+json',
        'ETag': `W/"${resource.meta.versionId}"`,
        'Last-Modified': resource.meta.lastUpdated
      },
      body: resource
    };
  } catch (error) {
    logger.error('Read failed', { resourceType, id, error });
    return handleError(error);
  }
}
```

**Update Handler**:
```typescript
// packages/interactions/src/handlers/update.ts
export async function handleUpdate(
  context: HandlerContext
): Promise<HandlerResponse> {
  const { resourceType, id } = context.params;
  const { repository, validator, logger } = context.services;
  const resource = context.body;

  logger.info('Update interaction', { resourceType, id });

  // Validate resource type matches
  if (resource.resourceType !== resourceType) {
    return {
      statusCode: 400,
      body: createOperationOutcome('error', 'invalid', 'Resource type mismatch')
    };
  }

  // Validate resource
  const validationResult = await validator.validate({ resource });
  if (!validationResult.ok) {
    return {
      statusCode: 400,
      body: validationResult.outcome
    };
  }

  // Update resource
  try {
    const updated = await repository.update({ ...resource, id });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/fhir+json',
        'ETag': `W/"${updated.meta.versionId}"`,
        'Last-Modified': updated.meta.lastUpdated
      },
      body: updated
    };
  } catch (error) {
    logger.error('Update failed', { resourceType, id, error });
    return handleError(error);
  }
}
```

**Search Handler**:
```typescript
// packages/interactions/src/handlers/search.ts
export async function handleSearch(
  context: HandlerContext
): Promise<HandlerResponse> {
  const { resourceType } = context.params;
  const { repository, logger } = context.services;
  const query = context.query;

  logger.info('Search interaction', { resourceType, query });

  try {
    const result = await repository.search({
      resourceType,
      parameters: query
    });

    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: result.total,
      entry: result.resources.map(resource => ({
        fullUrl: `${context.baseUrl}/${resource.resourceType}/${resource.id}`,
        resource
      })),
      link: buildPaginationLinks(context, result)
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/fhir+json' },
      body: bundle
    };
  } catch (error) {
    logger.error('Search failed', { resourceType, error });
    return handleError(error);
  }
}
```

**Acceptance Criteria**:
- [ ] All CRUD handlers implemented
- [ ] Handlers use services from context
- [ ] Proper HTTP status codes returned
- [ ] Headers set correctly (ETag, Last-Modified)
- [ ] Error handling in place
- [ ] Tests for all handlers

### 4. Support Conditional Operations

Implement conditional create/update/delete.

**Conditional Create**:
```typescript
// packages/interactions/src/conditional/create.ts
export async function handleConditionalCreate(
  context: HandlerContext
): Promise<HandlerResponse> {
  const { resourceType } = context.params;
  const { repository } = context.services;
  const resource = context.body;
  const ifNoneExist = context.headers['if-none-exist'];

  if (!ifNoneExist) {
    return handleCreate(context);
  }

  // Parse search parameters
  const searchParams = parseSearchParams(ifNoneExist);

  // Search for existing resource
  const result = await repository.search({
    resourceType,
    parameters: searchParams
  });

  if (result.total === 0) {
    // No match, create new
    return handleCreate(context);
  } else if (result.total === 1) {
    // Single match, return existing
    return {
      statusCode: 200,
      body: result.resources[0]
    };
  } else {
    // Multiple matches, error
    return {
      statusCode: 412,
      body: createOperationOutcome('error', 'multiple-matches', 'Multiple resources match search criteria')
    };
  }
}
```

**Acceptance Criteria**:
- [ ] Conditional create with If-None-Exist
- [ ] Conditional update with search criteria
- [ ] Conditional delete (single and multiple)
- [ ] Proper error handling for precondition failures
- [ ] Tests for all conditional operations

### 5. Implement Transaction and Batch Processing

Support Bundle-based transactions and batches.

**Transaction Handler**:
```typescript
// packages/interactions/src/handlers/transaction.ts
export async function handleTransaction(
  context: HandlerContext
): Promise<HandlerResponse> {
  const bundle: Bundle = context.body;
  const { repository, logger } = context.services;

  if (bundle.type !== 'transaction') {
    return {
      statusCode: 400,
      body: createOperationOutcome('error', 'invalid', 'Bundle type must be transaction')
    };
  }

  logger.info('Transaction', { entries: bundle.entry?.length });

  try {
    // Start transaction
    await repository.beginTransaction();

    const responseEntries: BundleEntry[] = [];

    for (const entry of bundle.entry || []) {
      const result = await processEntry(entry, context);
      responseEntries.push(result);
    }

    // Commit transaction
    await repository.commitTransaction();

    return {
      statusCode: 200,
      body: {
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: responseEntries
      }
    };
  } catch (error) {
    // Rollback on error
    await repository.rollbackTransaction();
    logger.error('Transaction failed', { error });
    return handleError(error);
  }
}
```

**Acceptance Criteria**:
- [ ] Transaction processing with atomicity
- [ ] Batch processing without atomicity
- [ ] Entry processing for all interaction types
- [ ] Rollback on transaction failure
- [ ] Response bundle generation
- [ ] Tests for transactions and batches

### 6. Generate and Publish CapabilityStatement

Create live capability statement reflecting the interaction graph.

**Implementation**:
```typescript
// packages/interactions/src/capability/generator.ts
export async function generateCapabilityStatement(
  resources: ResourceNode[],
  bundle: CanonicalBundle
): Promise<CapabilityStatement> {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    software: {
      name: 'Atomic FHIR Server',
      version: '1.0.0'
    },
    implementation: {
      description: 'Atomic FHIR Server'
    },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'application/fhir+xml'],
    rest: [
      {
        mode: 'server',
        resource: resources.map(node => ({
          type: node.resourceType,
          profile: node.profiles[0],
          supportedProfile: node.profiles,
          interaction: node.interactions.map(code => ({ code })),
          searchParam: node.searchParams.map(code => ({
            name: code,
            type: getSearchParamType(code, bundle.searchParameters)
          }))
        }))
      }
    ]
  };
}

// packages/interactions/src/capability/publisher.ts
export function publishCapability(
  server: FhirServer,
  capability: CapabilityStatement
): void {
  server.addRoute({
    method: 'GET',
    pattern: '/metadata',
    async handler(context) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: capability
      };
    }
  });
}
```

**Acceptance Criteria**:
- [ ] Capability statement generated from graph
- [ ] Includes all resources and interactions
- [ ] Includes search parameters
- [ ] Published to `/metadata` endpoint
- [ ] Tests verify capability accuracy

### 7. Normalize OperationOutcome Responses

Centralize error handling and OperationOutcome creation.

**Implementation**:
```typescript
// packages/interactions/src/outcome/normalizer.ts
export function createOperationOutcome(
  severity: 'fatal' | 'error' | 'warning' | 'information',
  code: string,
  diagnostics: string,
  details?: CodeableConcept
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity,
        code,
        diagnostics,
        details
      }
    ]
  };
}

// packages/interactions/src/outcome/errors.ts
export function handleError(error: Error): HandlerResponse {
  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      body: createOperationOutcome('error', 'invalid', error.message)
    };
  }

  if (error instanceof NotFoundError) {
    return {
      statusCode: 404,
      body: createOperationOutcome('error', 'not-found', error.message)
    };
  }

  // Generic error
  return {
    statusCode: 500,
    body: createOperationOutcome('error', 'exception', 'Internal server error')
  };
}
```

**Acceptance Criteria**:
- [ ] OperationOutcome normalizer implemented
- [ ] Error mapping for common errors
- [ ] Consistent error responses across handlers
- [ ] Tests verify error handling

### 8. Wire Canonical Watcher

Rebuild interaction graph on canonical changes.

**Implementation**:
```typescript
// packages/interactions/src/watcher.ts
export function watchCanonicalUpdates(
  canonicals: CanonicalManager,
  onUpdate: (graph: InteractionGraph) => Promise<void>
): () => void {
  return canonicals.watch(async (snapshot) => {
    // Rebuild bundle
    const bundle = await canonicals.resolveBundle(snapshot.capabilityUrl);

    // Rebuild interaction graph
    const graph = await buildInteractionGraph(bundle);

    // Notify
    await onUpdate(graph);
  });
}
```

**Acceptance Criteria**:
- [ ] Watcher listens for canonical updates
- [ ] Rebuilds interaction graph on changes
- [ ] Notifies server layer
- [ ] Tests verify hot reload

### 9. Provide Test Harness

Test with fixture packages to assert routes and capability.

**Test Structure**:
```typescript
// packages/interactions/test/graph.test.ts
describe('Interaction Graph', () => {
  test('should build graph from bundle', async () => {
    const bundle = await loadFixture('hl7.fhir.r4.core');
    const graph = await buildInteractionGraph(bundle);

    expect(graph.resources).toContainEqual(
      expect.objectContaining({ resourceType: 'Patient' })
    );
  });

  test('should generate capability statement', async () => {
    const bundle = await loadFixture('hl7.fhir.r4.core');
    const graph = await buildInteractionGraph(bundle);

    expect(graph.capability.rest[0].resource).toContainEqual(
      expect.objectContaining({ type: 'Patient' })
    );
  });
});

// packages/interactions/test/handlers.test.ts
describe('Interaction Handlers', () => {
  test('read should return resource', async () => {
    const context = createMockContext({ resourceType: 'Patient', id: '123' });
    const response = await handleRead(context);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('resourceType', 'Patient');
  });

  test('search should return bundle', async () => {
    const context = createMockContext({ resourceType: 'Patient' });
    const response = await handleSearch(context);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('resourceType', 'Bundle');
    expect(response.body.type).toBe('searchset');
  });
});
```

**Acceptance Criteria**:
- [ ] Test harness with fixture packages
- [ ] Tests for all interaction types
- [ ] Tests verify capability diff
- [ ] OperationOutcome contract tests
- [ ] Full test coverage

## Deliverables

- ✅ `@atomic-ehr/interactions` package published
- ✅ Interaction graph registration API
- ✅ Capability artifacts generated on boot and reload
- ✅ OperationOutcome contract tests

## Dependencies

- Phase 1: Service adapters
- Phase 2: Canonical provisioning pipeline
- `@atomic-ehr/core` interfaces

## Integration Points

- Server layer (Phase 4) registers interaction graph
- Repository services execute operations
- Validator services validate resources
- Canonical manager triggers updates

## Success Metrics

- [ ] Interaction graph materializes all FHIR REST operations
- [ ] Capability statement accurately reflects available interactions
- [ ] Conditional operations work correctly
- [ ] Transaction/batch processing functional
- [ ] OperationOutcome normalized across all errors
- [ ] Hot reload path verified
- [ ] Ready for Phase 4 integration

---

**Status**: Not Started
**Previous Phase**: [02-canonical-provisioning.md](./02-canonical-provisioning.md)
**Next Phase**: [04-server-integration.md](./04-server-integration.md)
