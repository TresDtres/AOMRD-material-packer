
import { GoogleGenAI, Type } from "@google/genai";
import { PBRAnalysisResult } from "../types";

export const analyzeTextureWithAI = async (dataUrl: string): Promise<PBRAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Robust extraction of MIME type and base64 data
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!mimeMatch) {
    throw new Error("Invalid image data format. Expected a base64 data URL.");
  }
  
  const mimeType = mimeMatch[1];
  const base64Data = mimeMatch[2];

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          text: `Analyze this material texture and provide PBR parameters for Unreal Engine 5.
          Provide estimates for:
          1. isMetal: boolean (True if it's a conductive metal like chrome, gold, or brushed steel).
          2. roughnessEstimate: number (0.0 to 1.0, base level of micro-surface roughness).
          3. aoIntensity: number (0.0 to 1.0, how much the dark areas should contribute to occlusion).
          4. displacementContrast: number (0.0 to 1.0, how much height variation is expected).
          5. description: string (Briefly explain why these values were chosen).
          
          Respond strictly in JSON format.`
        },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isMetal: { type: Type.BOOLEAN },
          roughnessEstimate: { type: Type.NUMBER },
          aoIntensity: { type: Type.NUMBER },
          displacementContrast: { type: Type.NUMBER },
          description: { type: Type.STRING }
        },
        required: ['isMetal', 'roughnessEstimate', 'aoIntensity', 'displacementContrast', 'description'],
        propertyOrdering: ['isMetal', 'roughnessEstimate', 'aoIntensity', 'displacementContrast', 'description']
      }
    }
  });

  try {
    const text = response.text;
    if (!text) throw new Error("No text response from AI");
    return JSON.parse(text.trim()) as PBRAnalysisResult;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("AI Analysis failed to return valid JSON metadata.");
  }
};
