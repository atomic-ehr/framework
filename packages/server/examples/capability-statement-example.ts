/**
 * Example: Capability Statement Generation
 *
 * This example demonstrates:
 * 1. Automatic capability statement generation from loaded FHIR packages
 * 2. /metadata endpoint with content negotiation
 * 3. Resource capabilities reporting
 * 4. Search parameter reporting
 */

import { FhirServer } from '../src/index.js';

async function main() {
  console.log('Starting FHIR Server with Capability Statement...\n');

  // Create server with R4 Core package
  const server = new FhirServer({
    port: 3000,
    host: 'localhost',
    serverName: 'example-fhir-server',
    serverVersion: '1.0.0',
    description: 'Example FHIR R4 Server with Capability Statement',
    fhirVersion: '4.0.1',
    packages: ['hl7.fhir.r4.core#4.0.1'],
    packageConfig: {
      registryUrls: ['https://packages.fhir.org'],
      enableProgressLogging: true
    },
    enableDynamicRoutes: true,
    defaultCapabilities: {
      read: true,
      vread: true,
      update: true,
      patch: true,
      create: true,
      delete: true,
      searchType: true,
      historyInstance: true,
      historyType: true
    },
    enabledOperations: [
      'read',
      'vread',
      'create',
      'update',
      'patch',
      'delete',
      'search-type',
      'history-instance',
      'history-type',
      'search-system',
      'history-system'
    ],
    securityConfig: {
      cors: true,
      authentication: [
        {
          type: 'SMART-on-FHIR',
          display: 'SMART on FHIR',
          description: 'OAuth2 using SMART on FHIR profile'
        }
      ]
    },
    cors: {
      enabled: true,
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization']
    },
    logging: {
      level: 'info',
      format: 'text'
    }
  });

  // Start the server
  await server.start();

  console.log('\n✅ Server started successfully!\n');

  // Get and display capability statement
  const capability = server.getCapabilityStatement();

  if (capability) {
    console.log('📋 Capability Statement Generated:');
    console.log(`   - Name: ${capability.name}`);
    console.log(`   - Version: ${capability.version}`);
    console.log(`   - FHIR Version: ${capability.fhirVersion}`);
    console.log(`   - Status: ${capability.status}`);
    console.log(`   - Formats: ${capability.format.join(', ')}`);
    console.log(`   - Implementation Guides: ${capability.implementationGuide?.join(', ') || 'none'}`);

    if (capability.rest && capability.rest.length > 0) {
      const rest = capability.rest[0];
      console.log(`\n   REST Mode: ${rest.mode}`);
      console.log(`   Resources: ${rest.resource?.length || 0}`);
      console.log(`   System Interactions: ${rest.interaction?.length || 0}`);

      // Display sample resource capabilities
      if (rest.resource && rest.resource.length > 0) {
        console.log('\n   Sample Resource Capabilities:');

        const sampleResources = rest.resource.slice(0, 5);
        for (const resource of sampleResources) {
          console.log(`\n   📦 ${resource.type}:`);
          console.log(`      - Profile: ${resource.profile}`);
          console.log(`      - Supported Profiles: ${resource.supportedProfile?.length || 0}`);
          console.log(`      - Interactions: ${resource.interaction?.map(i => i.code).join(', ')}`);
          console.log(`      - Search Parameters: ${resource.searchParam?.length || 0}`);

          if (resource.searchParam && resource.searchParam.length > 0) {
            const sampleParams = resource.searchParam.slice(0, 3);
            console.log(`      - Sample Search Params:`);
            for (const param of sampleParams) {
              console.log(`        - ${param.name} (${param.type}): ${param.documentation}`);
            }
          }
        }
      }

      // Display system interactions
      if (rest.interaction && rest.interaction.length > 0) {
        console.log('\n   System Interactions:');
        for (const interaction of rest.interaction) {
          console.log(`      - ${interaction.code}: ${interaction.documentation}`);
        }
      }

      // Display security
      if (rest.security) {
        console.log('\n   Security:');
        console.log(`      - CORS: ${rest.security.cors ? 'enabled' : 'disabled'}`);
        if (rest.security.service && rest.security.service.length > 0) {
          console.log(`      - Authentication Services:`);
          for (const service of rest.security.service) {
            const coding = service.coding?.[0];
            if (coding) {
              console.log(`        - ${coding.display || coding.code}`);
            }
          }
        }
      }
    }
  }

  console.log('\n\n🌐 Endpoints:');
  console.log('   - GET http://localhost:3000/metadata - Capability Statement');
  console.log('   - GET http://localhost:3000/Patient - Search Patients');
  console.log('   - GET http://localhost:3000/Patient/{id} - Read Patient');
  console.log('   - POST http://localhost:3000/Patient - Create Patient');
  console.log('   - PUT http://localhost:3000/Patient/{id} - Update Patient');
  console.log('   - DELETE http://localhost:3000/Patient/{id} - Delete Patient');

  console.log('\n\n📝 Testing:');
  console.log('   Get capability statement:');
  console.log('   curl http://localhost:3000/metadata');
  console.log('\n   Get capability statement as JSON:');
  console.log('   curl -H "Accept: application/fhir+json" http://localhost:3000/metadata');
  console.log('\n   Get capability statement as XML:');
  console.log('   curl -H "Accept: application/fhir+xml" http://localhost:3000/metadata');

  console.log('\n\n🔍 Package Statistics:');
  const packageStats = server.getPackageStats();
  if (packageStats) {
    console.log(`   - Loaded Packages: ${packageStats.loadedPackages}`);
    console.log(`   - Resource Types: ${packageStats.resourceTypes}`);
    console.log(`   - Total Resources: ${packageStats.totalResources}`);
  }

  console.log('\n\n💡 Capability Statement Details:');
  console.log('   The capability statement is automatically generated from:');
  console.log('   1. Loaded FHIR packages (hl7.fhir.r4.core)');
  console.log('   2. Configured resource capabilities');
  console.log('   3. Enabled operations');
  console.log('   4. Security configuration');
  console.log('   5. Dynamic routes from package resources');

  console.log('\n   It reports:');
  console.log('   - All supported resource types');
  console.log('   - Supported interactions per resource (read, create, update, etc.)');
  console.log('   - Search parameters for each resource');
  console.log('   - Supported profiles and implementation guides');
  console.log('   - Security and authentication methods');
  console.log('   - System-level interactions (search, history, batch, transaction)');

  console.log('\n\n✨ Features:');
  console.log('   ✓ Automatic capability statement generation');
  console.log('   ✓ Content negotiation (JSON/XML)');
  console.log('   ✓ Package-aware resource reporting');
  console.log('   ✓ Search parameter documentation');
  console.log('   ✓ Security configuration reporting');
  console.log('   ✓ Caching support (5 minutes)');
  console.log('   ✓ Runtime information (uptime, generation time)');

  console.log('\n\nPress Ctrl+C to stop the server\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down server...');
    await server.stop();
    console.log('Server stopped');
    process.exit(0);
  });
}

// Run the example
main().catch(error => {
  console.error('Error running example:', error);
  process.exit(1);
});