import { useCallback, useEffect, useRef, useState } from 'react';
import DropZone from './DropZone';
import { getImage, setImage, clearImage } from '../lib/image-transfer';
import type { TransferImage } from '../lib/image-transfer';
import { downloadSingle } from '../lib/download';
import type { ResultMessage, ErrorMessage } from '../workers/image-worker';

type Stage = 'idle' | 'loading' | 'processing' | 'done' | 'error';

interface RemovalResult {
  originalUrl: string;
  resultPngUrl: string;
  resultWebpUrl: string | null;
  resultPngBlob: Blob;
  resultWebpBlob: Blob | null;
  originalName: string;
  originalSize: number;
  pngSize: number;
  webpSize: number | null;
  width: number;
  height: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackgroundRemover() {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<RemovalResult | null>(null);
  const [sliderPos, setSliderPos] = useState(50);

  const sliderRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const urlsRef = useRef<string[]>([]);
  const abortRef = useRef(false);

  // Revoke object URLs on unmount or clear
  const revokeUrls = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      revokeUrls();
    };
  }, [revokeUrls]);

  // Preload the AI model in background as soon as the page loads
  const modelRef = useRef<{ removeBackground: typeof import('@imgly/background-removal')['removeBackground'] } | null>(null);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('@imgly/background-removal').then((mod) => {
      if (cancelled) return;
      modelRef.current = { removeBackground: mod.removeBackground };
      setModelReady(true);
    }).catch(() => {
      // Will retry when user uploads
    });
    return () => { cancelled = true; };
  }, []);

  // Check IndexedDB on mount for transferred image
  useEffect(() => {
    let cancelled = false;
    getImage().then((img) => {
      if (cancelled || !img) return;
      clearImage();
      const file = new File([img.blob], img.name, { type: img.mimeType });
      processImage(file);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processImage = useCallback(async (file: File) => {
    abortRef.current = false;
    setStage('loading');
    setProgress(0);
    setProgressText('Loading background removal model...');
    setErrorMsg('');
    setResult(null);
    revokeUrls();

    try {
      // Use preloaded model if ready, otherwise import fresh
      let removeBackground: typeof import('@imgly/background-removal')['removeBackground'];
      if (modelRef.current) {
        removeBackground = modelRef.current.removeBackground;
      } else {
        const mod = await import('@imgly/background-removal');
        removeBackground = mod.removeBackground;
        modelRef.current = { removeBackground };
      }

      if (abortRef.current) return;
      setStage('processing');
      setProgressText('Removing background...');

      const blob: Blob = await removeBackground(file, {
        progress: (key: string, current: number, total: number) => {
          if (abortRef.current) return;
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setProgress(pct);

          if (key.includes('download') || key.includes('fetch')) {
            setProgressText(`Downloading model... ${pct}%`);
          } else if (key.includes('compute') || key.includes('inference')) {
            setProgressText(`Processing image... ${pct}%`);
          } else {
            setProgressText(`Working... ${pct}%`);
          }
        },
      });

      if (abortRef.current) return;

      // Create original preview URL
      const originalUrl = URL.createObjectURL(file);
      urlsRef.current.push(originalUrl);

      // The result is a PNG blob
      const resultPngBlob = blob;
      const resultPngUrl = URL.createObjectURL(resultPngBlob);
      urlsRef.current.push(resultPngUrl);

      // Get dimensions
      const img = new Image();
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Failed to read image dimensions'));
        img.src = resultPngUrl;
      });

      // Auto-compress to WebP via existing worker
      let resultWebpBlob: Blob | null = null;
      let resultWebpUrl: string | null = null;

      try {
        const webpBlob = await compressWithWorker(resultPngBlob, file.name);
        if (webpBlob && webpBlob.type === 'image/webp') {
          resultWebpBlob = webpBlob;
          resultWebpUrl = URL.createObjectURL(webpBlob);
          urlsRef.current.push(resultWebpUrl);
        }
      } catch {
        // WebP compression failed, that's okay — we still have PNG
      }

      if (abortRef.current) return;

      setResult({
        originalUrl,
        resultPngUrl,
        resultWebpUrl,
        resultPngBlob,
        resultWebpBlob,
        originalName: file.name,
        originalSize: file.size,
        pngSize: resultPngBlob.size,
        webpSize: resultWebpBlob?.size ?? null,
        width: dims.width,
        height: dims.height,
      });
      setStage('done');
    } catch (err) {
      if (abortRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Background removal failed');
      setStage('error');
    }
  }, [revokeUrls]);

  const compressWithWorker = (pngBlob: Blob, originalName: string): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/image-worker.ts', import.meta.url),
        { type: 'module' }
      );
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Worker timeout'));
      }, 30000);

      worker.onmessage = (e: MessageEvent<ResultMessage | ErrorMessage>) => {
        clearTimeout(timeout);
        worker.terminate();
        if (e.data.type === 'result') {
          resolve(e.data.blob);
        } else {
          reject(new Error(e.data.message));
        }
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        reject(new Error('Worker error'));
      };

      const file = new File([pngBlob], originalName, { type: 'image/png' });
      worker.postMessage({ type: 'process', file, settings: { format: 'image/webp' } });
    });
  };

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
      if (!validTypes.includes(file.type)) return;
      processImage(file);
    },
    [processImage]
  );

  const handleClear = useCallback(() => {
    abortRef.current = true;
    revokeUrls();
    setResult(null);
    setStage('idle');
    setProgress(0);
    setProgressText('');
    setErrorMsg('');
    setSliderPos(50);
  }, [revokeUrls]);

  const handleDownloadPng = useCallback(() => {
    if (!result) return;
    downloadSingle(result.resultPngBlob, result.originalName, 'image/png', 'nobg');
  }, [result]);

  const handleDownloadWebp = useCallback(() => {
    if (!result?.resultWebpBlob) return;
    downloadSingle(result.resultWebpBlob, result.originalName, 'image/webp', 'nobg');
  }, [result]);

  const handleTransfer = useCallback(
    async (target: 'edit' | 'compress') => {
      if (!result) return;
      const data: TransferImage = {
        blob: result.resultPngBlob,
        name: result.originalName,
        mimeType: 'image/png',
        width: result.width,
        height: result.height,
        from: 'remove-bg',
      };
      await setImage(data);
      window.location.href = target === 'edit' ? '/edit' : '/';
    },
    [result]
  );

  // Slider drag logic
  const updateSlider = useCallback((clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateSlider(e.clientX);
    },
    [updateSlider]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      updateSlider(e.clientX);
    },
    [updateSlider]
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── Idle state ──
  if (stage === 'idle') {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <DropZone onFiles={handleFiles} />
        <p className="text-center text-xs mt-3 text-text-secondary/50">
          {modelReady ? (
            <span className="text-success/70">AI model ready</span>
          ) : (
            <span>Loading AI model in background...</span>
          )}
        </p>
      </div>
    );
  }

  // ── Loading / Processing state ──
  if (stage === 'loading' || stage === 'processing') {
    const isDownloading = progressText.toLowerCase().includes('download') || progressText.toLowerCase().includes('model');
    const modelLoaded = stage === 'processing';
    const steps = [
      { label: 'Loading AI model', done: modelLoaded, active: !modelLoaded },
      { label: 'Removing background', done: false, active: modelLoaded },
      { label: 'Optimizing output', done: false, active: false },
    ];

    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="rounded-xl border border-border bg-bg-card p-8">
          {/* Animated icon */}
          <div className="flex justify-center mb-6">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 progress-ring" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(201,168,76,0.1)" strokeWidth="3" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="120 56" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Status text */}
          <p className="text-text-primary text-sm font-semibold text-center mb-1">
            {stage === 'loading' ? 'Preparing AI model...' : 'Removing background...'}
          </p>
          <p className="text-text-secondary text-xs text-center mb-5">
            {isDownloading
              ? 'Downloading model for the first time — this only happens once'
              : 'AI is analyzing your image — almost there'}
          </p>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-gold/80 to-gold rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-6 mb-5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  step.done ? 'bg-success' : step.active ? 'bg-gold animate-pulse' : 'bg-white/10'
                }`} />
                <span className={`text-[11px] ${
                  step.done ? 'text-success' : step.active ? 'text-text-primary' : 'text-text-secondary/40'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Helpful tip */}
          <div className="bg-gold/5 border border-gold/10 rounded-lg px-4 py-3 mb-4">
            <p className="text-xs text-text-secondary text-center">
              {isDownloading ? (
                <>
                  <span className="text-gold font-medium">First time only</span> — the AI model (~5 MB) is being cached in your browser. Next time it will load instantly.
                </>
              ) : (
                <>
                  <span className="text-gold font-medium">100% private</span> — your image never leaves your device. All processing happens right here in your browser.
                </>
              )}
            </p>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleClear}
              className="text-xs px-4 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 cursor-pointer transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (stage === 'error') {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="rounded-xl border border-error/30 bg-bg-card p-8 text-center">
          <div className="text-error text-3xl mb-3">!</div>
          <p className="text-text-primary text-sm font-medium mb-1">Background removal failed</p>
          <p className="text-text-secondary text-xs mb-4">{errorMsg}</p>
          <button
            onClick={handleClear}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Done state ──
  if (!result) return null;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Before/After Slider */}
      <div
        ref={sliderRef}
        className="relative w-full rounded-xl border border-border bg-bg-card overflow-hidden select-none touch-none cursor-ew-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Checkerboard background for transparency */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        />

        {/* Result (after) — full width behind */}
        <img
          src={result.resultPngUrl}
          alt="Background removed"
          className="relative w-full h-auto block"
          draggable={false}
        />

        {/* Original (before) — clipped */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <img
            src={result.originalUrl}
            alt="Original"
            className="w-full h-auto block"
            draggable={false}
          />
        </div>

        {/* Slider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
          style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-bg-primary">
              <path d="M4 3L1 7L4 11M10 3L13 7L10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Labels */}
        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-black/60 text-white px-2 py-0.5 rounded">
          Before
        </span>
        <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider bg-black/60 text-white px-2 py-0.5 rounded">
          After
        </span>
      </div>

      {/* Stats */}
      <div className="rounded-xl border border-border bg-bg-card p-4">
        <div className="flex items-center justify-between text-xs text-text-secondary mb-3">
          <span>
            {result.width} x {result.height}px
          </span>
          <span>Original: {formatBytes(result.originalSize)}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-primary">PNG</span>
              <span className="text-xs text-text-secondary">{formatBytes(result.pngSize)}</span>
            </div>
            <button
              onClick={handleDownloadPng}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md cursor-pointer transition-all"
            >
              Download PNG
            </button>
          </div>

          {result.resultWebpBlob && result.webpSize != null && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-primary">WebP</span>
                <span className="text-xs text-text-secondary">{formatBytes(result.webpSize)}</span>
                {result.webpSize < result.pngSize && (
                  <span className="text-xs text-success">
                    {Math.round((1 - result.webpSize / result.pngSize) * 100)}% smaller
                  </span>
                )}
              </div>
              <button
                onClick={handleDownloadWebp}
                className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md cursor-pointer transition-all"
              >
                Download WebP
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => handleTransfer('edit')}
          className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all"
        >
          Send to Editor
        </button>
        <button
          onClick={() => handleTransfer('compress')}
          className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all"
        >
          Send to Compress
        </button>
        <button
          onClick={handleClear}
          className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all"
        >
          New Image
        </button>
      </div>
    </div>
  );
}
