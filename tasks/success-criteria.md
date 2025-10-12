# Success Criteria & Validation Checklist

This document defines the acceptance criteria for the complete implementation of the new Atomic FHIR Framework architecture.

## Overall Goals

The implementation is successful when:

1. ✅ **Use existing libraries**
2. ✅ **3-line minimal server works**
3. ✅ **Service adapters ready for provisioning**
4. ✅ **Interaction layer auto-configures endpoints**
5. ✅ **Capability artifacts always in sync**
6. ✅ **Provisioning pipeline generates schemas & types**
7. ✅ **Search semantics codified**
8. ✅ **Terminology contract fulfilled**
9. ✅ **Observability built-in**
10. ✅ **Documentation & examples complete**

## Detailed Validation

### 1. Use Existing Libraries ✅

**Criteria**:
- [ ] `@atomic-ehr/fhir-canonical-manager` used for package loading
- [ ] `@atomic-ehr/fhirpath` used for FHIRPath evaluation
- [ ] `@atomic-ehr/fhirschema` used for validation
- [ ] All libraries properly wrapped in service adapters
- [ ] No duplicate functionality implemented

**Validation Steps**:
```bash
# Check imports in services package
grep -r "fhir-canonical-manager" packages/services/src/
grep -r "fhirpath" packages/services/src/
grep -r "fhirschema" packages/services/src/
```

### 2. 3-Line Minimal Server Works ✅

**Criteria**:
```typescript
const server = await createFhirServer({ port: 3000 });
await server.start();
// Server is fully functional
```

**Validation Steps**:
1. Create file with 3-line server
2. Run server: `bun run server.ts`
3. Test metadata endpoint: `curl http://localhost:3000/metadata`
4. Create a Patient: `curl -X POST http://localhost:3000/Patient -d '{...}'`
5. Read the Patient: `curl http://localhost:3000/Patient/[id]`
6. Search Patients: `curl http://localhost:3000/Patient?name=John`

**Expected Results**:
- [ ] Server starts without errors
- [ ] Metadata endpoint returns CapabilityStatement
- [ ] Create operation works
- [ ] Read operation works
- [ ] Search operation works

### 3. Service Adapters Ready for Provisioning ✅

**Criteria**:
- [ ] `@atomic-ehr/services` implements all core interfaces
- [ ] Canonical service emits lifecycle events
- [ ] Terminology service supports $expand/$lookup
- [ ] Validator service uses precompiled schemas
- [ ] Repository services support schema migrations
- [ ] Adapter test suite covers fixture packages

**Validation Steps**:
```typescript
// Test canonical manager
const canonicals = new CanonicalManagerService();
await canonicals.init();
await canonicals.loadPackages(['hl7.fhir.r4.core#4.0.1']);
const patient = await canonicals.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
assert(patient.resourceType === 'StructureDefinition');

// Test watch functionality
const stop = canonicals.watch(async (snapshot) => {
  console.log('Packages changed:', snapshot.packages);
});

// Test validator
const validator = new FhirSchemaValidator();
await validator.init();
const result = await validator.validate({
  resource: { resourceType: 'Patient', id: '123' }
});
assert(result.ok);

// Test repository
const repo = new MemoryRepository();
const created = await repo.create({ resourceType: 'Patient', name: [{ family: 'Doe' }] });
const read = await repo.read('Patient', created.id);
assert(read.id === created.id);
```

### 4. Interaction Layer Auto-Configures Endpoints ✅

**Criteria**:
- [ ] Routes materialize from packages (read/vread/update/delete/history/search/transaction)
- [ ] Conditional interactions supported
- [ ] Custom operations work
- [ ] OperationOutcome normalization used across stack

**Validation Steps**:
```typescript
// Build interaction graph
const bundle = await buildCanonicalBundle('hl7.fhir.r4.core.tgz');
const graph = await buildInteractionGraph(bundle);

// Verify resources
assert(graph.resources.find(r => r.resourceType === 'Patient'));
assert(graph.resources.find(r => r.resourceType === 'Observation'));

// Verify interactions
const patient = graph.resources.find(r => r.resourceType === 'Patient');
assert(patient.interactions.includes('read'));
assert(patient.interactions.includes('create'));
assert(patient.interactions.includes('search-type'));

// Test conditional create
const response = await fetch('http://localhost:3000/Patient', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/fhir+json',
    'If-None-Exist': 'identifier=http://example.org|123'
  },
  body: JSON.stringify({ resourceType: 'Patient', identifier: [{ system: 'http://example.org', value: '123' }] })
});
assert(response.status === 201 || response.status === 200);
```

