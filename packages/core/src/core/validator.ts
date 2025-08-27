import type { ValidationConfig } from '../types/index.js';

interface Profile {
  required?: string[];
  cardinalities?: Record<string, { min?: number; max?: number }>;
}

export class Validator {
  private config: ValidationConfig;
  private profiles: Map<string, Profile>;

  constructor(config: ValidationConfig = {}) {
    this.config = config;
    this.profiles = new Map();
  }

  async validate(resource: any, profileUrl?: string): Promise<boolean> {
    // Basic FHIR validation
    if (!resource.resourceType) {
      throw new ValidationError('Resource must have a resourceType');
    }

    // Check if resource type is valid
    const validResourceTypes = [
      'Patient', 'Observation', 'Encounter', 'Condition', 'Procedure',
      'Medication', 'MedicationRequest', 'AllergyIntolerance', 'Immunization',
      'DiagnosticReport', 'Organization', 'Practitioner', 'Location',
      'Device', 'Bundle', 'OperationOutcome', 'CapabilityStatement'
    ];

    if (!validResourceTypes.includes(resource.resourceType)) {
      if (this.config.strict) {
        throw new ValidationError(`Invalid resourceType: ${resource.resourceType}`);
      }
    }

    // Validate against profile if provided
    if (profileUrl && this.profiles.has(profileUrl)) {
      const profile = this.profiles.get(profileUrl)!;
      await this.validateAgainstProfile(resource, profile);
    }

    return true;
  }

  async validateAgainstProfile(resource: any, profile: Profile): Promise<boolean> {
    // Basic profile validation
    // In a real implementation, this would check cardinalities, 
    // value sets, invariants, etc.
    
    // Check required elements
    if (profile.required) {
      for (const field of profile.required) {
        if (!resource[field]) {
          throw new ValidationError(`Required field missing: ${field}`);
        }
      }
    }

    // Check cardinalities
    if (profile.cardinalities) {
      for (const [field, cardinality] of Object.entries(profile.cardinalities)) {
        const value = resource[field];
        if (cardinality.min && (!value || (Array.isArray(value) && value.length < cardinality.min))) {
          throw new ValidationError(`Field ${field} requires at least ${cardinality.min} value(s)`);
        }
        if (cardinality.max && Array.isArray(value) && value.length > cardinality.max) {
          throw new ValidationError(`Field ${field} allows at most ${cardinality.max} value(s)`);
        }
      }
    }

    return true;
  }

  registerProfile(url: string, profile: Profile): void {
    this.profiles.set(url, profile);
  }

  async validateOperation(_operationName: string, _params: any): Promise<boolean> {
    // Validate operation parameters
    // This would check against OperationDefinition in a real implementation
    return true;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}