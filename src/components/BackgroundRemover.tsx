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
      const { removeBackground } = await import('@imgly/background-removal');

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
    downloadSingle(result.resultPngBlob, result.originalName, 'image/png');
  }, [result]);

  const handleDownloadWebp = useCallback(() => {
    if (!result?.resultWebpBlob) return;
    downloadSingle(result.resultWebpBlob, result.originalName, 'image/webp');
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
      </div>
    );
  }

  // ── Loading / Processing state ──
  if (stage === 'loading' || stage === 'processing') {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="progress-ring w-10 h-10 rounded-full border-3 border-gold/20 border-t-gold" />
          </div>
          <p className="text-text-primary text-sm font-medium mb-2">{progressText}</p>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-text-secondary text-xs mt-2">{progress}%</p>
          <button
            onClick={handleClear}
            className="mt-4 text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all"
          >
            Cancel
          </button>
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
