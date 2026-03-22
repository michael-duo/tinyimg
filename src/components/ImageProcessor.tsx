import { useCallback, useEffect, useRef, useState } from 'react';
import DropZone from './DropZone';
import ResultCard from './ResultCard';
import type { FileResult } from './ResultCard';
import BulkActions from './BulkActions';
import {
  detectOutputFormats,
  SUPPORTED_INPUT_TYPES,
  MAX_FILE_SIZE,
  MAX_FILE_COUNT,
  WORKER_TIMEOUT_MS,
} from '../lib/format-support';
import type { ImageFormat } from '../lib/format-support';
import { getImage, clearImage } from '../lib/image-transfer';

interface Toast {
  message: string;
  id: number;
}

let toastCounter = 0;
let resultCounter = 0;

const FORMAT_LABELS: Record<string, string> = {
  original: 'Same format',
  'image/webp': 'WebP',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/avif': 'AVIF',
};

export default function ImageProcessor() {
  const [format, setFormat] = useState('original');
  const [quality, setQuality] = useState<number | 'auto'>('auto');
  const [maxWidth, setMaxWidth] = useState(0);
  const [results, setResults] = useState<FileResult[]>([]);
  const [outputFormats, setOutputFormats] = useState<ImageFormat[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const hasResults = results.length > 0;

  useEffect(() => {
    detectOutputFormats().then(setOutputFormats);
  }, []);

  const showToast = useCallback((message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { message, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const validateFiles = useCallback(
    (files: File[]): File[] => {
      const existingCount = results.length;
      if (existingCount >= MAX_FILE_COUNT) {
        showToast(`Maximum ${MAX_FILE_COUNT} files allowed.`);
        return [];
      }
      const accepted: File[] = [];
      const errors: string[] = [];
      for (const file of files) {
        if (existingCount + accepted.length >= MAX_FILE_COUNT) { errors.push(`Only ${MAX_FILE_COUNT} files max.`); break; }
        if (!SUPPORTED_INPUT_TYPES.has(file.type)) { errors.push(`"${file.name}" is not supported.`); continue; }
        if (file.size > MAX_FILE_SIZE) { errors.push(`"${file.name}" exceeds 20 MB.`); continue; }
        accepted.push(file);
      }
      [...new Set(errors)].forEach(showToast);
      return accepted;
    },
    [results.length, showToast]
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsProcessing(true);
      if (workerRef.current) workerRef.current.terminate();
      const worker = new Worker(new URL('../workers/image-worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      const newResults: FileResult[] = files.map((file) => ({
        id: String(++resultCounter), originalFile: file, blob: null, sizes: null, dimensions: null,
        status: 'pending', error: null, outputFormat: format === 'original' ? file.type : format,
        isAnimatedGif: file.type === 'image/gif',
      }));
      setResults((prev) => [...prev, ...newResults]);

      for (const entry of newResults) {
        const file = entry.originalFile;
        const outputFormat = format === 'original' ? file.type : format;
        setResults((prev) => prev.map((r) => r.id === entry.id ? { ...r, status: 'processing' } : r));

        const res = await new Promise<{ blob: Blob; originalSize: number; newSize: number; width: number; height: number; actualFormat?: string } | { error: string }>((resolve) => {
          const t = setTimeout(() => resolve({ error: 'Timed out' }), WORKER_TIMEOUT_MS);
          const h = (e: MessageEvent) => { clearTimeout(t); worker.removeEventListener('message', h); resolve(e.data.type === 'result' ? e.data : { error: e.data.message ?? 'Error' }); };
          worker.addEventListener('message', h);
          worker.postMessage({ type: 'process', file, settings: { format, quality, maxWidth: maxWidth || undefined } });
        });

        if ('error' in res) {
          setResults((prev) => prev.map((r) => r.id === entry.id ? { ...r, status: 'error', error: res.error } : r));
        } else {
          setResults((prev) => prev.map((r) => r.id === entry.id ? {
            ...r, status: 'done', blob: res.blob,
            outputFormat: res.actualFormat ?? outputFormat,
            sizes: { original: res.originalSize, compressed: res.newSize },
            dimensions: { width: res.width, height: res.height },
          } : r));
        }
      }
      worker.terminate(); workerRef.current = null; setIsProcessing(false);
    },
    [format, quality, maxWidth]
  );

  const handleFiles = useCallback((files: File[]) => {
    const accepted = validateFiles(files);
    if (accepted.length > 0) processFiles(accepted);
  }, [validateFiles, processFiles]);

  useEffect(() => {
    getImage().then((transferred) => {
      if (transferred) {
        clearImage();
        const file = new File([transferred.blob], transferred.name, { type: transferred.mimeType });
        handleFiles([file]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = useCallback(() => {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    setIsProcessing(false); setResults([]);
  }, []);

  const totalProcessed = results.filter((r) => r.status === 'done' || r.status === 'error').length;

  return (
    <div>
      {/* Toasts */}
      <div aria-live="polite" className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-enter bg-bg-card border border-border text-text-primary text-sm px-4 py-3 rounded-xl shadow-lg pointer-events-auto max-w-xs" role="alert">
            {toast.message}
          </div>
        ))}
      </div>

      {/* ── STATE 1: Empty → full dropzone + settings ── */}
      {!hasResults && (
        <div className="flex flex-col gap-5">
          <DropZone onFiles={handleFiles} disabled={isProcessing} />

          {/* Format pills */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-text-secondary text-xs font-medium">Output:</span>
            <div className="flex gap-1.5 bg-bg-primary/60 border border-border rounded-xl p-1">
              {['original', ...outputFormats].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                    format === fmt
                      ? 'bg-gold text-bg-primary font-semibold shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {FORMAT_LABELS[fmt] ?? fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Quality slider */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-text-secondary text-xs font-medium">Quality:</span>
            <button
              onClick={() => setQuality('auto')}
              className={`text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                quality === 'auto'
                  ? 'bg-gold text-bg-primary font-semibold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary bg-bg-primary/60 border border-border'
              }`}
            >
              Auto
            </button>
            <input
              type="range"
              min={10}
              max={100}
              value={quality === 'auto' ? 80 : quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="flex-1 max-w-45 accent-gold h-1"
            />
            {quality !== 'auto' && (
              <span className="text-text-primary text-xs font-semibold w-8">{quality}%</span>
            )}
          </div>

          {/* Max width presets */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-text-secondary text-xs font-medium">Max width:</span>
            <div className="flex gap-1.5 bg-bg-primary/60 border border-border rounded-xl p-1">
              {[
                { label: 'Original', value: 0 },
                { label: '1920', value: 1920 },
                { label: '1280', value: 1280 },
                { label: '800', value: 800 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMaxWidth(opt.value)}
                  className={`text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                    maxWidth === opt.value
                      ? 'bg-gold text-bg-primary font-semibold shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STATE 2: Has results → compact settings + inline table ── */}
      {hasResults && (
        <div className="max-w-2xl mx-auto">
          {/* Compact format pills (always visible) */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-text-secondary text-xs font-medium">Output:</span>
            <div className="flex gap-1.5 bg-bg-primary/60 border border-border rounded-xl p-1">
              {['original', ...outputFormats].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                    format === fmt
                      ? 'bg-gold text-bg-primary font-semibold shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {FORMAT_LABELS[fmt] ?? fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Stats + actions bar */}
          <BulkActions
            results={results}
            onClear={handleClear}
            totalProcessed={totalProcessed}
            totalFiles={results.length}
          />

          {/* File rows */}
          <div className="py-1">
            {results.map((result, i) => (
              <ResultCard key={result.id} result={result} index={i} />
            ))}
          </div>

          {/* Add more */}
          <DropZone onFiles={handleFiles} disabled={isProcessing} compact />
        </div>
      )}
    </div>
  );
}
