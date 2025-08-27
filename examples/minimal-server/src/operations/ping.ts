import { defineOperation, type OperationDefinition, type HandlerContext } from '@atomic-fhir/core';

// This operation will be auto-discovered and registered
// Available at POST /$ping

export default defineOperation({
  name: 'ping',
  system: true, // System-level operation
  
  async handler(params: any, context: HandlerContext): Promise<any> {
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