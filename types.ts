
export enum ChannelType {
  AO = 'AO',
  Metallic = 'Metallic',
  Roughness = 'Roughness',
  Displacement = 'Displacement',
  Normal = 'Normal',
  Alpha = 'Alpha'
}

export interface TextureState {
  file: File | null;
  previewUrl: string | null;
  intensity: number;
  inverted: boolean;
}

export interface PBRAnalysisResult {
  isMetal: boolean;
  roughnessEstimate: number;
  aoIntensity: number;
  displacementContrast: number;
  description: string;
  hasAlpha?: boolean;
}

export interface GenerationParams {
  prompt: string;
  mode: 'pattern' | 'style';
  category: 'fabric' | 'wood' | 'embroidery' | 'tattoo' | 'drawing' | 'clothing';
  itemType?: string; // Para el modo estilo: 'sweater', 'skirt', etc.
}

export interface AOMRDConfig {
  width: number;
  height: number;
  flipGreen: boolean;
}
