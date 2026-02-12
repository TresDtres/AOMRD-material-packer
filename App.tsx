
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChannelType, TextureState, PBRAnalysisResult, GenerationParams } from './types';
import TextureSlot from './components/TextureSlot';
import { analyzeTextureWithAI, generateAIVariations } from './services/geminiService';
import { 
  Download, 
  Layers, 
  Wand2, 
  Trash2, 
  AlertCircle, 
  Maximize,
  Box,
  Gamepad2,
  Sparkles,
  Image as ImageIcon,
  Activity,
  SlidersHorizontal,
  ChevronRight,
  LayoutGrid,
  Shirt,
  Grid3X3,
  Loader2,
  CheckCircle2
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
  const [currentView, setCurrentView] = useState<'generator' | 'packer'>('generator');
  const [genParams, setGenParams] = useState<GenerationParams>({
    prompt: '',
    mode: 'pattern',
    category: 'fabric',
    itemType: 'sweater'
  });
  const [genInputImage, setGenInputImage] = useState<string | null>(null);
  const [variations, setVariations] = useState<string[]>([]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Helper to load image properly
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleRunGeneration = async () => {
    if (!genParams.prompt && !genInputImage) {
      alert("Por favor, introduce un prompt o una imagen de referencia.");
      return;
    }
    setIsGeneratingImages(true);
    setVariations([]);
    try {
      const results = await generateAIVariations(genInputImage, genParams);
      setVariations(results);
    } catch (e) {
      console.error(e);
      alert("Error al generar variaciones de IA.");
    } finally {
      setIsGeneratingImages(false);
    }
  };

  const sendToPacker = (imageUrl: string) => {
    setBaseColor({ file: null, previewUrl: imageUrl, intensity: 1, inverted: false });
    setCurrentView('packer');
    smartAnalyzeOnly(imageUrl);
  };

  const generateProceduralMaps = async (params: PBRAnalysisResult, url: string) => {
    try {
      const img = await loadImage(url);
      const procCanvas = document.createElement('canvas');
      procCanvas.width = img.width;
      procCanvas.height = img.height;
      const pCtx = procCanvas.getContext('2d', { willReadFrequently: true });
      if (!pCtx) return;

      pCtx.drawImage(img, 0, 0);
      const imageData = pCtx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      const createMap = (processor: (l: number) => number) => {
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

      const createNormal = () => {
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
            const dx = (getLum(1, -1) + 2 * getLum(1, 0) + getLum(1, 1)) - (getLum(-1, -1) + 2 * getLum(-1, 0) + getLum(-1, 1));
            const dy = (getLum(-1, 1) + 2 * getLum(0, 1) + getLum(1, 1)) - (getLum(-1, -1) + 2 * getLum(0, -1) + getLum(1, -1));
            const nx = dx * strength; const ny = dy * strength; const nz = 128.0;
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

      setTextures({
        [ChannelType.AO]: { ...INITIAL_TEXTURE_STATE, previewUrl: createMap(l => Math.max(0, 255 - (255 - l) * params.aoIntensity)) },
        [ChannelType.Metallic]: { ...INITIAL_TEXTURE_STATE, previewUrl: createMap(_ => params.isMetal ? 255 : 0) },
        [ChannelType.Roughness]: { ...INITIAL_TEXTURE_STATE, previewUrl: createMap(l => Math.min(255, Math.max(0, params.roughnessEstimate * 255 + (l - 128) * 0.15))) },
        [ChannelType.Displacement]: { ...INITIAL_TEXTURE_STATE, previewUrl: createMap(l => Math.min(255, l * params.displacementContrast)) },
        [ChannelType.Normal]: { ...INITIAL_TEXTURE_STATE, previewUrl: createNormal() },
        [ChannelType.Alpha]: { ...INITIAL_TEXTURE_STATE, previewUrl: createMap(_ => 255) }
      });
    } catch (e) {
      console.error("Error generating maps", e);
    }
  };

  const smartAnalyzeOnly = async (imageUrl: string) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeTextureWithAI(imageUrl);
      setPbrParams(result);
      setHasAnalyzed(true);
      await generateProceduralMaps(result, imageUrl);
    } catch (e) {
      console.error("AI Analysis failed", e);
      setHasAnalyzed(true);
      await generateProceduralMaps(DEFAULT_PBR_PARAMS, imageUrl);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processTextures = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    canvas.width = exportSize;
    canvas.height = exportSize;
    const mainImageData = ctx.createImageData(exportSize, exportSize);
    const data = mainImageData.data;

    // Default fully transparent black
    for (let i = 0; i < data.length; i++) data[i] = 0;

    const packChannel = async (type: ChannelType, offset: number) => {
      const state = textures[type];
      if (!state.previewUrl) {
        const val = state.intensity * 255;
        for (let i = 0; i < data.length; i += 4) data[i + offset] = val;
        return;
      }
      const img = await loadImage(state.previewUrl);
      const off = document.createElement('canvas');
      off.width = exportSize; off.height = exportSize;
      const octx = off.getContext('2d')!;
      octx.drawImage(img, 0, 0, exportSize, exportSize);
      const pixels = octx.getImageData(0, 0, exportSize, exportSize).data;
      for (let i = 0; i < pixels.length; i += 4) {
        let val = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        val *= state.intensity;
        if (state.inverted) val = 255 - val;
        data[(i / 4) * 4 + offset] = Math.min(255, Math.max(0, val));
      }
    };

    // AOMRD Channels: R=AO, G=Metal, B=Roughness, A=Displacement
    await packChannel(ChannelType.AO, 0);
    await packChannel(ChannelType.Metallic, 1);
    await packChannel(ChannelType.Roughness, 2);
    await packChannel(ChannelType.Displacement, 3);

    ctx.putImageData(mainImageData, 0, 0);
    setOutputUrl(canvas.toDataURL('image/png'));
  }, [textures, exportSize]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      processTextures();
    }, 100);
    return () => clearTimeout(timeout);
  }, [processTextures, textures]);

  const handleBaseUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setBaseColor({ file, previewUrl: url, intensity: 1, inverted: false });
      smartAnalyzeOnly(url);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = (type: ChannelType, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setTextures(prev => ({ ...prev, [type]: { ...prev[type], file, previewUrl: url } }));
    };
    reader.readAsDataURL(file);
  };

  const handleClear = (type: ChannelType) => {
    setTextures(prev => ({ ...prev, [type]: { ...INITIAL_TEXTURE_STATE } }));
  };

  const handleUpdate = (type: ChannelType, updates: Partial<TextureState>) => {
    setTextures(prev => ({ ...prev, [type]: { ...prev[type], ...updates } }));
  };

  const handleUpdateParam = (key: keyof PBRAnalysisResult, value: any) => {
    const next = { ...pbrParams, [key]: value };
    setPbrParams(next);
    if (baseColor.previewUrl) generateProceduralMaps(next, baseColor.previewUrl);
  };

  const downloadTexture = (type: string) => {
    if (type === 'AOMRD' && outputUrl) {
      const link = document.createElement('a');
      link.download = `T_AOMRD_${exportSize}.png`;
      link.href = outputUrl;
      link.click();
    } else if (type === 'NORMAL' || type === 'ALPHA') {
      const chan = type === 'NORMAL' ? ChannelType.Normal : ChannelType.Alpha;
      const url = textures[chan].previewUrl;
      if (url) {
        const link = document.createElement('a');
        link.download = `T_${type}_${exportSize}.png`;
        link.href = url;
        link.click();
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xl shadow-indigo-500/20">
              <Sparkles className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter uppercase leading-none">AI Material Suite</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">UE5 & inZOI Pipeline</p>
            </div>
          </div>
          
          <nav className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl">
            <button onClick={() => setCurrentView('generator')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${currentView === 'generator' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}><Wand2 size={12} /> AI Creator</button>
            <button onClick={() => setCurrentView('packer')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${currentView === 'packer' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}><Layers size={12} /> AOMRD Packer</button>
          </nav>

          <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-lg">
            {[512, 1024, 2048, 4096].map(res => (
              <button key={res} onClick={() => setExportSize(res as ExportResolution)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold ${exportSize === res ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-400'}`}>{res >= 1024 ? `${res/1024}k` : `${res}px`}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentView === 'generator' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                <h2 className="text-lg font-black uppercase tracking-tight mb-6 flex items-center gap-2 text-indigo-400"><LayoutGrid size={20} /> Creator Config</h2>
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest">Generation Mode</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <button onClick={() => setGenParams({...genParams, mode: 'pattern'})} className={`flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold uppercase transition-all ${genParams.mode === 'pattern' ? 'bg-slate-800 text-indigo-400 shadow-inner' : 'text-slate-600'}`}><Grid3X3 size={14} /> Pattern</button>
                      <button onClick={() => setGenParams({...genParams, mode: 'style'})} className={`flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold uppercase transition-all ${genParams.mode === 'style' ? 'bg-slate-800 text-indigo-400 shadow-inner' : 'text-slate-600'}`}><Shirt size={14} /> Style</button>
                    </div>
                  </div>
                  {genParams.mode === 'style' && (
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest">Garment Type</label>
                      <select value={genParams.itemType} onChange={(e) => setGenParams({...genParams, itemType: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-300 outline-none">
                        <option value="sweater">Sweater</option>
                        <option value="skirt">Skirt</option>
                        <option value="pants">Pants</option>
                        <option value="jacket">Jacket</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest">Material Prompt</label>
                    <textarea placeholder="e.g. Red silk floral embroidery, gold threads..." className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-medium text-slate-300 min-h-[100px] outline-none focus:border-indigo-500" value={genParams.prompt} onChange={(e) => setGenParams({...genParams, prompt: e.target.value})} />
                  </div>
                  <button onClick={handleRunGeneration} disabled={isGeneratingImages} className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${isGeneratingImages ? 'bg-slate-800 text-slate-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/20'}`}>
                    {isGeneratingImages ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />} Generate Variations
                  </button>
                </div>
              </div>
            </div>
            <div className="lg:col-span-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                {variations.length > 0 ? (
                  variations.map((v, i) => (
                    <div key={i} className="group bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden relative shadow-2xl flex flex-col">
                      <div className="aspect-square relative overflow-hidden bg-slate-950">
                        <img src={v} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                           <button onClick={() => sendToPacker(v)} className="bg-white text-slate-950 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-tighter flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">Usar en Packer <ChevronRight size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-700 py-20 bg-slate-950/20">
                    <ImageIcon size={64} className="mb-4 opacity-10" />
                    <p className="text-sm font-black uppercase tracking-widest opacity-20">Waiting for instructions</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-right duration-500">
            <div className="lg:col-span-8 space-y-8">
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group">
                <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                  <div className="w-48 aspect-square rounded-2xl border-2 border-dashed border-indigo-500/20 bg-slate-950 flex items-center justify-center overflow-hidden group relative shrink-0">
                    {baseColor.previewUrl ? (
                      <>
                        <img src={baseColor.previewUrl} className="w-full h-full object-cover" />
                        <button onClick={() => setBaseColor({...INITIAL_TEXTURE_STATE})} className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                      </>
                    ) : (
                      <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-900">
                        <ImageIcon className="text-indigo-500/30 mb-2" size={40} />
                        <span className="text-[10px] font-black uppercase text-slate-600">Upload Albedo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleBaseUpload(e.target.files[0])} />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 space-y-6">
                    <button onClick={() => baseColor.previewUrl && smartAnalyzeOnly(baseColor.previewUrl)} disabled={isAnalyzing || !baseColor.previewUrl} className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95 transition-transform">
                      {isAnalyzing ? <Loader2 className="animate-spin" /> : <Activity size={18} />} Analyze Surface PBR
                    </button>
                    {hasAnalyzed && (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 p-6 rounded-2xl border border-white/5 shadow-inner">
                         <div className="space-y-3">
                           <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase"><span>AO Intensity</span><span className="text-indigo-400">{pbrParams.aoIntensity.toFixed(2)}</span></div>
                           <input type="range" min="0" max="2" step="0.05" value={pbrParams.aoIntensity} onChange={(e) => handleUpdateParam('aoIntensity', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded appearance-none accent-indigo-500" />
                         </div>
                         <div className="space-y-3">
                           <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase"><span>Roughness</span><span className="text-indigo-400">{pbrParams.roughnessEstimate.toFixed(2)}</span></div>
                           <input type="range" min="0" max="1" step="0.05" value={pbrParams.roughnessEstimate} onChange={(e) => handleUpdateParam('roughnessEstimate', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded appearance-none accent-indigo-500" />
                         </div>
                         <div className="col-span-full pt-2 flex items-center gap-2">
                           <CheckCircle2 size={14} className="text-green-500" />
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight italic">{pbrParams.description}</p>
                         </div>
                       </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.values(ChannelType).map(type => (
                  <TextureSlot key={type} type={type} state={textures[type]} onUpload={(file) => handleUpload(type, file)} onClear={() => handleClear(type)} onUpdate={(upd) => handleUpdate(type, upd)} />
                ))}
              </div>
            </div>
            <div className="lg:col-span-4">
               <div className="sticky top-24 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                  <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2"><Maximize size={16} className="text-indigo-500" /> Master Preview</h2>
                  <div className="aspect-square bg-slate-950 rounded-2xl border border-slate-800 p-2 overflow-hidden shadow-inner flex items-center justify-center relative">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 to-transparent opacity-50" />
                    {outputUrl ? <img src={outputUrl} className="w-full h-full object-contain relative z-10" /> : <div className="h-full flex items-center justify-center opacity-10"><Layers size={48} /></div>}
                  </div>
                  <div className="mt-6 space-y-3">
                    <button onClick={() => downloadTexture('AOMRD')} disabled={!outputUrl} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50">
                      <Download size={18} /> Export AOMRD Pack
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => downloadTexture('NORMAL')} disabled={!textures[ChannelType.Normal].previewUrl} className="py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-black text-[9px] uppercase tracking-widest border border-slate-700 disabled:opacity-50">Normal Map</button>
                      <button onClick={() => downloadTexture('ALPHA')} disabled={!textures[ChannelType.Alpha].previewUrl} className="py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-black text-[9px] uppercase tracking-widest border border-slate-700 disabled:opacity-50">Alpha Mask</button>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </main>
      <canvas ref={canvasRef} className="hidden" />
      <footer className="mt-20 border-t border-slate-900 py-12 text-center">
        <div className="flex items-center justify-center gap-6 mb-4 opacity-20"><Box size={20} /><Gamepad2 size={20} /><Shirt size={20} /></div>
        <p className="text-[10px] text-slate-700 font-black uppercase tracking-widest">AOMRD Material Packer & AI Engine • Premium Unreal Utility</p>
      </footer>
    </div>
  );
};

export default App;
