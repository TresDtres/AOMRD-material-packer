
import React from 'react';
import { ChannelType, TextureState } from '../types';
import { Upload, X, Repeat, Settings2 } from 'lucide-react';

interface TextureSlotProps {
  type: ChannelType;
  state: TextureState;
  onUpload: (file: File) => void;
  onClear: () => void;
  onUpdate: (updates: Partial<TextureState>) => void;
}

const TextureSlot: React.FC<TextureSlotProps> = ({ type, state, onUpload, onClear, onUpdate }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  const channelInfo = {
    [ChannelType.AO]: { label: 'Ambient Occlusion', desc: 'Canal R (Sombras)', bg: 'bg-red-500/5', border: 'border-red-500/20' },
    [ChannelType.Metallic]: { label: 'Metallic', desc: 'Canal G (Metal)', bg: 'bg-green-500/5', border: 'border-green-500/20' },
    [ChannelType.Roughness]: { label: 'Roughness', desc: 'Canal B (Rugosidad)', bg: 'bg-blue-500/5', border: 'border-blue-500/20' },
    [ChannelType.Displacement]: { label: 'Displacement', desc: 'Canal Alfa (Altura)', bg: 'bg-white/5', border: 'border-white/10' },
    [ChannelType.Normal]: { label: 'Normal Map', desc: 'Relieve (DirectX)', bg: 'bg-indigo-500/5', border: 'border-indigo-500/20' },
    [ChannelType.Alpha]: { label: 'Alpha Mask', desc: 'Opacidad/Recorte', bg: 'bg-slate-500/5', border: 'border-slate-500/20' },
  };

  const info = channelInfo[type];

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-xl border ${info.border} ${info.bg} transition-all duration-300 hover:border-slate-600`}>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">{info.label}</h3>
          <p className="text-[10px] text-slate-500 font-medium uppercase">{info.desc}</p>
        </div>
        {state.previewUrl && (
          <button 
            onClick={onClear}
            className="p-1.5 hover:bg-red-500/20 rounded-full text-red-400 transition-colors"
            title="Clear"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="relative group aspect-square rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center bg-slate-950/50">
        {state.previewUrl ? (
          <img src={state.previewUrl} className="w-full h-full object-contain" alt={type} />
        ) : (
          <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-900 transition-colors">
            <Upload className="mb-2 text-slate-700 group-hover:text-indigo-500 transition-colors" size={24} />
            <span className="text-[10px] text-slate-600 group-hover:text-slate-400 text-center px-4 uppercase font-bold tracking-tighter">Load {type}</span>
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
        )}
      </div>

      <div className="space-y-3 mt-1">
        <div className="flex items-center gap-2">
          <Settings2 size={12} className="text-slate-600" />
          <input 
            type="range" 
            min="0" 
            max="2" 
            step="0.01" 
            value={state.intensity}
            onChange={(e) => onUpdate({ intensity: parseFloat(e.target.value) })}
            className="flex-1 accent-indigo-500 h-1 rounded-lg appearance-none bg-slate-800"
          />
          <span className="text-[10px] mono text-slate-500 w-6 text-right">{state.intensity.toFixed(1)}</span>
        </div>
        
        <button 
          onClick={() => onUpdate({ inverted: !state.inverted })}
          className={`w-full py-1 rounded text-[10px] font-bold uppercase flex items-center justify-center gap-2 border transition-all ${
            state.inverted ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
          }`}
        >
          <Repeat size={10} />
          {state.inverted ? 'Inverted' : 'Invert Values'}
        </button>
      </div>
    </div>
  );
};

export default TextureSlot;
