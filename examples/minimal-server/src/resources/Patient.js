import { defineResource } from '@atomic-fhir/core';

// Example of a Patient resource with a custom create handler
export default defineResource({
  resourceType: 'Patient',
  
  // Custom handlers for CRUD operations
  handlers: {
    // Custom create implementation
    async create(req, context) {
      const { storage, hooks, validator, config } = context;
      
      // Parse the request body
      const patient = await req.json();
      
      // Custom logic: Add a business identifier
      if (!patient.identifier) {
        patient.identifier = [];
      }
      
      // Generate a Medical Record Number (MRN)
      const mrn = `MRN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      patient.identifier.push({
        system: 'http://hospital.example.org/mrn',
        value: mrn,
        use: 'official',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'MR',
            display: 'Medical record number'
          }]
        }
      });
      
      // Custom validation: Ensure patient has a name
      if (!patient.name || patient.name.length === 0) {
        return {
          status: 400,
          body: { 
            error: 'Patient must have at least one name' 
          }
        };
      }
      
      // Add custom metadata
      patient.meta = patient.meta || {};
      patient.meta.tag = patient.meta.tag || [];
      patient.meta.tag.push({
        system: 'http://example.org/tags',
        code: 'custom-created',
        display: 'Created with custom handler'
      });
      
      // Apply standard hooks
      const processedPatient = await hooks.executeBeforeCreate('Patient', patient, { req, storage });
      
      // Store the patient
      const created = await storage.create('Patient', processedPatient);
      
      // Apply after hooks
      await hooks.executeAfterCreate('Patient', created, { req, storage });
      
      // Log creation for audit
      console.log(`🎉 Custom Patient created with MRN: ${mrn}`);
      
      // Return FHIR-compliant response
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${config.server.url}/Patient/${created.id}`,
          'X-Custom-Handler': 'true'  // Custom header to indicate custom handler was used
        },
        body: created
      };
    }
    
    // You can also override other operations:
    // read: async (id, req, context) => { ... },
    // update: async (id, req, context) => { ... },
    // delete: async (id, req, context) => { ... },
    // search: async (req, context) => { ... }
  }
});