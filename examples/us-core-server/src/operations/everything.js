import { defineOperation } from '@atomic/framework';

export default defineOperation({
  name: 'everything',
  resource: 'Patient',
  type: 'instance',
  
  parameters: {
    input: [
      {
        name: 'start',
        type: 'date',
        min: 0,
        max: '1',
        documentation: 'Starting date for filtering resources'
      },
      {
        name: 'end',
        type: 'date',
        min: 0,
        max: '1',
        documentation: 'Ending date for filtering resources'
      },
      {
        name: '_type',
        type: 'code',
        min: 0,
        max: '*',
        documentation: 'Resource types to include'
      },
      {
        name: '_count',
        type: 'integer',
        min: 0,
        max: '1',
        documentation: 'Maximum number of resources to return'
      }
    ],
    output: [
      {
        name: 'return',
        type: 'Bundle',
        min: 1,
        max: '1',
        documentation: 'Bundle containing all patient resources'
      }
    ]
  },
  
  async handler(params, context) {
    const { resource: patient, start, end, _type: types, _count: count = 100 } = params;
    
    if (!patient || patient.resourceType !== 'Patient') {
      throw new Error('Patient resource is required');
    }
    
    const patientId = patient.id;
    const entries = [];
    
    // Add the patient resource itself
    entries.push({
      fullUrl: `Patient/${patientId}`,
      resource: patient
    });
    
    // Define resource types to fetch
    const resourceTypes = types && types.length > 0 
      ? types 
      : ['Observation', 'Condition', 'MedicationRequest', 'AllergyIntolerance', 
         'Immunization', 'Procedure', 'DiagnosticReport', 'DocumentReference'];
    
    // Fetch related resources
    for (const resourceType of resourceTypes) {
      try {
        // Search for resources related to this patient
        const searchParams = {
          patient: `Patient/${patientId}`,
          _count: Math.min(20, count - entries.length) // Limit per resource type
        };
        
        // Add date filtering if provided
        if (start) {
          searchParams.date = `ge${start}`;
        }
        if (end) {
          searchParams.date = searchParams.date 
            ? `${searchParams.date}&le${end}`
            : `le${end}`;
        }
        
        const resources = await context.storage.search(resourceType, searchParams);
        
        for (const resource of resources) {
          entries.push({
            fullUrl: `${resourceType}/${resource.id}`,
            resource
          });
          
          // Stop if we've reached the count limit
          if (entries.length >= count) {
            break;
          }
        }
        
        if (entries.length >= count) {
          break;
        }
      } catch (error) {
        console.log(`Could not fetch ${resourceType} resources: ${error.message}`);
        // Continue with other resource types
      }
    }
    
    // Build the response bundle
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: entries.length,
      link: [
        {
          relation: 'self',
          url: `${context.req.url}`
        }
      ],
      entry: entries,
      meta: {
        lastUpdated: new Date().toISOString()
      }
    };
  }
});