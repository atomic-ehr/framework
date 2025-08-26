import { defineOperation } from '@atomic-fhir/core';

// This operation will be auto-discovered and registered
// Available at POST /$ping

export default defineOperation({
  name: 'ping',
  resource: null, // System-level operation
  type: 'system',
  
  async handler(params, context) {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'information',
        code: 'informational',
        details: {
          text: `Pong! Server time: ${new Date().toISOString()}`
        }
      }]
    };
  }
});