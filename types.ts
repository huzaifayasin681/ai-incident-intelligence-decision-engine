
import { z } from 'zod';

export const IncidentSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  risk_score: z.number().min(0).max(100),
  root_cause_analysis: z.string(),
  remediation_steps: z.array(z.string()),
  reasoning_artifacts: z.string(),
  impact_radius: z.string().optional(),
  threat_classification: z.string().optional(),
});

export type IncidentAnalysis = z.infer<typeof IncidentSchema>;

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { uri: string; title: string };
}

export interface IncidentReport {
  id: string;
  timestamp: string;
  raw_input: string;
  analysis: IncidentAnalysis;
  media_url?: string;
  media_type?: string;
  grounding_sources?: GroundingChunk[];
}

export enum SeverityColor {
  low = 'bg-green-300',
  medium = 'bg-yellow-300',
  high = 'bg-orange-300',
  critical = 'bg-red-400',
}
