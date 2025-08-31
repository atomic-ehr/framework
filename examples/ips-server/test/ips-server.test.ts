import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Atomic, type AtomicConfig } from '@atomic-fhir/core';
import { IPSModule } from '@atomic-fhir/module-ips';
import type { Server } from 'bun';

describe('IPS Server', () => {
  let app: Atomic;
  let server: Server;
  const baseUrl = 'http://localhost:3011';
  
  beforeAll(async () => {
    // Create server with IPS module
    app = new Atomic({
      server: {
        name: 'IPS Test Server',
        version: '1.0.0',
        fhirVersion: '4.0.1',
        port: 3011
      },
      modules: { 
        ips: new IPSModule({version: '1.0.0'}) 
      },
      packages: [
        {
          package: 'hl7.fhir.r4.core',
          version: '4.0.1',
          npmRegistry: 'https://get-ig.org'
        }
      ]
    } satisfies AtomicConfig);
    
    server = await app.start();
  });
  
  afterAll(async () => {
    server?.stop();
  });
  
  describe('Server Startup', () => {
    it('should start server successfully', async () => {
      const response = await fetch(`${baseUrl}/metadata`);
      expect(response.status).toBe(200);
      
      const metadata = await response.json();
      expect(metadata.resourceType).toBe('CapabilityStatement');
      expect(metadata.status).toBe('active');
      expect(metadata.fhirVersion).toBe('4.0.1');
    });
    
    it('should have IPS module loaded', async () => {
      const response = await fetch(`${baseUrl}/metadata`);
      const metadata = await response.json();
      
      // Check for Patient resource with $summary operation
      const patientResource = metadata.rest[0].resource.find(
        (r: any) => r.type === 'Patient'
      );
      expect(patientResource).toBeDefined();
      
      // Check for $summary operation
      const summaryOperation = patientResource.operation?.find(
        (op: any) => op.name === 'summary'
      );
      expect(summaryOperation).toBeDefined();
    });
  });
  
  describe('Resource Creation', () => {
    let patientId: string;
    let observationId: string;
    
    it('should create a Patient resource', async () => {
      const patient = {
        resourceType: 'Patient',
        identifier: [{
          system: 'http://example.org/test',
          value: 'test-patient-001'
        }],
        name: [{
          use: 'official',
          family: 'TestFamily',
          given: ['TestGiven']
        }],
        gender: 'male',
        birthDate: '1980-01-01',
        address: [{
          use: 'home',
          line: ['123 Test Street'],
          city: 'Test City',
          state: 'TS',
          postalCode: '12345',
          country: 'US'
        }]
      };
      
      const response = await fetch(`${baseUrl}/Patient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json'
        },
        body: JSON.stringify(patient)
      });
      
      expect(response.status).toBe(201);
      
      const createdPatient = await response.json();
      expect(createdPatient.resourceType).toBe('Patient');
      expect(createdPatient.id).toBeDefined();
      expect(createdPatient.name[0].family).toBe('TestFamily');
      
      patientId = createdPatient.id;
    });
    
    it('should create an Observation resource', async () => {
      const observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '8867-4',
            display: 'Heart rate'
          }],
          text: 'Heart rate'
        },
        subject: {
          reference: `Patient/${patientId}`
        },
        effectiveDateTime: '2024-01-15T10:30:00Z',
        valueQuantity: {
          value: 72,
          unit: 'beats/minute',
          system: 'http://unitsofmeasure.org',
          code: '/min'
        }
      };
      
      const response = await fetch(`${baseUrl}/Observation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json'
        },
        body: JSON.stringify(observation)
      });
      
      expect(response.status).toBe(201);
      
      const createdObservation = await response.json();
      expect(createdObservation.resourceType).toBe('Observation');
      expect(createdObservation.id).toBeDefined();
      expect(createdObservation.code.coding[0].code).toBe('8867-4');
      expect(createdObservation.valueQuantity.value).toBe(72);
      
      observationId = createdObservation.id;
    });
    
    it('should read created Patient', async () => {
      const response = await fetch(`${baseUrl}/Patient/${patientId}`);
      expect(response.status).toBe(200);
      
      const patient = await response.json();
      expect(patient.resourceType).toBe('Patient');
      expect(patient.id).toBe(patientId);
      expect(patient.name[0].family).toBe('TestFamily');
    });
    
    it('should read created Observation', async () => {
      const response = await fetch(`${baseUrl}/Observation/${observationId}`);
      expect(response.status).toBe(200);
      
      const observation = await response.json();
      expect(observation.resourceType).toBe('Observation');
      expect(observation.id).toBe(observationId);
      expect(observation.subject.reference).toBe(`Patient/${patientId}`);
    });
  });
  
  describe('$summary Operation', () => {
    let patientId: string;
    
    beforeAll(async () => {
      // Create a patient with more complete data for IPS summary
      const patient = {
        resourceType: 'Patient',
        identifier: [{
          system: 'http://example.org/ips-test',
          value: 'ips-test-patient-001'
        }],
        name: [{
          use: 'official',
          family: 'IPSTest',
          given: ['John', 'Michael']
        }],
        gender: 'male',
        birthDate: '1975-05-15',
        address: [{
          use: 'home',
          line: ['456 IPS Avenue'],
          city: 'Summary City',
          state: 'SC',
          postalCode: '54321',
          country: 'US'
        }],
        telecom: [{
          system: 'phone',
          value: '+1-555-123-4567',
          use: 'home'
        }]
      };
      
      const response = await fetch(`${baseUrl}/Patient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json'
        },
        body: JSON.stringify(patient)
      });
      
      const createdPatient = await response.json();
      patientId = createdPatient.id;
      
      // Create some clinical data for the patient
      const observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '8310-5',
            display: 'Body temperature'
          }]
        },
        subject: {
          reference: `Patient/${patientId}`
        },
        effectiveDateTime: '2024-01-20T14:00:00Z',
        valueQuantity: {
          value: 37.5,
          unit: 'C',
          system: 'http://unitsofmeasure.org',
          code: 'Cel'
        }
      };
      
      await fetch(`${baseUrl}/Observation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json'
        },
        body: JSON.stringify(observation)
      });
    });
    
    it('should generate IPS summary for patient', async () => {
      const response = await fetch(`${baseUrl}/Patient/${patientId}/$summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json'
        }
      });
      
      expect(response.status).toBe(200);
      
      const ipsBundle = await response.json();
      expect(ipsBundle.resourceType).toBe('Bundle');
      expect(ipsBundle.type).toBe('document');
      
      // Check for Composition as first entry
      expect(ipsBundle.entry).toBeDefined();
      expect(ipsBundle.entry.length).toBeGreaterThan(0);
      
      const composition = ipsBundle.entry[0].resource;
      expect(composition.resourceType).toBe('Composition');
      expect(composition.type.coding[0].code).toBe('60591-5'); // Patient summary Document
      expect(composition.subject.reference).toBe(`Patient/${patientId}`);
      
      // Check that patient is included in the bundle
      const patientEntry = ipsBundle.entry.find(
        (e: any) => e.resource.resourceType === 'Patient' && e.resource.id === patientId
      );
      expect(patientEntry).toBeDefined();
    });
    
    it('should handle $summary operation with parameters', async () => {
      const response = await fetch(`${baseUrl}/Patient/${patientId}/$summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json'
        },
        body: JSON.stringify({
          resourceType: 'Parameters',
          parameter: [{
            name: 'profile',
            valueString: 'http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips'
          }]
        })
      });
      
      expect(response.status).toBe(200);
      
      const ipsBundle = await response.json();
      expect(ipsBundle.resourceType).toBe('Bundle');
      expect(ipsBundle.type).toBe('document');
    });
    
    it('should return 404 for non-existent patient $summary', async () => {
      const response = await fetch(`${baseUrl}/Patient/non-existent-id/$summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json'
        }
      });
      
      expect(response.status).toBe(404);
    });
  });
});