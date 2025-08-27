import { defineResource, type ResourceDefinition, type HandlerContext, type HandlerResponse } from '@atomic-fhir/core';

/**
 * Observation resource with custom search aggregation
 */
export default defineResource({
  resourceType: 'Observation',
  
  handlers: {
    /**
     * Custom create - Validates vital signs and adds interpretation
     */
    async create(req: Request, context: HandlerContext): Promise<HandlerResponse> {
      const { storage, hooks, config } = context;
      const observation: any = await req.json();
      
      // Auto-interpret vital signs
      if (observation.code?.coding?.some(c => c.system === 'http://loinc.org')) {
        const loincCode = observation.code.coding.find(c => c.system === 'http://loinc.org')?.code;
        
        // Blood pressure interpretation
        if (loincCode === '85354-9' && observation.component) {
          const systolic = observation.component.find(c => 
            c.code?.coding?.some(cd => cd.code === '8480-6')
          )?.valueQuantity?.value;
          
          const diastolic = observation.component.find(c => 
            c.code?.coding?.some(cd => cd.code === '8462-4')
          )?.valueQuantity?.value;
          
          if (systolic && diastolic) {
            observation.interpretation = observation.interpretation || [];
            
            if (systolic > 140 || diastolic > 90) {
              observation.interpretation.push({
                coding: [{
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                  code: 'H',
                  display: 'High'
                }],
                text: 'Hypertension detected'
              });
            } else if (systolic < 90 || diastolic < 60) {
              observation.interpretation.push({
                coding: [{
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                  code: 'L',
                  display: 'Low'
                }],
                text: 'Hypotension detected'
              });
            } else {
              observation.interpretation.push({
                coding: [{
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                  code: 'N',
                  display: 'Normal'
                }],
                text: 'Normal blood pressure'
              });
            }
          }
        }
      }
      
      // Set effective date if not provided
      if (!observation.effectiveDateTime) {
        observation.effectiveDateTime = new Date().toISOString();
      }
      
      // Set status if not provided
      if (!observation.status) {
        observation.status = 'final';
      }
      
      // Apply hooks
      const processed = await hooks.executeBeforeCreate('Observation', observation, { req, storage });
      
      // Store
      const created = await storage.create('Observation', processed);
      
      // After hooks
      await hooks.executeAfterCreate('Observation', created, { req, storage });
      
      console.log(`📊 Observation created: ${observation.code?.coding?.[0]?.display || 'Unknown'}`);
      
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/fhir+json',
          'Location': `${config.server.url}/Observation/${created.id}`
        },
        body: created
      };
    },
    
    /**
     * Custom search - Adds aggregation statistics
     */
    async search(req, context) {
      const { storage, config } = context;
      const url = new URL(req.url);
      const searchParams = Object.fromEntries(url.searchParams);
      
      // Check for aggregation request
      const aggregate = searchParams._aggregate === 'true';
      delete searchParams._aggregate;
      
      // Perform search
      const results = await storage.search('Observation', searchParams);
      
      // Build response bundle
      const bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: results.length,
        entry: results.map(resource => ({
          fullUrl: `${config.server.url}/Observation/${resource.id}`,
          resource
        }))
      };
      
      // Add aggregation if requested
      if (aggregate && results.length > 0) {
        const stats = {
          count: results.length,
          codes: {},
          patients: new Set(),
          dateRange: {
            earliest: null,
            latest: null
          }
        };
        
        results.forEach(obs => {
          // Count by code
          const code = obs.code?.coding?.[0]?.display || 'Unknown';
          stats.codes[code] = (stats.codes[code] || 0) + 1;
          
          // Count unique patients
          if (obs.subject?.reference) {
            stats.patients.add(obs.subject.reference);
          }
          
          // Date range
          if (obs.effectiveDateTime) {
            if (!stats.dateRange.earliest || obs.effectiveDateTime < stats.dateRange.earliest) {
              stats.dateRange.earliest = obs.effectiveDateTime;
            }
            if (!stats.dateRange.latest || obs.effectiveDateTime > stats.dateRange.latest) {
              stats.dateRange.latest = obs.effectiveDateTime;
            }
          }
        });
        
        // Add stats as bundle extension
        bundle.extension = [{
          url: 'http://example.org/observation-statistics',
          valueString: {
            totalObservations: stats.count,
            uniquePatients: stats.patients.size,
            observationTypes: Object.keys(stats.codes).length,
            typeBreakdown: stats.codes,
            dateRange: stats.dateRange
          }
        }];
        
        console.log(`📈 Aggregated ${stats.count} observations for ${stats.patients.size} patients`);
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