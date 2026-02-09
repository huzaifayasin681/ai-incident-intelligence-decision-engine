
/**
 * SIMULATED TEST FILE
 * This demonstrates how we verify Gemini's output against our Zod schema.
 */
import { describe, it, expect } from 'vitest';
import { IncidentSchema } from '../types';

describe('Incident Intelligence Engine Validation', () => {
  it('strictly adheres to the IncidentSchema when receiving a "messy" model response', () => {
    // Mocking a messy response that could come from the model
    const messyReport = {
      severity: 'high',
      risk_score: 85,
      root_cause_analysis: "The system experienced a cascade failure in the Kubernetes pod network due to overlapping CIDR ranges during the 03:00 UTC maintenance window.",
      remediation_steps: [
        "Isolate affected node group",
        "Re-provision VPC peering with unique CIDR blocks",
        "Restart CoreDNS service"
      ],
      reasoning_artifacts: "Thinking: User reported networking issues... Checking logs... Found IP conflicts... Calculating severity based on 15% packet loss... Risk score set high due to potential downtime for Tier-1 services.",
      extra_unwanted_field: "Model hallucination garbage"
    };

    // 1. Assert validation success
    const result = IncidentSchema.safeParse(messyReport);
    expect(result.success).toBe(true);

    // 2. Assert data integrity
    if (result.success) {
      expect(result.data.severity).toBe('high');
      expect(result.data.risk_score).toBe(85);
      expect(result.data.remediation_steps).toHaveLength(3);
      // Ensure extra fields are stripped if using .pick or strict handling (optional depending on use case)
      expect((result.data as any).extra_unwanted_field).toBeUndefined();
    }
  });

  it('fails validation when critical fields are missing', () => {
    const brokenReport = {
      severity: 'low',
      // Missing risk_score
      root_cause_analysis: 'Insignificant glitch'
    };

    const result = IncidentSchema.safeParse(brokenReport);
    expect(result.success).toBe(false);
  });

  it('fails validation when types are incorrect', () => {
    const invalidTypes = {
      severity: 'critical',
      risk_score: 'one hundred', // Should be number
      root_cause_analysis: 12345, // Should be string
      remediation_steps: 'Just fix it', // Should be array
      reasoning_artifacts: ''
    };

    const result = IncidentSchema.safeParse(invalidTypes);
    expect(result.success).toBe(false);
  });
});
