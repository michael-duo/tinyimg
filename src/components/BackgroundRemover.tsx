import { useCallback, useEffect, useRef, useState } from 'react';
import DropZone from './DropZone';
import { getImage, setImage, clearImage } from '../lib/image-transfer';
import type { TransferImage } from '../lib/image-transfer';
import { downloadSingle, downloadAll, getCompressedFilename } from '../lib/download';
import type { ResultMessage, ErrorMessage } from '../workers/image-worker';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Segmenter = any;

type ModelType = 'general' | 'selfie';

interface BgResult {
  id: string;
  originalFile: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number; // 0–100
  error?: string;
  originalUrl?: string;
  pngBlob?: Blob;
  webpBlob?: Blob;
  pngUrl?: string;
  webpUrl?: string;
  width?: number;
  height?: number;
}

let bgResultCounter = 0;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Fake asymptotic progress ──
// Quickly rises then slows as it approaches `ceiling`, never exceeding it.
// Call returned cleanup to stop the timer.
function startFakeProgress(
  onProgress: (pct: number) => void,
  ceiling = 95,
  intervalMs = 300,
): () => void {
  let current = 0;
  const id = setInterval(() => {
    const remaining = ceiling - current;
    // Random increment that shrinks as we approach ceiling
    const step = Math.max(0.2, remaining * (0.03 + Math.random() * 0.06));
    current = Math.min(ceiling, current + step);
    onProgress(Math.round(current));
  }, intervalMs);
  return () => clearInterval(id);
}

// ── MediaPipe Selfie Segmenter ──
async function loadSegmenter(): Promise<Segmenter> {
  const { FilesetResolver, ImageSegmenter } = await import(
    /* @vite-ignore */ '@mediapipe/tasks-vision'
  );
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
  );
  const segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
      delegate: 'GPU',
    },
    outputConfidenceMasks: true,
    outputCategoryMask: false,
    runningMode: 'IMAGE',
  });
  return segmenter;
}

