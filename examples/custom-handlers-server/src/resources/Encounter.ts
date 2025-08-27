import { defineResource, type ResourceDefinition, type HandlerContext, type HandlerResponse } from '@atomic-fhir/core';

/**
 * Encounter resource with custom business rules
 */
export default defineResource({
  resourceType: 'Encounter',
  
  handlers: {
    /**
     * Custom create - Enforces business rules for encounters
     */
    async create(req: Request, context: HandlerContext): Promise<HandlerResponse> {
      const { storage, hooks, config } = context;
      const encounter: any = await req.json();
      
      // Business rule: Encounters must have a patient
      if (!encounter.subject?.reference) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'business-rule',
              details: { text: 'Encounter must have a patient (subject)' }
            }]
          }
        };
      }
      
      // Business rule: Active encounters cannot overlap for the same patient
      if (encounter.status === 'in-progress' || encounter.status === 'arrived') {
        const existingEncounters = await storage.search('Encounter', {
          patient: encounter.subject.reference.split('/')[1],
          status: 'in-progress,arrived'
        });
        
        if (existingEncounters.length > 0) {
          return {
            status: 409,
            headers: { 'Content-Type': 'application/fhir+json' },
            body: {
              resourceType: 'OperationOutcome',
              issue: [{
                severity: 'error',
                code: 'conflict',
                details: { 
                  text: `Patient already has an active encounter (ID: ${existingEncounters[0].id})`
                }
              }]
            }
          };
        }
      }
      
      // Auto-generate encounter identifier
      if (!encounter.identifier) {
        encounter.identifier = [];
      }
      encounter.identifier.push({
        system: 'http://hospital.example.org/encounter-id',
        value: `ENC-${Date.now()}`,
        use: 'official'
      });
      
      // Set period start if status is in-progress but no period
      if (encounter.status === 'in-progress' && !encounter.period) {
        encounter.period = {
          start: new Date().toISOString()
        };
      }
      
      // Apply hooks
      const processed = await hooks.executeBeforeCreate('Encounter', encounter, { req, storage });
      
      // Store
      const created = await storage.create('Encounter', processed);
      
      // After hooks
      await hooks.executeAfterCreate('Encounter', created, { req, storage });
      
      console.log(`🏥 Encounter created: ${encounter.identifier[0].value}, Status: ${encounter.status}`);
      
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${config.server.url}/Encounter/${created.id}`
        },
        body: created
      };
    },
    
    /**
     * Custom update - Handle status transitions
     */
    async update(id, req, context) {
      const { storage, hooks } = context;
      const updatedEncounter = await req.json();
      
      // Get existing encounter
      const existing = await storage.read('Encounter', id);
      if (!existing) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'not-found',
              details: { text: `Encounter ${id} not found` }
            }]
          }
        };
      }
      
      // Business rule: Cannot reopen finished encounters
      if (existing.status === 'finished' && 
          (updatedEncounter.status === 'in-progress' || 
           updatedEncounter.status === 'arrived')) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'business-rule',
              details: { text: 'Cannot reopen a finished encounter' }
            }]
          }
        };
      }
      
      // Auto-set period end when finishing
      if (updatedEncounter.status === 'finished' && !updatedEncounter.period?.end) {
        updatedEncounter.period = updatedEncounter.period || existing.period || {};
        updatedEncounter.period.end = new Date().toISOString();
      }
      
      // Apply hooks
      const processed = await hooks.executeBeforeUpdate('Encounter', updatedEncounter, existing, { req, storage });
      
      // Update
      const updated = await storage.update('Encounter', id, processed);
      
      // After hooks
      await hooks.executeAfterUpdate('Encounter', updated, existing, { req, storage });
      
      console.log(`✏️ Encounter ${id} updated: ${existing.status} → ${updated.status}`);
      
      return {
        status: 200,
        headers: { 'Content-Type': 'application/fhir+json' },
        body: updated
      };
    },
    
    /**
     * Custom delete - Prevent deletion of in-progress encounters
     */
    async delete(id, req, context) {
      const { storage, hooks } = context;
      
      // Get encounter
      const encounter = await storage.read('Encounter', id);
      if (!encounter) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'not-found',
              details: { text: `Encounter ${id} not found` }
            }]
          }
        };
      }
      
      // Business rule: Cannot delete active encounters
      if (encounter.status === 'in-progress' || encounter.status === 'arrived') {
        return {
          status: 409,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'business-rule',
              details: { text: 'Cannot delete an active encounter. Please finish it first.' }
            }]
          }
        };
      }
      
      // Apply hooks
      await hooks.executeBeforeDelete('Encounter', encounter, { req, storage });
      
      // Delete
      await storage.delete('Encounter', id);
      
      // After hooks
      await hooks.executeAfterDelete('Encounter', encounter, { req, storage });
      
      console.log(`🗑️ Encounter ${id} deleted`);
      
      return {
        status: 204,
        headers: {}
      };
    }
  }
});