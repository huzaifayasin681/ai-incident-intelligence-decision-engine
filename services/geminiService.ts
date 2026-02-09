
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import { IncidentSchema, IncidentAnalysis, GroundingChunk } from "../types";

const ANALYZER_MODEL = 'gemini-2.5-flash'; 
const STREAMER_MODEL = 'gemini-3-flash-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const controlInfrastructureTool: FunctionDeclaration = {
  name: 'control_infrastructure',
  parameters: {
    type: Type.OBJECT,
    description: 'Execute a technical command on the infrastructure to mitigate an incident.',
    properties: {
      action: {
        type: Type.STRING,
        description: 'The specific action to take, e.g., ISOLATE_NODE, RESET_GATEWAY, REPLICATE_PODS.',
      },
      target: {
        type: Type.STRING,
        description: 'The identifier of the target resource.',
      },
    },
    required: ['action', 'target'],
  },
};

function extractJson(text: string): any {
  let cleaned = text.trim();
  const markdownRegex = /```json\s*([\s\S]*?)\s*```/;
  const markdownMatch = cleaned.match(markdownRegex);
  if (markdownMatch && markdownMatch[1]) cleaned = markdownMatch[1].trim();
  else {
    const braceRegex = /(\{[\s\S]*\})/;
    const braceMatch = cleaned.match(braceRegex);
    if (braceMatch && braceMatch[0]) cleaned = braceMatch[0].trim();
  }
  cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');
  try {
    const parsed = JSON.parse(cleaned);
    return {
      severity: parsed.severity || 'medium',
      risk_score: typeof parsed.risk_score === 'number' ? parsed.risk_score : 50,
      root_cause_analysis: parsed.root_cause_analysis || 'Analysis pending...',
      remediation_steps: Array.isArray(parsed.remediation_steps) ? parsed.remediation_steps : ['Check logs'],
      reasoning_artifacts: parsed.reasoning_artifacts || 'No reasoning captured.',
      impact_radius: parsed.impact_radius || 'Localized',
      threat_classification: parsed.threat_classification || 'Standard Issue'
    };
  } catch (e) {
    throw new Error("Intelligence engine returned malformed data. Structure failed validation.");
  }
}

export async function analyzeIncident(
  text: string, 
  base64Data?: string, 
  mimeType?: string,
  location?: { latitude: number, longitude: number },
  thinkingBudget: number = 24576
): Promise<{ analysis: IncidentAnalysis; grounding: GroundingChunk[]; toolCalls: any[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const prompt = `
    SYSTEM: You are the Lead Incident Architect.
    TASK: Analyze the input and return a STRICT JSON object.
    
    REQUIRED JSON FORMAT:
    {
      "severity": "low" | "medium" | "high" | "critical",
      "risk_score": number (0-100),
      "root_cause_analysis": "string",
      "remediation_steps": ["string"],
      "reasoning_artifacts": "string",
      "impact_radius": "string",
      "threat_classification": "string"
    }

    INPUT: ${text}
  `;

  const contents: any[] = [{ text: prompt }];
  if (base64Data && mimeType) {
    contents.push({ inlineData: { data: base64Data, mimeType: mimeType } });
  }

  const response = await ai.models.generateContent({
    model: ANALYZER_MODEL,
    contents: { parts: contents },
    config: {
      temperature: 0.1,
      thinkingConfig: { thinkingBudget },
      tools: [{ googleSearch: {} }, { googleMaps: {} }, { functionDeclarations: [controlInfrastructureTool] }],
      toolConfig: location ? {
        retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } }
      } : undefined,
    },
  });

  const analysis = IncidentSchema.parse(extractJson(response.text || ''));
  const grounding: GroundingChunk[] = [];
  const metadata = response.candidates?.[0]?.groundingMetadata;
  if (metadata?.groundingChunks) {
    metadata.groundingChunks.forEach((c: any) => {
      if (c.web) grounding.push({ web: { uri: c.web.uri, title: c.web.title } });
      if (c.maps) grounding.push({ maps: { uri: c.maps.uri, title: c.maps.title } });
    });
  }

  return { analysis, grounding, toolCalls: response.functionCalls || [] };
}

export async function generateSimulation(description: string): Promise<string> {
  // Always create fresh AI instance to catch updated API Key from environment
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: `Technical schematic video showing cascading node failure across a network grid. Style: Glitch, infrared, dark background. Incident context: ${description}`,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(r => setTimeout(r, 8000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation yielded no results.");
  
  const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Failed to download simulation video");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function generateBriefingAudio(analysis: IncidentAnalysis): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  // Keep dialogue short for faster generation
  const prompt = `TTS this short forensic exchange:
    Commander: Status on incident 7-X?
    Analyst: Priority ${analysis.severity}. Root cause: ${analysis.root_cause_analysis}. Risk ${analysis.risk_score}%.
    Commander: Protocols?
    Analyst: Initiated: ${analysis.remediation_steps.slice(0, 2).join(', ')}.`;

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            { speaker: 'Commander', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            { speaker: 'Analyst', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
          ]
        }
      }
    }
  });

  const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) throw new Error("Audio generation failed");
  return base64;
}

export async function* streamIncidentAnalysis(text: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const responseStream = await ai.models.generateContentStream({
    model: STREAMER_MODEL,
    contents: `You are a forensic terminal. Output technical logs for: ${text}. 
    CRITICAL: NO MARKDOWN. NO ASTERISKS. NO BOLDING.
    Format: [LOG] [STEP] description...
    Output raw plain text only.`,
    config: { thinkingConfig: { thinkingBudget: 15000 } }
  });
  for await (const chunk of responseStream) {
    if (chunk.text) {
      // Robust filtering of markdown characters
      yield chunk.text.replace(/[*#_`]/g, '');
    }
  }
}
