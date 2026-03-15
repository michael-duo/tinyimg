import type { ImageFormat } from '../lib/format-support';
import { FORMAT_LABELS } from '../lib/format-support';

export interface Settings {
  quality: number;    // 1–100
  format: string;     // MIME type or 'original'
  maxWidth: number | undefined;
}

interface SettingsBarProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  outputFormats: ImageFormat[];
}

const RESIZE_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: 'No resize', value: undefined },
  { label: 'Max 1920px', value: 1920 },
  { label: 'Max 1280px', value: 1280 },
  { label: 'Max 800px', value: 800 },
];

export default function SettingsBar({ settings, onChange, outputFormats }: SettingsBarProps) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5 flex flex-wrap gap-6 items-center">
      {/* Quality */}
      <div className="flex flex-col gap-1.5 min-w-[180px] flex-1">
        <label className="text-text-secondary text-xs font-medium uppercase tracking-wider">
          Quality
          <span className="ml-2 text-gold font-semibold normal-case tracking-normal text-sm">
            {settings.quality}%
          </span>
        </label>
        <input
          type="range"
          min={1}
          max={100}
          value={settings.quality}
          onChange={(e) => set('quality', Number(e.target.value))}
          className="w-full accent-gold h-2 rounded-full cursor-pointer"
          aria-label="Quality"
        />
        <div className="flex justify-between text-text-secondary text-xs">
          <span>Smaller</span>
          <span>Better</span>
        </div>
      </div>

      {/* Output format */}
      <div className="flex flex-col gap-1.5 min-w-[150px]">
        <label className="text-text-secondary text-xs font-medium uppercase tracking-wider">
          Output Format
        </label>
        <select
          value={settings.format}
          onChange={(e) => set('format', e.target.value)}
          className="bg-bg-primary border border-border text-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:border-gold transition-colors cursor-pointer"
          aria-label="Output format"
        >
          <option value="original">Same as original</option>
          {outputFormats.map((fmt) => (
            <option key={fmt} value={fmt}>
              {FORMAT_LABELS[fmt] ?? fmt}
            </option>
          ))}
        </select>
      </div>

      {/* Resize */}
      <div className="flex flex-col gap-1.5 min-w-[150px]">
        <label className="text-text-secondary text-xs font-medium uppercase tracking-wider">
          Resize
        </label>
        <select
          value={settings.maxWidth ?? ''}
          onChange={(e) => set('maxWidth', e.target.value ? Number(e.target.value) : undefined)}
          className="bg-bg-primary border border-border text-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:border-gold transition-colors cursor-pointer"
          aria-label="Resize"
        >
          {RESIZE_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value ?? ''}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