### 5. Capability Artifacts Always in Sync ✅

**Criteria**:
- [ ] `$metadata` endpoint reflects live interaction graph
- [ ] CapabilityStatement generated on boot and on package change
- [ ] Tests guard against drift between declared and actual interactions
- [ ] Conformance bundles generated

**Validation Steps**:
```bash
# Start server
bun run server.ts

# Get capability statement
curl http://localhost:3000/metadata > capability.json

# Verify it includes all resources
jq '.rest[0].resource[] | .type' capability.json

# Add a package dynamically
# ... trigger hot reload ...

# Get capability statement again
curl http://localhost:3000/metadata > capability2.json

# Verify it's updated
diff capability.json capability2.json
```

### 6. Provisioning Pipeline Generates Schemas & Types ✅

**Criteria**:
- [ ] Repository schema/index plans generated and applied
- [ ] Validator JSON schemas emitted per profile
- [ ] TypeScript declarations generated per profile
- [ ] Hot reload swaps interaction graph without downtime

**Validation Steps**:
```typescript
// Load package
const bundle = await buildCanonicalBundle('hl7.fhir.r4.core.tgz');

// Generate schemas
const schemas = bundle.structureDefinitions.map(sd => generateSchema(sd));
assert(schemas.find(s => s.resourceType === 'Patient'));

// Generate validator artifacts
const artifacts = bundle.structureDefinitions.map(sd => compileValidator(sd));
assert(artifacts.length > 0);
assert(artifacts[0].jsonSchema);
assert(artifacts[0].typeDeclaration);

// Verify TypeScript compiles
const tsFile = `
import { Patient } from './generated/Patient';
const patient: Patient = { resourceType: 'Patient', id: '123' };
`;
// Compile with tsc and verify no errors
```

### 7. Search Semantics Codified ✅

**Criteria**:
- [ ] `_include`, `_revinclude`, chaining, `_has`, `_summary`, `_count`, pagination, and sorting documented and implemented
- [ ] Search registry maps parameters to repository strategies
- [ ] Automated tests cover positive/negative search cases

**Validation Steps**:
```bash
# Basic search
curl "http://localhost:3000/Patient?name=John"

# Chaining
curl "http://localhost:3000/Observation?subject.name=John"

# Include
curl "http://localhost:3000/Patient?_include=Patient:organization"

# Reverse include
curl "http://localhost:3000/Patient?_revinclude=Observation:subject"

# Pagination
curl "http://localhost:3000/Patient?_count=10&offset=20"

# Sorting
curl "http://localhost:3000/Patient?_sort=birthDate"

# Multiple parameters
curl "http://localhost:3000/Patient?name=John&birthdate=gt2000-01-01&_sort=-birthDate&_count=5"
```

### 8. Terminology Contract Fulfilled ✅

**Criteria**:
- [ ] `$expand` and `$lookup` supported via terminology service
- [ ] Version pinning strategies documented
- [ ] Cache refresh strategies documented
- [ ] Failover behaviour validated

**Validation Steps**:
```bash
# Expand value set
curl -X POST "http://localhost:3000/ValueSet/\$expand" \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/administrative-gender"}]}'

# Lookup code
curl -X POST "http://localhost:3000/CodeSystem/\$lookup" \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://hl7.org/fhir/administrative-gender"},{"name":"code","valueCode":"male"}]}'
```

### 9. Observability Built-In ✅

**Criteria**:
- [ ] Healthz/readiness endpoints expose provisioning state
- [ ] Metrics/tracing for canonical load, search performance, and request latency
- [ ] Structured logging emitted during bootstrap and reload

**Validation Steps**:
```bash
# Liveness probe
curl http://localhost:3000/health/live
# Expected: {"status":"ok","timestamp":"..."}

# Readiness probe
curl http://localhost:3000/health/ready
# Expected: {"status":"ready","checks":{...},"timestamp":"..."}

# Metrics
curl http://localhost:3000/metrics
# Expected: Prometheus-formatted metrics

# Check logs
tail -f logs/server.log | grep -E "(bootstrap|canonical|search|request)"
```

### 10. Documentation & Examples Complete ✅

**Criteria**:
- [ ] Architecture, API reference, and provisioning guides published
- [ ] 5+ examples exercised in CI
- [ ] Migration guide outlines steps from legacy architecture

