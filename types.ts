
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

export interface AOMRDConfig {
  width: number;
  height: number;
  flipGreen: boolean;
}
