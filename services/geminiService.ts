
import { GoogleGenAI, Type } from "@google/genai";
import { PBRAnalysisResult, GenerationParams } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeTextureWithAI = async (dataUrl: string): Promise<PBRAnalysisResult> => {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!mimeMatch) throw new Error("Invalid format");
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { text: "Analyze this texture and provide PBR parameters (isMetal, roughness, ao, displacement) in JSON." },
        { inlineData: { mimeType: mimeMatch[1], data: mimeMatch[2] } }
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
        required: ['isMetal', 'roughnessEstimate', 'aoIntensity', 'displacementContrast', 'description']
      }
    }
  });

  return JSON.parse(response.text.trim()) as PBRAnalysisResult;
};

export const generateAIVariations = async (
  baseImageData: string | null, 
  params: GenerationParams
): Promise<string[]> => {
  const model = 'gemini-2.5-flash-image';
  
  let fullPrompt = "";
  if (params.mode === 'pattern') {
    fullPrompt = `Create a professional high-detail seamless tileable texture pattern of ${params.prompt}. 
    Category: ${params.category}. 
    Style: Flat, top-down view, centered, no perspectives, architectural texture, perfectly repeatable. 
    Format: 1024x1024, high resolution, sharp details.`;
  } else {
    fullPrompt = `Create a 3D clothing visualization of a ${params.itemType || 'garment'} made of ${params.prompt}. 
    Category: ${params.category} / ${params.mode}. 
    Presentation: On a professional white studio mannequin, clear visibility of fabric folds and style. 
    Do NOT make it tileable. This is a finished product style showcase.`;
  }

  const contents: any = { parts: [{ text: fullPrompt }] };

  if (baseImageData) {
    const mimeMatch = baseImageData.match(/^data:([^;]+);base64,(.+)$/);
    if (mimeMatch) {
      contents.parts.push({
        inlineData: { mimeType: mimeMatch[1], data: mimeMatch[2] }
      });
      contents.parts[0].text += " Use the attached image as a strict visual reference for the pattern and style.";
    }
  }

  const results: string[] = [];
  
  // Realizamos 4 llamadas para obtener 4 variaciones (Gemini genera 1 por llamada normalmente en este formato)
  // En un entorno de producción, esto se optimizaría según la cuota.
  for (let i = 0; i < 4; i++) {
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        // seed: Math.floor(Math.random() * 100000) // Variar la semilla para cada imagen
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        results.push(`data:image/png;base64,${part.inlineData.data}`);
      }
    }
  }

  return results;
};
