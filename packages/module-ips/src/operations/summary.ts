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
  instance: true,
  description: 'Generate International Patient Summary (IPS) document',
  
  async handler(req, context) {

    const { storage } = context;
    console.log("req", req);
    console.log("context", context);
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const patientId = pathParts[pathParts.length - 2];
    
    // Get the patient
    const patient = await storage.read('Patient', patientId);
    if (!patient) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: {
          resourceType: 'OperationOutcome',
          issue: [{
            severity: 'error',
            code: 'not-found',
            details: { text: `Patient/${patientId} not found` }
          }]
        }
      };
    }
    
    // Try to fetch related clinical data
    let sections;
    try {
      sections = await generateIPSSections(patientId, context);
    } catch (e) {
      // If search fails, continue with empty sections
      sections = {
        medications: [],
        allergies: [],
        problems: [],
        immunizations: [],
        procedures: [],
        results: [],
        vitalSigns: []
      };
    }
    
    // Create IPS Bundle
    const ipsBundle = {
      resourceType: 'Bundle',
      id: `ips-${patientId}`,
      type: 'document',
      timestamp: new Date().toISOString(),
      entry: [
        {
          fullUrl: `urn:uuid:composition-${patientId}`,
          resource: {
            resourceType: 'Composition',
            id: `composition-${patientId}`,
            status: 'final',
            type: {
              coding: [{
                system: 'http://loinc.org',
                code: '60591-5',
                display: 'Patient summary Document'
              }]
            },
            subject: {
              reference: `Patient/${patientId}`
            },
            date: new Date().toISOString(),
            author: [{
              display: 'IPS Module'
            }],
            title: 'International Patient Summary',
            section: [
              {
                title: 'Allergies and Intolerances',
                code: {
                  coding: [{
                    system: 'http://loinc.org',
                    code: '48765-2',
                    display: 'Allergies and adverse reactions Document'
                  }]
                },
                text: {
                  status: 'generated',
                  div: `<div xmlns="http://www.w3.org/1999/xhtml">${sections.allergies?.length || 0} allergies found</div>`
                },
                entry: sections.allergies?.map((a: any) => ({ reference: `AllergyIntolerance/${a.id}` })) || []
              },
              {
                title: 'Medication Summary',
                code: {
                  coding: [{
                    system: 'http://loinc.org',
                    code: '10160-0',
                    display: 'History of Medication use Narrative'
                  }]
                },
                text: {
                  status: 'generated',
                  div: `<div xmlns="http://www.w3.org/1999/xhtml">${sections.medications?.length || 0} medications found</div>`
                },
                entry: sections.medications?.map((m: any) => ({ reference: `MedicationStatement/${m.id}` })) || []
              },
              {
                title: 'Problem List',
                code: {
                  coding: [{
                    system: 'http://loinc.org',
                    code: '11450-4',
                    display: 'Problem list - Reported'
                  }]
                },
                text: {
                  status: 'generated',
                  div: `<div xmlns="http://www.w3.org/1999/xhtml">${sections.problems?.length || 0} problems found</div>`
                },
                entry: sections.problems?.map((p: any) => ({ reference: `Condition/${p.id}` })) || []
              }
            ]
          }
        },
        {
          fullUrl: `urn:uuid:patient-${patientId}`,
          resource: patient
        }
      ]
    };
    
    // Add all related resources to the bundle
    const allResources = [
      ...(sections.medications || []),
      ...(sections.allergies || []),
      ...(sections.problems || []),
      ...(sections.immunizations || []),
      ...(sections.procedures || []),
      ...(sections.results || []),
      ...(sections.vitalSigns || [])
    ];
    
    allResources.forEach((resource: any) => {
      ipsBundle.entry.push({
        fullUrl: `urn:uuid:${resource.resourceType}-${resource.id}`,
        resource
      });
    });
    
    return {
      status: 200,
      headers: { 'Content-Type': 'application/fhir+json' },
      body: ipsBundle
    };
  }
} satisfies OperationDefinition);