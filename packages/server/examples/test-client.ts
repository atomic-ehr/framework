/**
 * Test client for demonstrating server functionality
 */

const SERVER_URL = 'http://localhost:3000';

async function testEndpoint(method: string, path: string, options: RequestInit = {}) {
  console.log(`\\n🔥 Testing ${method} ${path}`);

  try {
    const response = await fetch(`${SERVER_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/fhir+json',
        ...options.headers
      },
      ...options
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

    const body = await response.text();
    if (body) {
      try {
        const json = JSON.parse(body);
        console.log(`   Body:`, JSON.stringify(json, null, 2));
      } catch {
        console.log(`   Body:`, body);
      }
    }

    return { response, body };
  } catch (error) {
    console.error(`   Error:`, error);
    return null;
  }
}

async function runTests() {
  console.log('🧪 Starting FHIR Server Tests');
  console.log('================================');

  // Wait a moment for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 1: Basic capability statement
  await testEndpoint('GET', '/metadata');

  // Test 2: Simple Patient search (public)
  await testEndpoint('GET', '/Patient');

  // Test 3: Create a valid Patient
  await testEndpoint('POST', '/Patient', {
    body: JSON.stringify({
      resourceType: 'Patient',
      name: [{
        family: 'Doe',
        given: ['John']
      }],
      gender: 'male',
      birthDate: '1990-01-01'
    })
  });

  // Test 4: Create invalid Patient (missing family name)
  await testEndpoint('POST', '/Patient', {
    body: JSON.stringify({
      resourceType: 'Patient',
      name: [{
        given: ['Jane']
      }],
      gender: 'female'
    })
  });

  // Test 5: Access secure endpoint without auth
  await testEndpoint('GET', '/secure/Patient');

  // Test 6: Access secure endpoint with auth
  await testEndpoint('GET', '/secure/Patient', {
    headers: {
      'Authorization': 'Bearer demo-token'
    }
  });

  // Test 7: CORS preflight request
  await testEndpoint('OPTIONS', '/Patient', {
    headers: {
      'Origin': 'http://localhost:3001',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  });

  // Test 8: Large request body (should be rejected)
  const largeBody = JSON.stringify({
    resourceType: 'Patient',
    text: {
      div: 'x'.repeat(1024 * 1024 * 5) // 5MB of text
    }
  });

  await testEndpoint('POST', '/Patient', {
    body: largeBody
  });

  // Test 9: Invalid JSON
  await testEndpoint('POST', '/Patient', {
    body: '{ invalid json }'
  });

  // Test 10: Different resource type
  await testEndpoint('GET', '/Observation');

  console.log('\\n✅ Tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.main) {
  runTests().catch(console.error);
}

export { runTests };