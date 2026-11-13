import React, { useState } from 'react';
import { MapPin, Navigation, Compass, Copy, Check, ExternalLink } from 'lucide-react';

interface GeoMapCardProps {
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  accuracyMeters?: number | null;
}

export const GeoMapCard: React.FC<GeoMapCardProps> = ({
  latitude,
  longitude,
  locationName,
  accuracyMeters = 3.5,
}) => {
  const [copied, setCopied] = useState(false);

  if (latitude === null || longitude === null) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        <MapPin className="w-5 h-5 mx-auto mb-1 text-slate-300" />
        No geographical coordinates attached.
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(`${latitude}, ${longitude}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-white overflow-hidden shadow-sm">
      {/* Top Map Toolbar */}
      <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs bg-slate-950/70">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-400 font-bold">
          <Navigation className="w-3.5 h-3.5 rotate-45 text-amber-400" />
          <span>GPS Fix: {latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            title="Copy coordinates"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <a
            href={`https://www.google.com/maps?q=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
          >
            <span>Satellite</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Topographic Visual Map Canvas */}
      <div className="relative h-44 bg-[#0a0f1d] flex items-center justify-center overflow-hidden select-none">
        {/* Subtle grid lines */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle, #38bdf8 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Topographic Elevation Rings */}
        <div className="absolute inset-0 flex items-center justify-center opacity-15">
          <div className="w-64 h-64 rounded-full border border-sky-400" />
          <div className="w-48 h-48 rounded-full border border-sky-400 absolute" />
          <div className="w-32 h-32 rounded-full border border-sky-400 absolute" />
        </div>

        {/* Accuracy Radius Halo */}
        <div className="w-20 h-20 rounded-full bg-amber-500/15 border border-amber-400/40 animate-pulse flex items-center justify-center">
          {/* Target Center Crosshair Pin */}
          <div className="relative">
            <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center" />
            <div className="absolute -top-1 -left-1 w-6 h-6 rounded-full border border-amber-400/80 animate-ping" />
          </div>
        </div>

        {/* Compass Cardinal indicator */}
        <div className="absolute top-2.5 right-3 text-[10px] font-mono text-slate-500 flex items-center gap-1">
          <Compass className="w-3.5 h-3.5 text-slate-400" />
          <span>N 004° E</span>
        </div>

        {/* Bottom Location Tag */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-md border border-slate-800">
          <span className="text-slate-300 truncate max-w-[200px]">{locationName}</span>
          <span className="text-emerald-400 shrink-0">Accuracy: ±{accuracyMeters}m</span>
        </div>
      </div>
    </div>
  );
};
