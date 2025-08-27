import { defineHook, type HookDefinition, type HandlerContext } from '@atomic-fhir/core';

// Patient age validation
const validateAge = defineHook({
  name: 'patient-age-validation',
  type: 'beforeCreate',
  resources: 'Patient',
  priority: 5,
  
  async handler(patient: any, context: HandlerContext): Promise<any> {
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
  
  async handler(resource: any, context: HandlerContext): Promise<any> {
    const previous = (context as any).previous;
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
  
  async handler(resource: any, context: HandlerContext): Promise<void> {
    const previous = (context as any).previous;
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