import { defineMiddleware } from '@atomic/framework';

// Consent-based access control middleware
// Checks if user has appropriate consent to access patient data

export default defineMiddleware({
  name: 'consent-check',
  
  scope: {
    resources: ['Patient', 'Observation', 'Condition', 'MedicationRequest'],
    operations: ['read', 'search']
  },
  
  async before(req, context) {
    // Skip if no user context (auth middleware should run first)
    if (!context.user) {
      return;
    }
    
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const resourceType = pathParts[0];
    const resourceId = pathParts[1];
    
    // For patient-specific resources, check consent
    if (resourceType === 'Patient' && resourceId) {
      await checkPatientConsent(context.user, resourceId);
    } else if (resourceType && resourceId) {
      // For other resources, check if they belong to a consented patient
      try {
        const resource = await context.storage?.read(resourceType, resourceId);
        if (resource?.subject?.reference) {
          const [refType, patientId] = resource.subject.reference.split('/');
          if (refType === 'Patient') {
            await checkPatientConsent(context.user, patientId);
          }
        }
      } catch (error) {
        // Resource doesn't exist yet (might be a create operation)
        console.log(`Could not check consent for ${resourceType}/${resourceId}`);
      }
    }
    
    // For search operations, we'll filter results in the after hook
    if (req.method === 'GET' && !resourceId) {
      context.requireConsentFilter = true;
    }
  },
  
  async after(response, context) {
    // Filter search results based on consent
    if (context.requireConsentFilter && response.body) {
      try {
        const bundle = JSON.parse(response.body);
        
        if (bundle.resourceType === 'Bundle' && bundle.entry) {
          // Filter entries based on consent
          const filteredEntries = [];
          
          for (const entry of bundle.entry) {
            if (await hasConsent(context.user, entry.resource)) {
              filteredEntries.push(entry);
            }
          }
          
          bundle.entry = filteredEntries;
          bundle.total = filteredEntries.length;
          
          response.body = JSON.stringify(bundle);
        }
      } catch (error) {
        console.error('Error filtering search results:', error);
      }
    }
    
    return response;
  }
});

async function checkPatientConsent(user, patientId) {
  // Check if user has consent to access this patient's data
  
  // 1. Patient accessing their own data - always allowed
  if (user.patient === patientId) {
    return true;
  }
  
  // 2. Practitioner with treatment relationship
  if (user.practitioner) {
    // In production, check actual consent records
    const hasConsent = await checkPractitionerConsent(user.practitioner, patientId);
    if (!hasConsent) {
      throw new ConsentError(`No active consent for patient ${patientId}`);
    }
  }
  
  // 3. Check for specific consent resources
  // In production, query Consent resources
  const consentScopes = user.scopes.filter(s => s.startsWith('patient/'));
  if (consentScopes.length === 0) {
    throw new ConsentError('No patient data access scopes');
  }
  
  return true;
}

async function checkPractitionerConsent(practitionerId, patientId) {
  // In production, check:
  // 1. Active Consent resources
  // 2. Treatment relationships (Encounter, EpisodeOfCare)
  // 3. Organization-based access rules
  
  // For demo, we'll simulate consent check
  console.log(`Checking consent for practitioner ${practitionerId} to access patient ${patientId}`);
  
  // Simulate: All practitioners have consent for demo
  return true;
}

async function hasConsent(user, resource) {
  // Check if user has consent for this specific resource
  
  if (!resource) return false;
  
  // Patient resources
  if (resource.resourceType === 'Patient') {
    try {
      await checkPatientConsent(user, resource.id);
      return true;
    } catch {
      return false;
    }
  }
  
  // Resources with patient reference
  if (resource.subject?.reference) {
    const [refType, patientId] = resource.subject.reference.split('/');
    if (refType === 'Patient') {
      try {
        await checkPatientConsent(user, patientId);
        return true;
      } catch {
        return false;
      }
    }
  }
  
  // Resources with patient property
  if (resource.patient?.reference) {
    const [refType, patientId] = resource.patient.reference.split('/');
    if (refType === 'Patient') {
      try {
        await checkPatientConsent(user, patientId);
        return true;
      } catch {
        return false;
      }
    }
  }
  
  // Default: allow if no patient reference found
  return true;
}

class ConsentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConsentError';
    this.status = 403;
  }
}

export { ConsentError };