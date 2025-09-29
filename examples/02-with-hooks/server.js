/**
 * Example 2: Server with Custom Hooks
 *
 * Demonstrates how to add custom business logic using hooks.
 */

import { FhirServer } from '@atomic-ehr/server';

const server = new FhirServer({
  port: 3000,
  packages: ['hl7.fhir.r4.core#4.0.1'],
  logging: {
    level: 'info',
    format: 'text'
  }
});

// Add timestamp hook - automatically add timestamps to all resources
server.addHook({
  name: 'auto-timestamp',
  phase: 'preHandler',
  resources: '*',
  priority: 70,
  handler: async (context) => {
    if (['create', 'update'].includes(context.operation) && context.body) {
      const resource = context.body;

      if (!resource.meta) {
        resource.meta = {};
      }

      resource.meta.lastUpdated = new Date().toISOString();

      // Add custom tag
      if (!resource.meta.tag) {
        resource.meta.tag = [];
      }

      resource.meta.tag.push({
        system: 'http://example.org/tags',
        code: 'auto-timestamped',
        display: 'Automatically Timestamped'
      });

      console.log(`✓ Added timestamp to ${context.resourceType}`);
    }

    return context;
  }
});

// Add validation hook for Patient resources
server.addHook({
  name: 'patient-validation',
  phase: 'preHandler',
  resources: 'Patient',
  priority: 65,
  handler: async (context) => {
    if (context.operation === 'create' && context.body) {
      const patient = context.body;

      // Business rule: All patients must have a family name
      if (!patient.name?.[0]?.family) {
        throw new Error('Patient must have a family name');
      }

      // Business rule: Email must be valid
      if (patient.telecom) {
        for (const contact of patient.telecom) {
          if (contact.system === 'email' && contact.value) {
            if (!contact.value.includes('@')) {
              throw new Error(`Invalid email: ${contact.value}`);
            }
          }
        }
      }

      console.log(`✓ Validated patient: ${patient.name[0].family}`);
    }

    return context;
  }
});

// Add audit logging hook
server.addHook({
  name: 'audit-logger',
  phase: 'onResponse',
  resources: '*',
  priority: 50,
  handler: async (context) => {
    if (['create', 'update', 'delete'].includes(context.operation)) {
      const auditLog = {
        timestamp: new Date().toISOString(),
        action: context.operation,
        resourceType: context.resourceType,
        resourceId: context.params?.id || context.responseBody?.id,
        statusCode: context.statusCode,
        success: context.statusCode < 400
      };

      console.log('📝 AUDIT:', JSON.stringify(auditLog));
    }

    return context;
  }
});

await server.start();

console.log('🚀 FHIR Server with hooks running on http://localhost:3000');
console.log('\n✨ Active Hooks:');
console.log('  - auto-timestamp: Adds timestamps to all resources');
console.log('  - patient-validation: Validates Patient business rules');
console.log('  - audit-logger: Logs all write operations');
console.log('\nTest commands:');
console.log('  # Should fail - no family name');
console.log('  curl -X POST http://localhost:3000/Patient \\');
console.log('    -H "Content-Type: application/fhir+json" \\');
console.log('    -d \'{"resourceType":"Patient","gender":"male"}\'');
console.log('\n  # Should succeed');
console.log('  curl -X POST http://localhost:3000/Patient \\');
console.log('    -H "Content-Type: application/fhir+json" \\');
console.log('    -d \'{"resourceType":"Patient","name":[{"family":"Doe","given":["John"]}]}\'');