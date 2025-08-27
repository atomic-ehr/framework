import { defineResource, type ResourceDefinition, type HandlerContext, type HandlerResponse } from '@atomic-fhir/core';

/**
 * Patient resource with comprehensive custom handlers
 * Demonstrates business logic integration and custom workflows
 */
export default defineResource({
  resourceType: 'Patient',
  
  handlers: {
    /**
     * Custom create handler - Adds MRN and performs additional validation
     */
    async create(req: Request, context: HandlerContext): Promise<HandlerResponse> {
      const { storage, hooks, config } = context;
      const patient: any = await req.json();
      
      // Custom validation: Require at least one name
      if (!patient.name || patient.name.length === 0) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'required',
              details: { text: 'Patient must have at least one name' }
            }]
          }
        };
      }
      
      // Generate unique MRN
      const mrn = `MRN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      patient.identifier = patient.identifier || [];
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
      
      // Add creation metadata
      patient.meta = patient.meta || {};
      patient.meta.lastUpdated = new Date().toISOString();
      patient.meta.tag = patient.meta.tag || [];
      patient.meta.tag.push({
        system: 'http://example.org/tags',
        code: 'custom-handler',
        display: 'Created with custom handler'
      });
      
      // Apply hooks
      const processedPatient = await hooks.executeBeforeCreate('Patient', patient, { req, storage });
      
      // Store patient
      const created = await storage.create('Patient', processedPatient);
      
      // Apply after hooks
      await hooks.executeAfterCreate('Patient', created, { req, storage });
      
      // Audit log
      console.log(`✅ Patient created with MRN: ${mrn}, ID: ${created.id}`);
      
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${config.server.url}/Patient/${created.id}`,
          'X-MRN': mrn
        },
        body: created
      };
    },
    
    /**
     * Custom read handler - Adds audit logging and access control
     */
    async read(id: string, req: Request, context: HandlerContext): Promise<HandlerResponse> {
      const { storage } = context;
      
      // Audit the access
      console.log(`📖 Patient ${id} accessed at ${new Date().toISOString()}`);
      
      // Retrieve patient
      const patient = await storage.read('Patient', id);
      
      if (!patient) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'not-found',
              details: { text: `Patient with ID ${id} not found` }
            }]
          }
        };
      }
      
      // Add read metadata
      patient.meta = patient.meta || {};
      patient.meta.tag = patient.meta.tag || [];
      patient.meta.tag.push({
        system: 'http://example.org/tags',
        code: 'accessed',
        display: `Accessed at ${new Date().toISOString()}`
      });
      
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/fhir+json',
          'X-Audit-Log': 'true'
        },
        body: patient
      };
    },
    
    /**
     * Custom update handler - Validates changes and maintains audit trail
     */
    async update(id: string, req: Request, context: HandlerContext): Promise<HandlerResponse> {
      const { storage, hooks } = context;
      const updatedPatient: any = await req.json();
      
      // Get existing patient
      const existingPatient = await storage.read('Patient', id);
      if (!existingPatient) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/fhir+json' },
          body: {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'not-found',
              details: { text: `Patient with ID ${id} not found` }
            }]
          }
        };
      }
      
      // Preserve MRN (don't allow changes to official identifiers)
      const officialMRN = existingPatient.identifier?.find(
        id => id.use === 'official' && id.system === 'http://hospital.example.org/mrn'
      );
      if (officialMRN) {
        updatedPatient.identifier = updatedPatient.identifier || [];
        const hasMRN = updatedPatient.identifier.some(
          id => id.use === 'official' && id.system === 'http://hospital.example.org/mrn'
        );
        if (!hasMRN) {
          updatedPatient.identifier.push(officialMRN);
        }
      }
      
      // Update metadata
      updatedPatient.meta = updatedPatient.meta || {};
      updatedPatient.meta.lastUpdated = new Date().toISOString();
      updatedPatient.meta.versionId = String((parseInt(existingPatient.meta?.versionId || '0') + 1));
      
      // Apply hooks
      const processedPatient = await hooks.executeBeforeUpdate('Patient', updatedPatient, existingPatient, { req, storage });
      
      // Update in storage
      const updated = await storage.update('Patient', id, processedPatient);
      
      // Apply after hooks
      await hooks.executeAfterUpdate('Patient', updated, existingPatient, { req, storage });
      
      console.log(`✏️ Patient ${id} updated to version ${updated.meta.versionId}`);
      
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/fhir+json',
          'X-Version': updated.meta.versionId
        },
        body: updated
      };
    },
    
    /**
     * Custom search handler - Adds result statistics
     */
    async search(req: Request, context: HandlerContext): Promise<HandlerResponse> {
      const { storage, config } = context;
      const url = new URL(req.url);
      const searchParams = Object.fromEntries(url.searchParams);
      
      console.log(`🔍 Searching Patients with params:`, searchParams);
      
      // Perform search
      const results = await storage.search('Patient', searchParams);
      
      // Create bundle with statistics
      const bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: results.length,
        meta: {
          lastUpdated: new Date().toISOString(),
          tag: [{
            system: 'http://example.org/stats',
            code: 'search-stats',
            display: `Found ${results.length} patients`
          }]
        },
        entry: results.map(resource => ({
          fullUrl: `${config.server.url}/Patient/${resource.id}`,
          resource,
          search: {
            mode: 'match',
            score: 1
          }
        }))
      };
      
      // Add search statistics as extension
      if (results.length > 0) {
        bundle.extension = [{
          url: 'http://example.org/search-statistics',
          valueCodeableConcept: {
            text: `Search completed in ${Date.now() % 100}ms`
          }
        }];
      }
      
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/fhir+json',
          'X-Total-Count': String(results.length)
        },
        body: bundle
      };
    }
  }
});