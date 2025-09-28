/**
 * Default FHIR operation handlers (placeholder implementations)
 */

import type {
  FhirOperationHandler
} from './types.js';
import type {
  HttpRequestContext,
  HttpResponseContext
} from '../types.js';

/**
 * Create a not implemented response
 */
function createNotImplementedResponse(
  context: HttpRequestContext,
  operation: string,
  details?: string
): HttpResponseContext {
  const message = details
    ? `${operation} operation: ${details}`
    : `${operation} operation not yet implemented`;

  return {
    statusCode: 501,
    responseHeaders: {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'X-Request-ID': context.requestId
    },
    responseBody: {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-supported',
        diagnostics: message
      }]
    },
    timing: {
      startTime: context.startTime,
      endTime: Date.now(),
      duration: Date.now() - context.startTime,
      hookDuration: 0
    }
  };
}

/**
 * Default handler for FHIR read operation
 * GET [base]/[type]/[id]
 */
export const defaultReadHandler: FhirOperationHandler = async (context) => {
  const { resourceType, params } = context;
  const id = params.id;

  return createNotImplementedResponse(
    context,
    'Read',
    `Reading ${resourceType}/${id}`
  );
};

/**
 * Default handler for FHIR vread operation
 * GET [base]/[type]/[id]/_history/[vid]
 */
export const defaultVreadHandler: FhirOperationHandler = async (context) => {
  const { resourceType, params } = context;
  const { id, vid } = params;

  return createNotImplementedResponse(
    context,
    'Vread',
    `Reading ${resourceType}/${id}/_history/${vid}`
  );
};

/**
 * Default handler for FHIR create operation
 * POST [base]/[type]
 */
export const defaultCreateHandler: FhirOperationHandler = async (context) => {
  const { resourceType, body } = context;

  // Basic validation that body exists
  if (!body) {
    return {
      statusCode: 400,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          diagnostics: 'Request body is required for create operation'
        }]
      },
      timing: {
        startTime: context.startTime,
        endTime: Date.now(),
        duration: Date.now() - context.startTime,
        hookDuration: 0
      }
    };
  }

  // Basic validation that resourceType matches
  if (body.resourceType && body.resourceType !== resourceType) {
    return {
      statusCode: 400,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          diagnostics: `Resource type in body (${body.resourceType}) does not match URL (${resourceType})`
        }]
      },
      timing: {
        startTime: context.startTime,
        endTime: Date.now(),
        duration: Date.now() - context.startTime,
        hookDuration: 0
      }
    };
  }

  return createNotImplementedResponse(
    context,
    'Create',
    `Creating ${resourceType}`
  );
};

/**
 * Default handler for FHIR update operation
 * PUT [base]/[type]/[id]
 */
export const defaultUpdateHandler: FhirOperationHandler = async (context) => {
  const { resourceType, params, body } = context;
  const id = params.id;

  // Basic validation that body exists
  if (!body) {
    return {
      statusCode: 400,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          diagnostics: 'Request body is required for update operation'
        }]
      },
      timing: {
        startTime: context.startTime,
        endTime: Date.now(),
        duration: Date.now() - context.startTime,
        hookDuration: 0
      }
    };
  }

  return createNotImplementedResponse(
    context,
    'Update',
    `Updating ${resourceType}/${id}`
  );
};

/**
 * Default handler for FHIR patch operation
 * PATCH [base]/[type]/[id]
 */
export const defaultPatchHandler: FhirOperationHandler = async (context) => {
  const { resourceType, params } = context;
  const id = params.id;

  return createNotImplementedResponse(
    context,
    'Patch',
    `Patching ${resourceType}/${id}`
  );
};

/**
 * Default handler for FHIR delete operation
 * DELETE [base]/[type]/[id]
 */
export const defaultDeleteHandler: FhirOperationHandler = async (context) => {
  const { resourceType, params } = context;
  const id = params.id;

  return createNotImplementedResponse(
    context,
    'Delete',
    `Deleting ${resourceType}/${id}`
  );
};

/**
 * Default handler for FHIR search operation
 * GET [base]/[type]?[parameters]
 */
export const defaultSearchHandler: FhirOperationHandler = async (context) => {
  const { resourceType, query } = context;

  // Extract search parameters (excluding FHIR control parameters)
  const searchParams = Object.entries(query || {})
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const details = searchParams
    ? `Searching ${resourceType} with parameters: ${searchParams}`
    : `Searching ${resourceType}`;

  return createNotImplementedResponse(
    context,
    'Search',
    details
  );
};

/**
 * Default handler for FHIR system search operation
 * GET [base]?[parameters]
 */
export const defaultSearchSystemHandler: FhirOperationHandler = async (context) => {
  const { query } = context;

  const searchParams = Object.entries(query || {})
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const details = searchParams
    ? `System-wide search with parameters: ${searchParams}`
    : 'System-wide search';

  return createNotImplementedResponse(
    context,
    'System Search',
    details
  );
};

/**
 * Default handler for FHIR history operations
 * GET [base]/[type]/_history
 * GET [base]/[type]/[id]/_history
 * GET [base]/_history
 */
export const defaultHistoryHandler: FhirOperationHandler = async (context) => {
  const { resourceType, params } = context;
  const id = params.id;

  let details: string;
  if (resourceType && id) {
    details = `Instance history for ${resourceType}/${id}`;
  } else if (resourceType) {
    details = `Type history for ${resourceType}`;
  } else {
    details = 'System-wide history';
  }

  return createNotImplementedResponse(
    context,
    'History',
    details
  );
};

