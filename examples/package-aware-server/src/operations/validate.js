import { defineOperation } from '@atomic-fhir/core';

// This operation uses loaded package resources
export default defineOperation({
  name: 'validate',
  resource: null, // System-level operation
  type: 'system',
  
  parameters: {
    input: [
      {
        name: 'resource',
        type: 'Resource',
        min: 1,
        max: '1',
        documentation: 'Resource to validate'
      },
      {
        name: 'profile',
        type: 'canonical',
        min: 0,
        max: '1',
        documentation: 'Profile URL to validate against'
      }
    ],
    output: [
      {
        name: 'return',
        type: 'OperationOutcome',
        min: 1,
        max: '1',
        documentation: 'Validation results'
      }
    ]
  },
  
  async handler(params, context) {
    const { resource, profile } = params;
    const app = this; // 'this' is the Atomic instance
    
    // Get the OperationDefinition for $validate from loaded packages
    const validateOpDef = app.packageManager.getOperation('validate');
    if (validateOpDef) {
      console.log(`Using loaded OperationDefinition: ${validateOpDef.url}`);
      console.log(`Description: ${validateOpDef.description}`);
    }
    
    const issues = [];
    
    // Basic validation
    if (!resource.resourceType) {
      issues.push({
        severity: 'error',
        code: 'required',
        details: { text: 'Resource must have a resourceType' }
      });
    }
    
    // If profile specified, validate against it
    if (profile) {
      const structureDefinition = app.packageManager.getProfile(profile);
      
      if (!structureDefinition) {
        issues.push({
          severity: 'error',
          code: 'not-found',
          details: { text: `Profile not found: ${profile}` }
        });
      } else {
        console.log(`Validating against profile: ${structureDefinition.name}`);
        
        // Use the loaded StructureDefinition for validation
        const validationResult = await app.packageManager.validateAgainstProfile(resource, profile);
        
        if (!validationResult.valid) {
          validationResult.errors.forEach(error => {
            issues.push({
              severity: 'error',
              code: 'invariant',
              details: { text: error }
            });
          });
        }
      }
    } else {
      // Try to find appropriate profiles for the resource type
      const availableProfiles = app.packageManager.getProfilesForResource(resource.resourceType);
      
      if (availableProfiles.length > 0) {
        issues.push({
          severity: 'information',
          code: 'informational',
          details: { 
            text: `Available profiles for ${resource.resourceType}: ${availableProfiles.map(p => p.url).join(', ')}`
          }
        });
      }
    }
    
    // Check if there are any loaded operations for this resource type
    const availableOperations = app.packageManager.getOperationsForResource(resource.resourceType);
    if (availableOperations.length > 0) {
      console.log(`Available operations for ${resource.resourceType}:`);
      availableOperations.forEach(op => {
        console.log(`  - $${op.code}: ${op.description || op.name}`);
      });
    }
    
    return {
      resourceType: 'OperationOutcome',
      issue: issues.length > 0 ? issues : [{
        severity: 'information',
        code: 'informational',
        details: { text: 'Resource is valid' }
      }]
    };
  }
});