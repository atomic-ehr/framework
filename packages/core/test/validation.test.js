import { describe, expect, test } from 'bun:test';
import { Validator, ValidationError } from '../src/core/validator.js';

describe('Validator', () => {
  let validator;

  beforeEach(() => {
    validator = new Validator({ strict: true });
  });

  describe('Basic validation', () => {
    test('should validate resource with resourceType', async () => {
      const resource = {
        resourceType: 'Patient',
        name: [{ family: 'Test' }]
      };

      const result = await validator.validate(resource);
      expect(result).toBe(true);
    });

    test('should throw error for missing resourceType', async () => {
      const resource = {
        name: [{ family: 'Test' }]
      };

      expect(async () => {
        await validator.validate(resource);
      }).toThrow();
    });

    test('should validate known resource types in strict mode', async () => {
      const validResource = {
        resourceType: 'Patient'
      };

      const result = await validator.validate(validResource);
      expect(result).toBe(true);
    });

    test('should reject unknown resource types in strict mode', async () => {
      const invalidResource = {
        resourceType: 'UnknownResource'
      };

      expect(async () => {
        await validator.validate(invalidResource);
      }).toThrow();
    });
  });

  describe('Profile validation', () => {
    test('should validate against registered profile', async () => {
      const profile = {
        required: ['identifier', 'name'],
        cardinalities: {
          identifier: { min: 1, max: 2 },
          name: { min: 1 }
        }
      };

      validator.registerProfile('test-profile', profile);

      const validResource = {
        resourceType: 'Patient',
        identifier: [{ system: 'test', value: '123' }],
        name: [{ family: 'Test' }]
      };

      const result = await validator.validate(validResource, 'test-profile');
      expect(result).toBe(true);
    });

    test('should throw error for missing required fields', async () => {
      const profile = {
        required: ['identifier', 'name']
      };

      validator.registerProfile('test-profile', profile);

      const invalidResource = {
        resourceType: 'Patient',
        name: [{ family: 'Test' }]
        // Missing identifier
      };

      expect(async () => {
        await validator.validate(invalidResource, 'test-profile');
      }).toThrow();
    });

    test('should validate cardinality constraints', async () => {
      const profile = {
        cardinalities: {
          identifier: { min: 1, max: 2 }
        }
      };

      validator.registerProfile('test-profile', profile);

      const tooManyIdentifiers = {
        resourceType: 'Patient',
        identifier: [
          { system: 'test', value: '1' },
          { system: 'test', value: '2' },
          { system: 'test', value: '3' }
        ]
      };

      expect(async () => {
        await validator.validate(tooManyIdentifiers, 'test-profile');
      }).toThrow();
    });
  });

  describe('Operation validation', () => {
    test('should validate operation parameters', async () => {
      const result = await validator.validateOperation('test', { param: 'value' });
      expect(result).toBe(true);
    });
  });
});