import { describe, test, expect } from 'bun:test';
import PatientResource from '../../src/resources/Patient.js';

describe('Patient Resource', () => {
  test('should have correct resource type', () => {
    expect(PatientResource.resourceType).toBe('Patient');
  });

  test('should have required capabilities', () => {
    expect(PatientResource.capabilities).toBeDefined();
    expect(PatientResource.capabilities.create).toBe(true);
    expect(PatientResource.capabilities.read).toBe(true);
  });
});