**Validation Steps**:
```bash
# Verify documentation structure
ls docs/architecture/
ls docs/getting-started/
ls docs/guides/
ls docs/api/
ls docs/migration/

# Verify examples
ls examples/01-minimal/
ls examples/02-profiled/
ls examples/03-repository-swap/
ls examples/04-search-depth/
ls examples/05-operations/

# Run all examples
for dir in examples/*/; do
  echo "Testing $dir"
  cd "$dir"
  bun install
  bun run test
  cd -
done

# Verify examples in CI
cat .github/workflows/examples.yml
```

## Integration Tests

### End-to-End Test Suite

```typescript
describe('Full Stack Integration', () => {
  let server: FhirServer;

  beforeAll(async () => {
    server = await createFhirServer({
      port: 0,
      packages: ['hl7.fhir.r4.core#4.0.1']
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  test('complete CRUD workflow', async () => {
    // Create
    const created = await server.request({
      method: 'POST',
      path: '/Patient',
      body: { resourceType: 'Patient', name: [{ family: 'Doe' }] }
    });
    expect(created.status).toBe(201);

    // Read
    const read = await server.request({
      method: 'GET',
      path: `/Patient/${created.body.id}`
    });
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(created.body.id);

    // Update
    const updated = await server.request({
      method: 'PUT',
      path: `/Patient/${created.body.id}`,
      body: { ...created.body, gender: 'male' }
    });
    expect(updated.status).toBe(200);
    expect(updated.body.gender).toBe('male');

    // Search
    const searched = await server.request({
      method: 'GET',
      path: '/Patient?name=Doe'
    });
    expect(searched.status).toBe(200);
    expect(searched.body.entry.length).toBeGreaterThan(0);

    // Delete
    const deleted = await server.request({
      method: 'DELETE',
      path: `/Patient/${created.body.id}`
    });
    expect(deleted.status).toBe(204);

    // Verify deleted
    const notFound = await server.request({
      method: 'GET',
      path: `/Patient/${created.body.id}`
    });
    expect(notFound.status).toBe(404);
  });

  test('transaction processing', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          request: { method: 'POST', url: 'Patient' },
          resource: { resourceType: 'Patient', name: [{ family: 'Smith' }] }
        },
        {
          request: { method: 'POST', url: 'Patient' },
          resource: { resourceType: 'Patient', name: [{ family: 'Jones' }] }
        }
      ]
    };

    const response = await server.request({
      method: 'POST',
      path: '/',
      body: bundle
    });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('transaction-response');
    expect(response.body.entry.length).toBe(2);
  });

  test('hot reload', async () => {
    // Get initial capability
    const cap1 = await server.request({
      method: 'GET',
      path: '/metadata'
    });

    const initialResources = cap1.body.rest[0].resource.length;

    // Trigger package update (simulate)
    await server.services.canonicals.loadPackages(['hl7.fhir.us.core#7.0.0']);

    // Wait for reload
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get updated capability
    const cap2 = await server.request({
      method: 'GET',
      path: '/metadata'
    });

    const updatedResources = cap2.body.rest[0].resource.length;

    // Should have more resources
    expect(updatedResources).toBeGreaterThan(initialResources);
  });
});
```

## Performance Benchmarks

### Baseline Requirements

- Server startup: < 1 second (with R4 Core)
- Read operation: < 10ms (memory), < 20ms (SQLite)
- Search operation: < 50ms (simple), < 200ms (complex)
- Transaction (10 entries): < 100ms
- Package load: < 1 second per package

### Load Testing

```bash
# Install load testing tool
bun add -g autocannon

# Run load test
autocannon -c 100 -d 30 http://localhost:3000/Patient
```

**Expected Results**:
- Throughput: > 1000 req/sec
- Latency p95: < 100ms
- Error rate: < 0.1%

## Conformance Testing

### FHIR Touchstone

Run against FHIR Touchstone test suite:
- [ ] R4 Core conformance tests pass
- [ ] Search tests pass
- [ ] Transaction tests pass
- [ ] Conditional operation tests pass

## Final Checklist

Before marking the project complete:

- [ ] All 6 phases implemented
- [ ] All success criteria met
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Examples working
- [ ] Performance benchmarks met
- [ ] Conformance tests passing
- [ ] Security review complete
- [ ] Code reviewed
- [ ] Ready for production use

## Sign-Off

Once all criteria are met:

- [ ] Technical lead approval
- [ ] Architecture review approval
- [ ] Documentation review approval
- [ ] Security review approval
- [ ] Ready for release

---

**Version**: 1.0
**Last Updated**: 2025-10-12
**Status**: Planning
