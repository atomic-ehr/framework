import { defineMiddleware } from '@atomic-fhir/core';

// Simple SMART on FHIR authentication middleware
// In production, integrate with a real OAuth2/OIDC provider

export default defineMiddleware({
  name: 'smart-auth',
  
  scope: {
    // Apply to all resources except metadata and auth endpoints
    resources: ['Patient', 'Observation', 'Practitioner', 'Condition', 'MedicationRequest']
  },
  
  async before(req, context) {
    // Skip auth for metadata endpoint
    const url = new URL(req.url);
    if (url.pathname === '/metadata' || url.pathname === '/.well-known/smart-configuration') {
      return;
    }
    
    // Check for Authorization header
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header required');
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Bearer token required');
    }
    
    const token = authHeader.substring(7);
    
    // Validate token (simplified - in production, verify JWT signature)
    try {
      const tokenData = validateToken(token);
      
      // Add user context
      context.user = {
        id: tokenData.sub,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
        patient: tokenData.patient,
        practitioner: tokenData.practitioner
      };
      
      // Check SMART scopes
      const method = req.method.toUpperCase();
      const pathParts = url.pathname.split('/').filter(Boolean);
      const resourceType = pathParts[0];
      
      if (resourceType) {
        const requiredScope = getRequiredScope(method, resourceType);
        
        if (requiredScope && !context.user.scopes.includes(requiredScope)) {
          throw new ForbiddenError(`Missing required scope: ${requiredScope}`);
        }
      }
      
      console.log(`Authenticated user ${context.user.id} with scopes: ${context.user.scopes.join(', ')}`);
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new UnauthorizedError('Invalid token');
    }
  },
  
  async after(response, context) {
    // Add SMART on FHIR headers
    if (context.user) {
      response.headers = response.headers || {};
      response.headers['X-Request-User'] = context.user.id;
      
      // Add patient context if available
      if (context.user.patient) {
        response.headers['X-Patient-Context'] = context.user.patient;
      }
    }
    
    return response;
  }
});

function validateToken(token) {
  // Simplified token validation
  // In production, validate JWT signature, expiry, issuer, etc.
  
  try {
    // Decode base64 payload (middle part of JWT)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }
    
    return payload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

function getRequiredScope(method, resourceType) {
  const baseScope = resourceType.toLowerCase();
  
  switch (method) {
    case 'GET':
      return `patient/${baseScope}.read`;
    case 'POST':
      return `patient/${baseScope}.write`;
    case 'PUT':
    case 'PATCH':
      return `patient/${baseScope}.write`;
    case 'DELETE':
      return `patient/${baseScope}.write`;
    default:
      return null;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

export { UnauthorizedError, ForbiddenError };