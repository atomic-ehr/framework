import { defineOperation } from '@atomic-fhir/core';
import type { HandlerContext, OperationDefinition } from '@atomic-fhir/core';

async function generateIPSSections(patientId: string, context: HandlerContext) {
  const { storage } = context;
  
  const sections = {
    medications: await storage.search('MedicationStatement', { 
      patient: patientId,
      status: 'active,completed'
    }),
    allergies: await storage.search('AllergyIntolerance', { 
      patient: patientId 
    }),
    problems: await storage.search('Condition', { 
      patient: patientId,
      'clinical-status': 'active'
    }),
    immunizations: await storage.search('Immunization', { 
      patient: patientId 
    }),
    procedures: await storage.search('Procedure', { 
      patient: patientId,
      status: 'completed'
    }),
    results: await storage.search('Observation', { 
      patient: patientId,
      category: 'laboratory'
    }),
    vitalSigns: await storage.search('Observation', { 
      patient: patientId,
      category: 'vital-signs'
    })
  };

  return sections;
}

export default defineOperation({
  name: 'summary',
  resource: 'Patient',
  description: 'Generate International Patient Summary (IPS) document',
  
  async handler(req, context) {
    const patientId = req.params.id;
    
    return {
      status: 200,
      body: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'ok',
          code: 'ok',
          details: { text: `Patient/${patientId}` }
        }]
      }
    }
  }
} satisfies OperationDefinition);