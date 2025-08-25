import { defineHook } from '@atomic/framework';

// Patient age validation
const validateAge = defineHook({
  name: 'patient-age-validation',
  type: 'beforeCreate',
  resources: 'Patient',
  priority: 5,
  description: 'Validate patient age is realistic',
  
  async handler(patient, context) {
    if (patient.birthDate) {
      const birthDate = new Date(patient.birthDate);
      const now = new Date();
      
      if (birthDate > now) {
        throw new Error('Birth date cannot be in the future');
      }
      
      const age = Math.floor((now - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      if (age > 150) {
        throw new Error('Age seems unrealistic (>150 years)');
      }
    }
    return patient;
  }
});

// Preserve identifiers on update
const preserveIdentifiers = defineHook({
  name: 'preserve-patient-identifiers',
  type: 'beforeUpdate',
  resources: 'Patient',
  priority: 10,
  description: 'Preserve patient identifiers that should not change',
  
  async handler(resource, previous, context) {
    console.log(`Updating patient ${resource.id}`);
    
    // Preserve certain fields that shouldn't change
    resource.identifier = previous.identifier;
    
    return resource;
  }
});

// Check for significant changes
const auditNameChanges = defineHook({
  name: 'audit-patient-name-changes',
  type: 'afterUpdate',
  resources: 'Patient',
  priority: 0,
  description: 'Audit significant patient changes',
  
  async handler(resource, previous, context) {
    console.log(`Patient ${resource.id} updated`);
    
    // Check for significant changes
    if (previous.name?.[0]?.family !== resource.name?.[0]?.family) {
      console.log('⚠️ Patient name changed, may need to notify systems');
      // In production, create an AuditEvent or send notifications
    }
  }
});

// Export multiple hooks
export default [
  validateAge,
  preserveIdentifiers,
  auditNameChanges
];