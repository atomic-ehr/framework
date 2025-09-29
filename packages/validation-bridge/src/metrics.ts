/**
 * Validation metrics collection and monitoring
 */

import type { HookDefinition } from '@atomic-ehr/core';
import type { ValidationMetrics } from './types.js';
import { FhirValidationError } from './types.js';

/**
 * Validation metrics collector
 */
export class ValidationMetricsCollector {
  private metrics: ValidationMetrics;
  private validationTimes: number[] = [];
  private maxSamples = 1000; // Keep last 1000 samples for average

  constructor() {
    this.metrics = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      validationsByResourceType: new Map(),
      validationErrors: new Map(),
      averageValidationTime: 0
    };
  }

  /**
   * Create metrics collection hook
   */
  createMetricsHook(): HookDefinition {
    return {
      name: 'validation-metrics',
      phase: 'preHandler',
      priority: 65, // After validation hooks
      handler: async (context: any) => {
        const startTime = Date.now();
        const resourceType = context.resourceType;
        const operation = context.operation;

        // Only collect metrics for operations that trigger validation
        if (!['create', 'update', 'patch'].includes(operation)) {
          return context;
        }

        try {
          // Validation result should be in context if validation passed
          const validationResult = (context as any).validationResult;

          if (validationResult) {
            const duration = Date.now() - startTime;
            this.recordSuccess(resourceType, duration);
          }

        } catch (error) {
          if (error instanceof FhirValidationError) {
            this.recordFailure(resourceType, error);
          }
          throw error;
        }

        return context;
      }
    };
  }

  /**
   * Record successful validation
   */
  private recordSuccess(resourceType: string, duration: number): void {
    this.metrics.totalValidations++;
    this.metrics.successfulValidations++;
    this.updateResourceTypeCount(resourceType);
    this.updateAverageTime(duration);
  }

  /**
   * Record failed validation
   */
  private recordFailure(resourceType: string, error: FhirValidationError): void {
    this.metrics.totalValidations++;
    this.metrics.failedValidations++;
    this.updateResourceTypeCount(resourceType);

    // Record error types
    error.operationOutcome.issue?.forEach(issue => {
      const count = this.metrics.validationErrors.get(issue.code) || 0;
      this.metrics.validationErrors.set(issue.code, count + 1);
    });
  }

  /**
   * Update resource type validation count
   */
  private updateResourceTypeCount(resourceType: string): void {
    if (!resourceType) return;

    const count = this.metrics.validationsByResourceType.get(resourceType) || 0;
    this.metrics.validationsByResourceType.set(resourceType, count + 1);
  }

  /**
   * Update average validation time
   */
  private updateAverageTime(duration: number): void {
    this.validationTimes.push(duration);

    // Keep only last N samples
    if (this.validationTimes.length > this.maxSamples) {
      this.validationTimes.shift();
    }

    // Calculate average
    const sum = this.validationTimes.reduce((a, b) => a + b, 0);
    this.metrics.averageValidationTime = sum / this.validationTimes.length;
  }

  /**
   * Get current metrics
   */
  getMetrics(): ValidationMetrics {
    return {
      ...this.metrics,
      validationsByResourceType: new Map(this.metrics.validationsByResourceType),
      validationErrors: new Map(this.metrics.validationErrors)
    };
  }

  /**
   * Get success rate
   */
  getSuccessRate(): number {
    if (this.metrics.totalValidations === 0) {
      return 100;
    }
    return (this.metrics.successfulValidations / this.metrics.totalValidations) * 100;
  }

  /**
   * Get failure rate
   */
  getFailureRate(): number {
    if (this.metrics.totalValidations === 0) {
      return 0;
    }
    return (this.metrics.failedValidations / this.metrics.totalValidations) * 100;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      validationsByResourceType: new Map(),
      validationErrors: new Map(),
      averageValidationTime: 0
    };
    this.validationTimes = [];
  }

  /**
   * Get metrics summary as plain object
   */
  getSummary() {
    return {
      total: this.metrics.totalValidations,
      successful: this.metrics.successfulValidations,
      failed: this.metrics.failedValidations,
      successRate: this.getSuccessRate(),
      failureRate: this.getFailureRate(),
      averageTime: this.metrics.averageValidationTime,
      byResourceType: Object.fromEntries(this.metrics.validationsByResourceType),
      errorCodes: Object.fromEntries(this.metrics.validationErrors)
    };
  }
}