/**
 * Default handler for FHIR capabilities operation
 * GET [base]/metadata
 */
export const defaultCapabilitiesHandler: FhirOperationHandler = async (context) => {
  return {
    statusCode: 200,
    responseHeaders: {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'X-Request-ID': context.requestId,
      'Cache-Control': 'public, max-age=300' // 5 minutes cache
    },
    responseBody: {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString(),
      kind: 'instance',
      software: {
        name: '@atomic-ehr/server',
        version: '0.1.0'
      },
      implementation: {
        description: 'FHIR Server with Hook-based Architecture'
      },
      fhirVersion: '4.0.1',
      format: ['application/fhir+json', 'application/json'],
      patchFormat: ['application/json-patch+json'],
      acceptUnknown: 'no',
      rest: [{
        mode: 'server',
        documentation: 'FHIR Server with extensible hook-based architecture',
        security: {
          cors: true,
          description: 'CORS support enabled'
        },
        resource: [
          // Placeholder - will be populated dynamically in later phases
          {
            type: 'Patient',
            profile: 'http://hl7.org/fhir/StructureDefinition/Patient',
            interaction: [
              { code: 'read' },
              { code: 'vread' },
              { code: 'create' },
              { code: 'update' },
              { code: 'patch' },
              { code: 'delete' },
              { code: 'search-type' },
              { code: 'history-instance' },
              { code: 'history-type' }
            ],
            conditionalCreate: false,
            conditionalUpdate: false,
            conditionalDelete: 'not-supported',
            searchInclude: [],
            searchRevInclude: []
          }
        ],
        interaction: [
          { code: 'search-system' },
          { code: 'history-system' },
          { code: 'batch' },
          { code: 'transaction' }
        ],
        operation: []
      }]
    },
    timing: {
      startTime: context.startTime,
      endTime: Date.now(),
      duration: Date.now() - context.startTime,
      hookDuration: 0
    }
  };
};

/**
 * Default handler for FHIR batch operations
 * POST [base] (with Bundle.type = "batch")
 */
export const defaultBatchHandler: FhirOperationHandler = async (context) => {
  const { body } = context;

  // Basic validation for batch operation
  if (!body || body.resourceType !== 'Bundle') {
    return {
      statusCode: 400,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          diagnostics: 'Batch operation requires a Bundle resource'
        }]
      },
      timing: {
        startTime: context.startTime,
        endTime: Date.now(),
        duration: Date.now() - context.startTime,
        hookDuration: 0
      }
    };
  }

  return createNotImplementedResponse(
    context,
    'Batch',
    `Processing batch with ${body.entry?.length || 0} entries`
  );
};

/**
 * Default handler for FHIR transaction operations
 * POST [base] (with Bundle.type = "transaction")
 */
export const defaultTransactionHandler: FhirOperationHandler = async (context) => {
  const { body } = context;

  // Basic validation for transaction operation
  if (!body || body.resourceType !== 'Bundle') {
    return {
      statusCode: 400,
      responseHeaders: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'X-Request-ID': context.requestId
      },
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          diagnostics: 'Transaction operation requires a Bundle resource'
        }]
      },
      timing: {
        startTime: context.startTime,
        endTime: Date.now(),
        duration: Date.now() - context.startTime,
        hookDuration: 0
      }
    };
  }

  return createNotImplementedResponse(
    context,
    'Transaction',
    `Processing transaction with ${body.entry?.length || 0} entries`
  );
};

/**
 * Default handler for FHIR custom operations
 * POST [base]/$[operation]
 * POST [base]/[type]/$[operation]
 * POST [base]/[type]/[id]/$[operation]
 */
export const defaultOperationHandler: FhirOperationHandler = async (context) => {
  const { resourceType, params } = context;
  const { operation, id } = params;

  let details: string;
  if (resourceType && id) {
    details = `Instance operation $${operation} on ${resourceType}/${id}`;
  } else if (resourceType) {
    details = `Type operation $${operation} on ${resourceType}`;
  } else {
    details = `System operation $${operation}`;
  }

  return createNotImplementedResponse(
    context,
    'Custom Operation',
    details
  );
};

/**
 * Default handler for unsupported operations
 */
export const defaultUnsupportedHandler: FhirOperationHandler = async (context) => {
  return {
    statusCode: 405,
    responseHeaders: {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'X-Request-ID': context.requestId,
      'Allow': 'GET, POST, PUT, PATCH, DELETE'
    },
    responseBody: {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-supported',
        diagnostics: `HTTP method ${context.method} is not supported for this endpoint`
      }]
    },
    timing: {
      startTime: context.startTime,
      endTime: Date.now(),
      duration: Date.now() - context.startTime,
      hookDuration: 0
    }
  };
};

/**
 * Default handler for not found resources
 */
export const defaultNotFoundHandler: FhirOperationHandler = async (context) => {
  return {
    statusCode: 404,
    responseHeaders: {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'X-Request-ID': context.requestId
    },
    responseBody: {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        diagnostics: `URL pattern not recognized: ${context.method} ${context.url}`
      }]
    },
    timing: {
      startTime: context.startTime,
      endTime: Date.now(),
      duration: Date.now() - context.startTime,
      hookDuration: 0
    }
  };
};