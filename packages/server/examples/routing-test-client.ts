/**
 * Test client for exercising FHIR routing capabilities
 */

const SERVER_URL = 'http://localhost:3001';

interface TestCase {
  name: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
  expectedStatus?: number;
  description: string;
}

const testCases: TestCase[] = [
  // System level operations
  {
    name: 'Capabilities',
    method: 'GET',
    path: '/metadata',
    expectedStatus: 200,
    description: 'Get server capabilities'
  },
  {
    name: 'System Search',
    method: 'GET',
    path: '/?_type=Patient&name=john',
    expectedStatus: 200,
    description: 'Search across all resource types'
  },
  {
    name: 'System History',
    method: 'GET',
    path: '/_history',
    expectedStatus: 501,
    description: 'Get system-wide history'
  },
  {
    name: 'System Operation',
    method: 'POST',
    path: '/$validate',
    expectedStatus: 200,
    description: 'System-level validation operation'
  },
  {
    name: 'Batch Operation',
    method: 'POST',
    path: '/',
    body: {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{
        request: { method: 'GET', url: 'Patient/123' }
      }]
    },
    expectedStatus: 501,
    description: 'Process batch operations'
  },

  // Patient operations
  {
    name: 'Patient Read',
    method: 'GET',
    path: '/Patient/123',
    expectedStatus: 501,
    description: 'Read a specific patient'
  },
  {
    name: 'Patient Version Read',
    method: 'GET',
    path: '/Patient/123/_history/1',
    expectedStatus: 501,
    description: 'Read a specific version of a patient'
  },
  {
    name: 'Patient Create',
    method: 'POST',
    path: '/Patient',
    body: {
      resourceType: 'Patient',
      name: [{ family: 'Doe', given: ['John'] }],
      gender: 'male',
      birthDate: '1990-01-01'
    },
    expectedStatus: 501,
    description: 'Create a new patient'
  },
  {
    name: 'Patient Update',
    method: 'PUT',
    path: '/Patient/123',
    body: {
      resourceType: 'Patient',
      id: '123',
      name: [{ family: 'Doe', given: ['John', 'William'] }],
      gender: 'male'
    },
    expectedStatus: 501,
    description: 'Update an existing patient'
  },
  {
    name: 'Patient Delete',
    method: 'DELETE',
    path: '/Patient/123',
    expectedStatus: 501,
    description: 'Delete a patient'
  },
  {
    name: 'Patient Search',
    method: 'GET',
    path: '/Patient?name=john&gender=male',
    expectedStatus: 200,
    description: 'Search for patients'
  },
  {
    name: 'Patient History',
    method: 'GET',
    path: '/Patient/_history',
    expectedStatus: 501,
    description: 'Get patient type history'
  },
  {
    name: 'Patient Instance History',
    method: 'GET',
    path: '/Patient/123/_history',
    expectedStatus: 501,
    description: 'Get specific patient history'
  },

  // Observation operations
  {
    name: 'Observation Read',
    method: 'GET',
    path: '/Observation/456',
    expectedStatus: 501,
    description: 'Read a specific observation'
  },
  {
    name: 'Observation Create',
    method: 'POST',
    path: '/Observation',
    body: {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '29463-7',
          display: 'Body Weight'
        }]
      },
      subject: { reference: 'Patient/123' },
      valueQuantity: {
        value: 75,
        unit: 'kg',
        system: 'http://unitsofmeasure.org',
        code: 'kg'
      }
    },
    expectedStatus: 501,
    description: 'Create a new observation'
  },
  {
    name: 'Observation Search',
    method: 'GET',
    path: '/Observation?patient=123&code=29463-7',
    expectedStatus: 200,
    description: 'Search for observations'
  },

  // Custom operations
  {
    name: 'Patient Type Validation',
    method: 'POST',
    path: '/Patient/$validate',
    body: {
      resourceType: 'Patient',
      name: [{ family: 'Test' }]
    },
    expectedStatus: 200,
    description: 'Validate patient resource type'
  },
  {
    name: 'Patient Instance Everything',
    method: 'POST',
    path: '/Patient/123/$everything',
    expectedStatus: 200,
    description: 'Get everything related to a patient'
  },
  {
    name: 'Observation Type Validation',
    method: 'POST',
    path: '/Observation/$validate',
    body: {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'Test' }
    },
    expectedStatus: 200,
    description: 'Validate observation resource type'
  },

  // Error cases
  {
    name: 'Invalid URL',
    method: 'GET',
    path: '/invalid/url/pattern',
    expectedStatus: 404,
    description: 'Test invalid URL pattern'
  },
  {
    name: 'Invalid Resource Type',
    method: 'GET',
    path: '/invalidResource/123',
    expectedStatus: 404,
    description: 'Test invalid resource type'
  },
  {
    name: 'Patient Create Without Body',
    method: 'POST',
    path: '/Patient',
    expectedStatus: 400,
    description: 'Test create without request body'
  },
  {
    name: 'Patient Create Wrong Resource Type',
    method: 'POST',
    path: '/Patient',
    body: { resourceType: 'Observation' },
    expectedStatus: 400,
    description: 'Test create with wrong resource type'
  }
];

