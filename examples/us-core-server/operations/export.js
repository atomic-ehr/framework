import { defineOperation } from '@atomic/framework';
import { randomUUID } from 'crypto';

// In-memory export job tracking (in production, use persistent storage)
const exportJobs = new Map();

export default defineOperation({
  name: 'export',
  resource: null, // System-level operation
  type: 'system',
  
  parameters: {
    input: [
      {
        name: '_outputFormat',
        type: 'string',
        min: 0,
        max: '1',
        documentation: 'Output format (defaults to ndjson)'
      },
      {
        name: '_since',
        type: 'instant',
        min: 0,
        max: '1',
        documentation: 'Export resources updated after this time'
      },
      {
        name: '_type',
        type: 'string',
        min: 0,
        max: '1',
        documentation: 'Comma-delimited list of resource types to export'
      }
    ],
    output: [
      {
        name: 'return',
        type: 'OperationOutcome',
        min: 1,
        max: '1',
        documentation: 'Export operation status'
      }
    ]
  },
  
  async handler(params, context) {
    const { _outputFormat = 'ndjson', _since, _type } = params;
    
    // Validate output format
    if (_outputFormat !== 'ndjson') {
      throw new Error('Only ndjson output format is currently supported');
    }
    
    // Create export job
    const jobId = randomUUID();
    const job = {
      id: jobId,
      status: 'in-progress',
      requestTime: new Date().toISOString(),
      outputFormat: _outputFormat,
      since: _since,
      types: _type ? _type.split(',').map(t => t.trim()) : null,
      output: [],
      errors: []
    };
    
    exportJobs.set(jobId, job);
    
    // Start async export process
    processExport(job, context.storage).catch(error => {
      job.status = 'error';
      job.errors.push({
        type: 'exception',
        message: error.message
      });
    });
    
    // Return 202 Accepted with Content-Location header
    context.res = {
      status: 202,
      headers: {
        'Content-Location': `/$export-status/${jobId}`
      }
    };
    
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'information',
        code: 'informational',
        details: {
          text: `Export job started with ID: ${jobId}`
        }
      }]
    };
  }
});

async function processExport(job, storage) {
  try {
    // Simulate export processing
    console.log(`Starting export job ${job.id}`);
    
    // Determine resource types to export
    const resourceTypes = job.types || [
      'Patient', 'Observation', 'Condition', 'MedicationRequest',
      'AllergyIntolerance', 'Immunization', 'Procedure'
    ];
    
    for (const resourceType of resourceTypes) {
      try {
        // Build search parameters
        const searchParams = {
          _count: 1000 // Batch size
        };
        
        if (job.since) {
          searchParams._lastUpdated = `gt${job.since}`;
        }
        
        // Fetch resources
        const resources = await storage.search(resourceType, searchParams);
        
        if (resources.length > 0) {
          // In production, write to actual files
          // For demo, we'll just track metadata
          job.output.push({
            type: resourceType,
            url: `http://localhost:3001/exports/${job.id}/${resourceType}.ndjson`,
            count: resources.length
          });
          
          console.log(`Exported ${resources.length} ${resourceType} resources`);
        }
      } catch (error) {
        job.errors.push({
          type: resourceType,
          message: error.message
        });
      }
    }
    
    // Mark job as complete
    job.status = 'complete';
    job.completedTime = new Date().toISOString();
    
    console.log(`Export job ${job.id} completed`);
  } catch (error) {
    job.status = 'error';
    job.errors.push({
      type: 'exception',
      message: error.message
    });
    throw error;
  }
}

// Add status check operation
export const exportStatus = defineOperation({
  name: 'export-status',
  resource: null,
  type: 'system',
  
  async handler(params, context) {
    const jobId = context.req.params.jobId;
    const job = exportJobs.get(jobId);
    
    if (!job) {
      return {
        status: 404,
        body: JSON.stringify({
          resourceType: 'OperationOutcome',
          issue: [{
            severity: 'error',
            code: 'not-found',
            details: { text: 'Export job not found' }
          }]
        })
      };
    }
    
    if (job.status === 'in-progress') {
      return {
        status: 202,
        headers: {
          'X-Progress': 'in-progress',
          'Retry-After': '5'
        }
      };
    }
    
    if (job.status === 'complete') {
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transactionTime: job.completedTime,
          request: `/$export?_outputFormat=${job.outputFormat}`,
          requiresAccessToken: false,
          output: job.output,
          error: job.errors.length > 0 ? job.errors : undefined
        })
      };
    }
    
    // Error status
    return {
      status: 500,
      body: JSON.stringify({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'exception',
          details: { text: job.errors[0]?.message || 'Export failed' }
        }]
      })
    };
  }
});