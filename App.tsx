
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChannelType, TextureState, PBRAnalysisResult } from './types';
import TextureSlot from './components/TextureSlot';
import { analyzeTextureWithAI } from './services/geminiService';
import { 
  Download, 
  Layers, 
  Wand2, 
  Trash2, 
  AlertCircle, 
  Info, 
  Maximize,
  Box,
  Gamepad2,
  Sparkles,
  Image as ImageIcon,
  Activity,
  CheckCircle2,
  SlidersHorizontal
} from 'lucide-react';

const INITIAL_TEXTURE_STATE: TextureState = {
  file: null,
  previewUrl: null,
  intensity: 1,
  inverted: false
};

const DEFAULT_PBR_PARAMS: PBRAnalysisResult = {
  isMetal: false,
  roughnessEstimate: 0.5,
  aoIntensity: 1.0,
  displacementContrast: 0.5,
  description: ''
};

type ExportResolution = 512 | 1024 | 2048 | 4096 | 8192;

const App: React.FC = () => {
  const [baseColor, setBaseColor] = useState<TextureState>({ ...INITIAL_TEXTURE_STATE });
  const [textures, setTextures] = useState<Record<ChannelType, TextureState>>({
    [ChannelType.AO]: { ...INITIAL_TEXTURE_STATE },
    [ChannelType.Metallic]: { ...INITIAL_TEXTURE_STATE, intensity: 0 },
    [ChannelType.Roughness]: { ...INITIAL_TEXTURE_STATE, intensity: 0.5 },
    [ChannelType.Displacement]: { ...INITIAL_TEXTURE_STATE, intensity: 0 },
    [ChannelType.Normal]: { ...INITIAL_TEXTURE_STATE },
    [ChannelType.Alpha]: { ...INITIAL_TEXTURE_STATE }
  });

  const [pbrParams, setPbrParams] = useState<PBRAnalysisResult>(DEFAULT_PBR_PARAMS);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [exportSize, setExportSize] = useState<ExportResolution>(2048);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const prepareImageForAI = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 512;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; }
        } else {
          if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject("Canvas context failed");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const generateProceduralMaps = useCallback(async (params: PBRAnalysisResult) => {
    if (!baseColor.previewUrl) return;

    const img = new Image();
    img.src = baseColor.previewUrl!;
    await new Promise(resolve => img.onload = resolve);

    const procCanvas = document.createElement('canvas');
    procCanvas.width = img.width;
    procCanvas.height = img.height;
    const pCtx = procCanvas.getContext('2d');
    if (!pCtx) return;

    pCtx.drawImage(img, 0, 0);
    const imageData = pCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    const generateGrayscaleMap = (processor: (l: number) => number) => {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = img.width;
      outCanvas.height = img.height;
      const outCtx = outCanvas.getContext('2d')!;
      const outData = outCtx.createImageData(img.width, img.height);
      
      for (let i = 0; i < data.length; i += 4) {
        const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const val = processor(l);
        outData.data[i] = val;
        outData.data[i + 1] = val;
        outData.data[i + 2] = val;
        outData.data[i + 3] = 255;
      }
      outCtx.putImageData(outData, 0, 0);
      return outCanvas.toDataURL('image/png');
    };

    const generateNormalMap = () => {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = img.width;
      outCanvas.height = img.height;
      const outCtx = outCanvas.getContext('2d')!;
      const outData = outCtx.createImageData(img.width, img.height);
      const strength = 1.5;

      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const getLum = (ox: number, oy: number) => {
            const px = Math.min(img.width - 1, Math.max(0, x + ox));
            const py = Math.min(img.height - 1, Math.max(0, y + oy));
            const pi = (py * img.width + px) * 4;
            return (data[pi] + data[pi + 1] + data[pi + 2]) / 3;
          };
          const tl = getLum(-1, -1); const t = getLum(0, -1); const tr = getLum(1, -1);
          const l = getLum(-1, 0); const r = getLum(1, 0);
          const bl = getLum(-1, 1); const b = getLum(0, 1); const br = getLum(1, 1);
          const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
          const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
          const nx = dx * strength;
          const ny = dy * strength;
          const nz = 128.0;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          outData.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
          outData.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
          outData.data[i + 2] = (nz / len) * 255;
          outData.data[i + 3] = 255;
        }
      }
      outCtx.putImageData(outData, 0, 0);
      return outCanvas.toDataURL('image/png');
    };

    const aoUrl = generateGrayscaleMap(l => Math.max(0, 255 - (255 - l) * params.aoIntensity));
    const metalUrl = generateGrayscaleMap(_ => params.isMetal ? 255 : 0);
    const roughUrl = generateGrayscaleMap(l => {
      const base = params.roughnessEstimate * 255;
      const variation = (l - 128) * 0.15; 
      return Math.min(255, Math.max(0, base + variation));
    });
    const dispUrl = generateGrayscaleMap(l => Math.min(255, l * params.displacementContrast));
    const normalUrl = generateNormalMap();
    const alphaUrl = generateGrayscaleMap(_ => 255);

    setTextures(prev => ({
      ...prev,
      [ChannelType.AO]: { ...prev[ChannelType.AO], previewUrl: aoUrl },
      [ChannelType.Metallic]: { ...prev[ChannelType.Metallic], previewUrl: metalUrl },
      [ChannelType.Roughness]: { ...prev[ChannelType.Roughness], previewUrl: roughUrl },
      [ChannelType.Displacement]: { ...prev[ChannelType.Displacement], previewUrl: dispUrl },
      [ChannelType.Normal]: { ...prev[ChannelType.Normal], previewUrl: normalUrl },
      [ChannelType.Alpha]: { ...prev[ChannelType.Alpha], previewUrl: alphaUrl }
    }));
  }, [baseColor.previewUrl]);

  const smartGenerate = async () => {
    if (!baseColor.file) {
      alert("Please upload a Base Color texture first.");
      return;
    }

    setIsGenerating(true);
    try {
      const aiReadyImage = await prepareImageForAI(baseColor.file);
      const result = await analyzeTextureWithAI(aiReadyImage);
      
      setPbrParams(result);
      setHasAnalyzed(true);
      await generateProceduralMaps(result);

    } catch (e) {
      console.error(e);
      alert("AI analysis failed. You can still adjust parameters manually.");
      setHasAnalyzed(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBaseUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setBaseColor({ file, previewUrl: url, intensity: 1, inverted: false });
    setHasAnalyzed(false);
  };

  const handleUpload = (type: ChannelType, file: File) => {
    const url = URL.createObjectURL(file);
    setTextures(prev => ({
      ...prev,
      [type]: { ...prev[type], file, previewUrl: url, intensity: 1 }
    }));
  };

  const handleClear = (type: ChannelType) => {
    if (textures[type].previewUrl) URL.revokeObjectURL(textures[type].previewUrl!);
    setTextures(prev => ({
      ...prev,
      [type]: { ...prev[type], file: null, previewUrl: null }
    }));
  };

  const handleUpdate = (type: ChannelType, updates: Partial<TextureState>) => {
    setTextures(prev => ({
      ...prev,
      [type]: { ...prev[type], ...updates }
    }));
  };

  const clearAll = () => {
    if (baseColor.previewUrl) URL.revokeObjectURL(baseColor.previewUrl);
    setBaseColor({ ...INITIAL_TEXTURE_STATE });
    setHasAnalyzed(false);
    setPbrParams(DEFAULT_PBR_PARAMS);
    (Object.values(textures) as TextureState[]).forEach(t => {
      if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
    });
    setTextures({
      [ChannelType.AO]: { ...INITIAL_TEXTURE_STATE },
      [ChannelType.Metallic]: { ...INITIAL_TEXTURE_STATE, intensity: 0 },
      [ChannelType.Roughness]: { ...INITIAL_TEXTURE_STATE, intensity: 0.5 },
      [ChannelType.Displacement]: { ...INITIAL_TEXTURE_STATE, intensity: 0 },
      [ChannelType.Normal]: { ...INITIAL_TEXTURE_STATE },
      [ChannelType.Alpha]: { ...INITIAL_TEXTURE_STATE }
    });
  };

  const updateParam = (key: keyof PBRAnalysisResult, value: any) => {
    const nextParams = { ...pbrParams, [key]: value };
    setPbrParams(nextParams);
    generateProceduralMaps(nextParams);
  };

  const processTextures = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = exportSize;
    const height = exportSize;

    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, width, height);

    const mainImageData = ctx.createImageData(width, height);
    const data = mainImageData.data;

    const getChannelData = async (type: ChannelType, index: number) => {
      const state = textures[type];
      if (state.previewUrl) {
        const img = await new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.src = state.previewUrl!;
        });
        const off = document.createElement('canvas');
        off.width = width; off.height = height;
        const octx = off.getContext('2d')!;
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(img, 0, 0, width, height);
        const pixels = octx.getImageData(0, 0, width, height).data;
        for (let i = 0; i < pixels.length; i += 4) {
          let val = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          val *= state.intensity;
          if (state.inverted) val = 255 - val;
          data[(i / 4) * 4 + index] = Math.min(255, Math.max(0, val));
        }
      } else {
        const constVal = state.intensity * 255;
        for (let i = 0; i < data.length; i += 4) {
          data[i + index] = Math.min(255, Math.max(0, constVal));
        }
      }
    };

    await getChannelData(ChannelType.AO, 0);
    await getChannelData(ChannelType.Metallic, 1);
    await getChannelData(ChannelType.Roughness, 2);
    await getChannelData(ChannelType.Displacement, 3);

    ctx.putImageData(mainImageData, 0, 0);
    setOutputUrl(canvas.toDataURL('image/png'));
  }, [textures, exportSize]);

  useEffect(() => {
    processTextures();
  }, [processTextures]);

  const downloadTexture = async (type: 'AOMRD' | 'NORMAL' | 'ALPHA') => {
    if (!outputUrl) return;
    
    const download = (url: string, filename: string) => {
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
    };

    if (type === 'AOMRD') {
      download(outputUrl, `T_AOMRD_${exportSize}.png`);
      return;
    }

    const targetChannel = type === 'NORMAL' ? ChannelType.Normal : ChannelType.Alpha;
    const state = textures[targetChannel];
    if (!state.previewUrl) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = exportSize;
    tempCanvas.height = exportSize;
    const tCtx = tempCanvas.getContext('2d')!;
    const img = await new Promise<HTMLImageElement>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.src = state.previewUrl!;
    });
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = 'high';
    tCtx.drawImage(img, 0, 0, exportSize, exportSize);
    
    download(tempCanvas.toDataURL('image/png'), `T_${type}_${exportSize}.png`);
  };

  const resolutionLabels: Record<ExportResolution, string> = {
    512: '512px',
    1024: '1k',
    2048: '2k',
    4096: '4k',
    8192: '8k'
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-2xl shadow-indigo-500/20">
              <Layers className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight uppercase">AOMRD Material Packer</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">UE 5.6 Optimized</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-lg mr-2">
              {(Object.keys(resolutionLabels) as unknown as ExportResolution[]).map((res) => (
                <button
                  key={res}
                  onClick={() => setExportSize(Number(res) as ExportResolution)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                    exportSize === Number(res) 
                      ? 'bg-indigo-600 text-white shadow-lg' 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  {resolutionLabels[res]}
                </button>
              ))}
            </div>

            <button 
              onClick={() => downloadTexture('AOMRD')}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Download size={18} />
              Pack AOMRD
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            
            {/* AI Generator Hero */}
            <div className="bg-gradient-to-br from-indigo-900/20 via-slate-900/40 to-slate-950 border border-indigo-500/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl group-hover:bg-indigo-600/20 transition-all duration-700"></div>
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-black flex items-center gap-3 text-white tracking-tight uppercase">
                      <Sparkles className="text-indigo-400" size={28} />
                      AI Material Solver
                    </h2>
                    <p className="text-sm text-slate-400 mt-2 max-w-md font-medium">
                      Upload a single Base Color. AI analyzes the surface properties and estimates a full PBR set.
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col xl:flex-row items-stretch gap-8">
                  {/* Upload Area */}
                  <div className="w-full xl:w-48 aspect-square rounded-2xl border-2 border-dashed border-indigo-500/20 bg-slate-950/50 flex items-center justify-center overflow-hidden group cursor-pointer relative shadow-inner shrink-0">
                    {baseColor.previewUrl ? (
                      <>
                        <img src={baseColor.previewUrl} className="w-full h-full object-cover" />
                        <button 
                          onClick={(e) => { e.stopPropagation(); setBaseColor({ ...INITIAL_TEXTURE_STATE }); setHasAnalyzed(false); }}
                          className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-900 transition-all">
                        <ImageIcon className="text-indigo-500/50 mb-3" size={40} />
                        <span className="text-[10px] uppercase font-black text-slate-600 tracking-widest">Load Albedo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleBaseUpload(e.target.files[0])} />
                      </label>
                    )}
                  </div>
                  
                  {/* Controls / Parameters Area */}
                  <div className="flex-1 w-full space-y-6">
                    {!hasAnalyzed ? (
                      <div className="h-full flex flex-col justify-center gap-4">
                        <button 
                          onClick={smartGenerate}
                          disabled={isGenerating || !baseColor.previewUrl}
                          className={`w-full py-5 px-8 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-4 transition-all shadow-2xl ${
                            isGenerating ? 'bg-slate-900 text-slate-500 animate-pulse border border-slate-800' : 
                            baseColor.previewUrl ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:translate-y-0.5' : 
                            'bg-slate-900 text-slate-700 cursor-not-allowed border border-slate-800'
                          }`}
                        >
                          <Wand2 size={22} className={isGenerating ? 'animate-spin' : ''} />
                          {isGenerating ? 'Analyzing surface...' : 'AI Solve Material'}
                        </button>
                        <div className="flex items-center justify-center gap-2 opacity-50">
                          <CheckCircle2 size={12} className="text-indigo-400" />
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                            Estimate AO, Metallic, Roughness, Normal & Displacement
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 bg-slate-950/40 p-6 rounded-2xl border border-white/5 animate-in fade-in slide-in-from-bottom-2">
                        <div className="col-span-full flex items-center gap-2 mb-2 text-indigo-400">
                          <SlidersHorizontal size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Adjust Parameters</span>
                        </div>
                        
                        {/* AO Intensity */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <span>AO Intensity</span>
                            <span className="text-indigo-400">{pbrParams.aoIntensity.toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0" max="2" step="0.05"
                            value={pbrParams.aoIntensity}
                            onChange={(e) => updateParam('aoIntensity', parseFloat(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none bg-slate-800 accent-indigo-500"
                          />
                        </div>

                        {/* Roughness Estimate */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <span>Base Roughness</span>
                            <span className="text-indigo-400">{pbrParams.roughnessEstimate.toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0" max="1" step="0.05"
                            value={pbrParams.roughnessEstimate}
                            onChange={(e) => updateParam('roughnessEstimate', parseFloat(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none bg-slate-800 accent-indigo-500"
                          />
                        </div>

                        {/* Displacement Contrast */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <span>Height Contrast</span>
                            <span className="text-indigo-400">{pbrParams.displacementContrast.toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" min="0" max="1" step="0.05"
                            value={pbrParams.displacementContrast}
                            onChange={(e) => updateParam('displacementContrast', parseFloat(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none bg-slate-800 accent-indigo-500"
                          />
                        </div>

                        {/* Metallic Toggle */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Metal Surface</span>
                          <button 
                            onClick={() => updateParam('isMetal', !pbrParams.isMetal)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                              pbrParams.isMetal ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-600'
                            }`}
                          >
                            {pbrParams.isMetal ? 'Metallic' : 'Dielectric'}
                          </button>
                        </div>

                        {pbrParams.description && (
                          <div className="col-span-full mt-4 p-3 bg-indigo-500/5 rounded-lg border border-indigo-500/10">
                            <p className="text-[10px] text-slate-400 italic">
                              <span className="font-bold text-indigo-400 not-italic mr-1 uppercase tracking-tight">AI Note:</span>
                              {pbrParams.description}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.values(ChannelType).map((type) => (
                <TextureSlot 
                  key={type}
                  type={type}
                  state={textures[type]}
                  onUpload={(file) => handleUpload(type, file)}
                  onClear={() => handleClear(type)}
                  onUpdate={(updates) => handleUpdate(type, updates)}
                />
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Maximize size={18} className="text-indigo-500" />
                  Live Pack Preview
                </h2>
                <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                  <button onClick={() => setActiveTab('edit')} className={`px-4 py-1 rounded-md text-[10px] font-black uppercase transition-all ${activeTab === 'edit' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-400'}`}>AOMRD</button>
                  <button onClick={() => setActiveTab('preview')} className={`px-4 py-1 rounded-md text-[10px] font-black uppercase transition-all ${activeTab === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-400'}`}>Stats</button>
                </div>
              </div>

              <div className="bg-slate-950 rounded-3xl border border-slate-800 p-2 shadow-2xl relative overflow-hidden aspect-square flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/5 via-transparent to-transparent opacity-50"></div>
                {activeTab === 'edit' ? (
                  <div className="w-full h-full relative p-2">
                    {outputUrl ? (
                      <img src={outputUrl} className="w-full h-full object-contain rounded-2xl shadow-2xl" alt="AOMRD" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-800 space-y-4">
                        <div className="w-16 h-16 border-2 border-slate-800 rounded-2xl flex items-center justify-center animate-pulse">
                          <Layers size={32} className="opacity-30" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">No output data</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 w-full space-y-6">
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Export Manifest</span>
                       <Activity size={16} className="text-indigo-400" />
                     </div>
                     <div className="space-y-3">
                       <div className="bg-slate-900/50 p-4 rounded-2xl flex justify-between items-center border border-slate-800">
                         <span className="text-[10px] text-slate-500 uppercase font-black">Resolution</span>
                         <span className="text-xs text-indigo-400 font-black mono">{resolutionLabels[exportSize]}</span>
                       </div>
                       <div className="bg-slate-900/50 p-4 rounded-2xl flex justify-between items-center border border-slate-800">
                         <span className="text-[10px] text-slate-500 uppercase font-black">Bit Depth</span>
                         <span className="text-xs text-indigo-400 font-black mono">8-bit / Channel</span>
                       </div>
                       <div className="bg-slate-900/50 p-4 rounded-2xl flex justify-between items-center border border-slate-800">
                         <span className="text-[10px] text-slate-500 uppercase font-black">UE Compression</span>
                         <span className="text-xs text-indigo-400 font-black mono">TC_Masks</span>
                       </div>
                     </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <button 
                  onClick={() => downloadTexture('NORMAL')}
                  disabled={!textures[ChannelType.Normal].previewUrl}
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-950 border border-slate-900 hover:border-indigo-500/50 hover:bg-slate-900 transition-all text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 disabled:opacity-20 active:scale-95"
                >
                  <Download size={14} /> Normal Map
                </button>
                <button 
                  onClick={() => downloadTexture('ALPHA')}
                  disabled={!textures[ChannelType.Alpha].previewUrl}
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-950 border border-slate-900 hover:border-indigo-500/50 hover:bg-slate-900 transition-all text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 disabled:opacity-20 active:scale-95"
                >
                  <Download size={14} /> Alpha Map
                </button>
              </div>

              <div className="mt-8 p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex gap-4 items-start">
                <AlertCircle className="text-amber-500 shrink-0" size={20} />
                <p className="text-[10px] text-amber-200/60 leading-relaxed uppercase font-black tracking-wider">
                  Engine Note: Ensure "sRGB" is disabled for both AOMRD and Normal maps to maintain linear data integrity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <canvas ref={canvasRef} className="hidden" />
      <footer className="mt-20 border-t border-slate-900 py-12 text-center">
        <div className="flex items-center justify-center gap-4 mb-4">
           <Box size={16} className="text-slate-700" />
           <Gamepad2 size={16} className="text-slate-700" />
           <Activity size={16} className="text-slate-700" />
        </div>
        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">© 2024 Unreal Engine PBR Utility • High-Performance Rendering Tools</p>
      </footer>
    </div>
  );
};

export default App;