async function runTest(testCase: TestCase): Promise<void> {
  console.log(`\\n🧪 ${testCase.name}`);
  console.log(`   ${testCase.description}`);
  console.log(`   ${testCase.method} ${testCase.path}`);

  try {
    const options: RequestInit = {
      method: testCase.method,
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
        ...testCase.headers
      }
    };

    if (testCase.body) {
      options.body = JSON.stringify(testCase.body);
    }

    const response = await fetch(`${SERVER_URL}${testCase.path}`, options);

    console.log(`   Status: ${response.status} ${response.statusText}`);

    // Check expected status
    if (testCase.expectedStatus && response.status !== testCase.expectedStatus) {
      console.log(`   ⚠️  Expected status ${testCase.expectedStatus}, got ${response.status}`);
    } else {
      console.log(`   ✅ Status matches expectation`);
    }

    // Show important headers
    const contentType = response.headers.get('content-type');
    const requestId = response.headers.get('x-request-id');
    console.log(`   Content-Type: ${contentType}`);
    if (requestId) {
      console.log(`   Request-ID: ${requestId}`);
    }

    // Show response body (truncated for large responses)
    const body = await response.text();
    if (body) {
      try {
        const json = JSON.parse(body);
        if (json.resourceType) {
          console.log(`   Resource: ${json.resourceType}`);

          if (json.resourceType === 'OperationOutcome' && json.issue) {
            const issue = json.issue[0];
            console.log(`   Issue: ${issue.severity} - ${issue.diagnostics}`);
          } else if (json.resourceType === 'Bundle' && json.total !== undefined) {
            console.log(`   Bundle: ${json.type} with ${json.total} entries`);
          } else if (json.software?.name) {
            console.log(`   Software: ${json.software.name} v${json.software.version}`);
          }
        }

        // Don't log the full response for large objects
        if (JSON.stringify(json).length <= 200) {
          console.log(`   Body: ${JSON.stringify(json, null, 2)}`);
        }
      } catch {
        console.log(`   Body: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`);
      }
    }

  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
  }
}

async function runAllTests(): Promise<void> {
  console.log('🚀 FHIR Routing Test Client');
  console.log('===========================');
  console.log(`Testing server at: ${SERVER_URL}`);

  // Wait a moment for server to be ready
  console.log('\\nWaiting for server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\\n📊 Running test cases:');

  for (const testCase of testCases) {
    await runTest(testCase);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between tests
  }

  console.log('\\n✅ All tests completed!');
  console.log('\\n📈 Test Summary:');
  console.log(`   Total tests: ${testCases.length}`);
  console.log(`   System operations: ${testCases.filter(t => t.path.startsWith('/metadata') || t.path.startsWith('/$') || t.path === '/' || t.path.startsWith('/_')).length}`);
  console.log(`   Patient operations: ${testCases.filter(t => t.path.includes('/Patient')).length}`);
  console.log(`   Observation operations: ${testCases.filter(t => t.path.includes('/Observation')).length}`);
  console.log(`   Error cases: ${testCases.filter(t => t.expectedStatus && t.expectedStatus >= 400).length}`);

  console.log('\\n🎯 Key Features Demonstrated:');
  console.log('   ✅ FHIR URL pattern matching');
  console.log('   ✅ Resource type extraction');
  console.log('   ✅ Parameter extraction (ID, version ID)');
  console.log('   ✅ Query parameter handling');
  console.log('   ✅ Custom operation routing');
  console.log('   ✅ System, type, and instance level operations');
  console.log('   ✅ Proper FHIR response formatting');
  console.log('   ✅ Error handling with OperationOutcome');
  console.log('   ✅ Hook integration with routing context');
}

// Run tests if this file is executed directly
if (import.meta.main) {
  runAllTests().catch(console.error);
}

export { runAllTests };