export default function BackgroundRemover() {
  const [results, setResults] = useState<BgResult[]>([]);
  const [sliderPos, setSliderPos] = useState(50);
  const [modelType, setModelType] = useState<ModelType>('general');

  const sliderRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const urlsRef = useRef<string[]>([]);
  const abortRef = useRef(false);
  const processingRef = useRef(false);

  // MediaPipe segmenter ref (lazy-loaded only when selfie model selected)
  const segmenterRef = useRef<Segmenter>(null);
  const [modelReady, setModelReady] = useState(false);

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

  // Preload model based on selection
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        if (modelType === 'selfie') {
          const segmenter = await loadSegmenter();
          if (!cancelled) {
            segmenterRef.current = segmenter;
            setModelReady(true);
          }
        } else {
          // @imgly/background-removal preloads on first use, but we can warm it up
          const { preload } = await import('@imgly/background-removal');
          await preload({ model: 'isnet_quint8', device: 'gpu' });
          if (!cancelled) setModelReady(true);
        }
      } catch {
        // Will retry when user processes
      }
    };
    setModelReady(false);
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => init(), { timeout: 3000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    } else {
      const id = setTimeout(() => init(), 100);
      return () => {
        cancelled = true;
        clearTimeout(id);
      };
    }
  }, [modelType]);

  // Check IndexedDB on mount for transferred image
  useEffect(() => {
    let cancelled = false;
    getImage().then((img) => {
      if (cancelled || !img) return;
      clearImage();
      const file = new File([img.blob], img.name, { type: img.mimeType });
      handleFiles([file]);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Update progress for a specific result
  const updateProgress = useCallback((id: string, progress: number) => {
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, progress: Math.round(progress) } : r))
    );
  }, []);

  // Remove background using @imgly/background-removal (general purpose)
  const removeBackgroundImgly = useCallback(
    async (blob: Blob, id: string): Promise<Blob> => {
      const { removeBackground } = await import('@imgly/background-removal');
      return removeBackground(blob, {
        model: 'isnet_quint8',
        device: 'gpu',
        output: { format: 'image/png', quality: 1 },
        progress: (_key: string, current: number, total: number) => {
          if (total > 0) {
            updateProgress(id, (current / total) * 100);
          }
        },
      });
    },
    [updateProgress]
  );

  // Remove background using MediaPipe ImageSegmenter (selfie/people)
  const removeBackgroundMediaPipe = useCallback(
    async (blob: Blob, id: string): Promise<Blob> => {
      let segmenter = segmenterRef.current;
      if (!segmenter) {
        segmenter = await loadSegmenter();
        segmenterRef.current = segmenter;
        setModelReady(true);
      }

      // MediaPipe has no progress callback — use fake progress
      const stopFake = startFakeProgress((pct) => updateProgress(id, pct));

      try {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = url;
        });
        URL.revokeObjectURL(url);

        let maskData: Float32Array | null = null;
        segmenter.segment(
          img,
          (result: {
            confidenceMasks?: Array<{ getAsFloat32Array(): Float32Array }>;
          }) => {
            if (result.confidenceMasks && result.confidenceMasks.length > 0) {
              const mask = result.confidenceMasks[0];
              maskData = new Float32Array(mask.getAsFloat32Array());
            }
          }
        );

        if (!maskData) throw new Error('Segmentation failed');

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        for (let i = 0; i < (maskData as Float32Array).length; i++) {
          pixels[i * 4 + 3] = Math.round((maskData as Float32Array)[i] * 255);
        }

        ctx.putImageData(imageData, 0, 0);

        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))),
            'image/png'
          );
        });
      } finally {
        stopFake();
        updateProgress(id, 100);
      }
    },
    [updateProgress]
  );

  // Dispatch to selected model
  const removeBackgroundFromBlob = useCallback(
    async (blob: Blob, id: string): Promise<Blob> => {
      if (modelType === 'selfie') {
        return removeBackgroundMediaPipe(blob, id);
      }
      return removeBackgroundImgly(blob, id);
    },
    [modelType, removeBackgroundImgly, removeBackgroundMediaPipe]
  );

  const processSingleImage = useCallback(
    async (file: File, id: string): Promise<void> => {
      setResults((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'processing' } : r)));

      try {
        if (abortRef.current) return;

        // Yield to browser before heavy work
        await new Promise((r) => setTimeout(r, 0));

        const pngBlob = await removeBackgroundFromBlob(file, id);

        if (abortRef.current) return;

        // Create original preview URL
        const originalUrl = URL.createObjectURL(file);
        urlsRef.current.push(originalUrl);

        // Create result preview URL
        const pngUrl = URL.createObjectURL(pngBlob);
        urlsRef.current.push(pngUrl);

        // Get dimensions
        const dimImg = new Image();
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          dimImg.onload = () => resolve({ width: dimImg.naturalWidth, height: dimImg.naturalHeight });
          dimImg.onerror = () => reject(new Error('Failed to read image dimensions'));
          dimImg.src = pngUrl;
        });

        // Auto-compress to WebP via existing worker
        let webpBlob: Blob | null = null;
        let webpUrl: string | null = null;

        try {
          const compressed = await compressWithWorker(pngBlob, file.name);
          if (compressed && compressed.type === 'image/webp') {
            webpBlob = compressed;
            webpUrl = URL.createObjectURL(compressed);
            urlsRef.current.push(webpUrl);
          }
        } catch {
          // WebP compression failed, that's okay — we still have PNG
        }

        if (abortRef.current) return;

        setResults((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: 'done' as const,
                  originalUrl,
                  pngBlob,
                  pngUrl,
                  webpBlob: webpBlob ?? undefined,
                  webpUrl: webpUrl ?? undefined,
                  width: dims.width,
                  height: dims.height,
                }
              : r
          )
        );
      } catch (err) {
        if (abortRef.current) return;
        setResults((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: 'error' as const,
                  error: err instanceof Error ? err.message : 'Background removal failed',
                }
              : r
          )
        );
      }
    },
    [removeBackgroundFromBlob]
  );

  const processQueue = useCallback(
    async (newEntries: BgResult[]) => {
      if (processingRef.current) return;
      processingRef.current = true;

      for (const entry of newEntries) {
        if (abortRef.current) break;
        await processSingleImage(entry.originalFile, entry.id);
      }

      processingRef.current = false;
    },
    [processSingleImage]
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
      const valid = files.filter((f) => validTypes.includes(f.type));
      if (valid.length === 0) return;

      abortRef.current = false;

      const newEntries: BgResult[] = valid.map((file) => ({
        id: String(++bgResultCounter),
        originalFile: file,
        status: 'pending' as const,
        progress: 0,
      }));

      setResults((prev) => [...prev, ...newEntries]);
      processQueue(newEntries);
    },
    [processQueue]
  );

  const handleClear = useCallback(() => {
    abortRef.current = true;
    processingRef.current = false;
    revokeUrls();
    setResults([]);
    setSliderPos(50);
  }, [revokeUrls]);

  const handleDownloadPng = useCallback((r: BgResult) => {
    if (!r.pngBlob) return;
    downloadSingle(r.pngBlob, r.originalFile.name, 'image/png', 'nobg');
  }, []);

  const handleDownloadWebp = useCallback((r: BgResult) => {
    if (!r.webpBlob) return;
    downloadSingle(r.webpBlob, r.originalFile.name, 'image/webp', 'nobg');
  }, []);

  const handleDownloadAll = useCallback(async () => {
    const doneResults = results.filter((r) => r.status === 'done' && r.pngBlob);
    const files = doneResults.map((r) => ({
      blob: r.pngBlob!,
      filename: getCompressedFilename(r.originalFile.name, 'image/png', 'nobg'),
    }));
    await downloadAll(files);
  }, [results]);

  const handleTransfer = useCallback(
    async (r: BgResult, target: 'edit' | 'compress') => {
      if (!r.pngBlob || !r.width || !r.height) return;
      const data: TransferImage = {
        blob: r.pngBlob,
        name: r.originalFile.name,
        mimeType: 'image/png',
        width: r.width,
        height: r.height,
        from: 'remove-bg',
      };
      await setImage(data);
      window.location.href = target === 'edit' ? '/edit' : '/';
    },
    []
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

  // Derived state
  const isProcessing = results.some((r) => r.status === 'processing' || r.status === 'pending');
  const doneCount = results.filter((r) => r.status === 'done').length;
  const totalCount = results.length;
  const isSingleDone = results.length === 1 && results[0].status === 'done';
  const singleResult = isSingleDone ? results[0] : null;

  // ── Model selector pills ──
  const modelSelector = (
    <div className="flex items-center justify-center gap-1 mb-4">
      <button
        onClick={() => setModelType('general')}
        disabled={isProcessing}
        className={`text-xs font-medium px-3.5 py-1.5 rounded-l-lg border transition-all cursor-pointer ${
          modelType === 'general'
            ? 'bg-gold/15 text-gold border-gold/40'
            : 'bg-white/5 text-text-secondary border-border hover:bg-white/8'
        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        General
      </button>
      <button
        onClick={() => setModelType('selfie')}
        disabled={isProcessing}
        className={`text-xs font-medium px-3.5 py-1.5 rounded-r-lg border border-l-0 transition-all cursor-pointer ${
          modelType === 'selfie'
            ? 'bg-gold/15 text-gold border-gold/40'
            : 'bg-white/5 text-text-secondary border-border hover:bg-white/8'
        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        Selfie
      </button>
    </div>
  );

  const modelHint = (
    <p className="text-center text-xs mt-3 text-text-secondary/50">
      {modelReady ? (
        <span className="text-success/70">
          {modelType === 'general' ? 'General model ready — best for logos, products, objects' : 'Selfie model ready — optimized for people'}
        </span>
      ) : (
        <span>Loading AI model in background...</span>
      )}
    </p>
  );

  // ── Idle state ──
  if (results.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        {modelSelector}
        <DropZone onFiles={handleFiles} />
        {modelHint}
      </div>
    );
  }

  // ── Single image processing → progress bar ──
  const isSingleProcessing = results.length === 1 && (results[0].status === 'processing' || results[0].status === 'pending');
  if (isSingleProcessing) {
    const r = results[0];
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <div className="rounded-xl border border-border bg-bg-card p-6 text-center space-y-4">
          <p className="text-sm text-text-primary font-medium truncate">{r.originalFile.name}</p>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-300 ease-out"
              style={{ width: `${r.progress}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary">
            Removing background... <span className="text-gold font-medium">{r.progress}%</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Single image done → beautiful before/after slider ──
  if (singleResult && singleResult.pngUrl && singleResult.originalUrl) {
    const r = singleResult;
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
            src={r.pngUrl}
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
              src={r.originalUrl}
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
              {r.width} x {r.height}px
            </span>
            <span>Original: {formatBytes(r.originalFile.size)}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-primary">PNG</span>
                <span className="text-xs text-text-secondary">{r.pngBlob ? formatBytes(r.pngBlob.size) : ''}</span>
              </div>
              <button
                onClick={() => handleDownloadPng(r)}
                className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md cursor-pointer transition-all"
              >
                Download PNG
              </button>
            </div>

            {r.webpBlob && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">WebP</span>
                  <span className="text-xs text-text-secondary">{formatBytes(r.webpBlob.size)}</span>
                  {r.pngBlob && r.webpBlob.size < r.pngBlob.size && (
                    <span className="text-xs text-success">
                      {Math.round((1 - r.webpBlob.size / r.pngBlob.size) * 100)}% smaller
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDownloadWebp(r)}
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
            onClick={() => handleTransfer(r, 'edit')}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all"
          >
            Send to Editor
          </button>
          <button
            onClick={() => handleTransfer(r, 'compress')}
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

  // ── Multi-image / in-progress view ──
  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Stats bar */}
      <div className="flex items-center justify-between py-3 border-b border-white/5">
        <div className="flex items-center gap-3 text-sm">
          {isProcessing && (
            <svg className="progress-ring w-4 h-4" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
            </svg>
          )}
          <span className="text-text-secondary">
            <span className="text-white font-semibold">{doneCount}</span>/{totalCount} processed
          </span>
        </div>
        <div className="flex items-center gap-3">
          {doneCount > 1 && (
            <button
              onClick={handleDownloadAll}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer"
            >
              Download All
            </button>
          )}
          <button
            onClick={handleClear}
            className="text-text-secondary/50 hover:text-error text-sm cursor-pointer transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Result cards */}
      <div className="py-1">
        {results.map((r, i) => (
          <BgResultCard
            key={r.id}
            result={r}
            index={i}
            onDownloadPng={handleDownloadPng}
            onDownloadWebp={handleDownloadWebp}
            onTransfer={handleTransfer}
          />
        ))}
      </div>

      {/* Add more */}
      <DropZone onFiles={handleFiles} disabled={isProcessing} compact />

      {/* Model status */}
      {!modelReady && (
        <p className="text-center text-xs mt-3 text-text-secondary/50">
          Loading AI model in background...
        </p>
      )}
    </div>
  );
}

// ── Individual result card for batch view ──
interface BgResultCardProps {
  result: BgResult;
  index: number;
  onDownloadPng: (r: BgResult) => void;
  onDownloadWebp: (r: BgResult) => void;
  onTransfer: (r: BgResult, target: 'edit' | 'compress') => void;
}

function BgResultCard({ result, index, onDownloadPng, onDownloadWebp, onTransfer }: BgResultCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const source = result.pngBlob ?? result.originalFile;
    const url = URL.createObjectURL(source);
    setThumbnailUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result.pngBlob, result.originalFile]);

  return (
    <div
      className="card-enter flex items-center gap-4 py-3.5 border-b border-white/5 last:border-b-0"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Thumbnail */}
      <div className={`w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-bg-primary ${result.status === 'processing' ? 'shimmer' : ''}`}>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            className={`w-full h-full object-cover ${result.status === 'processing' ? 'opacity-40' : ''}`}
            style={result.status === 'done' ? {
              backgroundImage:
                'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
            } : undefined}
          />
        )}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm font-medium truncate">{result.originalFile.name}</p>
        {result.status === 'processing' && (
          <span className="text-gold text-xs">Removing background... {result.progress}%</span>
        )}
        {result.status === 'pending' && (
          <span className="text-text-secondary/50 text-xs">Queued</span>
        )}
        {result.status === 'error' && (
          <span className="text-error text-xs">{result.error ?? 'Failed'}</span>
        )}
        {result.status === 'done' && result.pngBlob && (
          <span className="text-text-secondary text-xs">
            {result.width} x {result.height}px &middot; PNG {formatBytes(result.pngBlob.size)}
            {result.webpBlob && ` · WebP ${formatBytes(result.webpBlob.size)}`}
          </span>
        )}
      </div>

      {/* Actions when done */}
      {result.status === 'done' && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onDownloadPng(result)}
            className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-3.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer"
          >
            PNG
          </button>
          {result.webpBlob && (
            <button
              onClick={() => onDownloadWebp(result)}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-3.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer"
            >
              WebP
            </button>
          )}
          <button
            onClick={() => onTransfer(result, 'edit')}
            className="text-xs px-2.5 py-1.5 rounded-md text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/8 transition-all duration-200 cursor-pointer"
          >
            Edit
          </button>
        </div>
      )}

      {/* Progress percentage when processing */}
      {result.status === 'processing' && (
        <span className="text-gold text-xs font-medium shrink-0 tabular-nums w-8 text-right">
          {result.progress}%
        </span>
      )}
    </div>
  );
}
