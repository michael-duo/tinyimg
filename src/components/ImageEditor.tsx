import { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import DropZone from './DropZone';
import { getImage, setImage, clearImage } from '../lib/image-transfer';
import { downloadSingle } from '../lib/download';
import type { EditMessage, EditResultMessage, EditErrorMessage } from '../workers/edit-worker';

/* ── Types ── */
type Tool = 'crop' | 'resize' | 'rotate' | 'flip';

interface ImageState {
  blob: Blob;
  width: number;
  height: number;
  name: string;
}

const MAX_UNDO = 10;

/* ── Aspect ratio presets ── */
const ASPECT_PRESETS = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
] as const;

/* ── Tool definitions ── */
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'crop', label: 'Crop', icon: 'M4 4h4v16H4V4zm12 0h4v16h-4V4zM4 4h16v4H4V4zm0 12h16v4H4v-4z' },
  { id: 'resize', label: 'Resize', icon: 'M4 8V4h4M4 16v4h4M20 8V4h-4M20 16v4h-4' },
  { id: 'rotate', label: 'Rotate', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  { id: 'flip', label: 'Flip', icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4' },
];

export default function ImageEditor() {
  /* ── Core state ── */
  const [image, setImageState] = useState<ImageState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('crop');
  const [processing, setProcessing] = useState(false);
  const [undoStack, setUndoStack] = useState<ImageState[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  /* ── Tool-specific state ── */
  const [crop, setCrop] = useState<Crop>();
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  const [resizeW, setResizeW] = useState('');
  const [resizeH, setResizeH] = useState('');
  const [lockAspect, setLockAspect] = useState(true);

  const imgRef = useRef<HTMLImageElement>(null);
  const workerRef = useRef<Worker | null>(null);

  /* ── Toast helper ── */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  /* ── Preview URL management ── */
  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  /* ── Sync resize fields when image changes ── */
  useEffect(() => {
    if (image) {
      setResizeW(String(image.width));
      setResizeH(String(image.height));
    }
  }, [image]);

  /* ── On mount: check IndexedDB transfer ── */
  useEffect(() => {
    (async () => {
      const transferred = await getImage();
      if (transferred) {
        setImageState({
          blob: transferred.blob,
          width: transferred.width,
          height: transferred.height,
          name: transferred.name,
        });
        await clearImage();
      }
    })();
  }, []);

  /* ── File upload handler ── */
  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageState({
        blob: file,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
      });
      setUndoStack([]);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      showToast('Failed to load image');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [showToast]);

  /* ── Push to undo stack ── */
  const pushUndo = useCallback((state: ImageState) => {
    setUndoStack((prev) => {
      const next = [...prev, state];
      if (next.length > MAX_UNDO) next.shift();
      return next;
    });
  }, []);

  /* ── Undo ── */
  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.pop()!;
      setImageState(last);
      return next;
    });
  }, []);

  /* ── Send operation to worker ── */
  const applyEdit = useCallback(
    (operation: EditMessage['operation'], params: EditMessage['params']) => {
      if (!image || processing) return;

      pushUndo(image);
      setProcessing(true);

      const worker = new Worker(
        new URL('../workers/edit-worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<EditResultMessage | EditErrorMessage>) => {
        if (e.data.type === 'result') {
          const { blob, width, height } = e.data as EditResultMessage;
          setImageState({ blob, width, height, name: image.name });
          setCrop(undefined);
        } else {
          const { message } = e.data as EditErrorMessage;
          showToast(message);
          // revert undo push
          setUndoStack((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const reverted = next.pop()!;
            setImageState(reverted);
            return next;
          });
        }
        setProcessing(false);
        worker.terminate();
        workerRef.current = null;
      };

      worker.onerror = () => {
        showToast('Worker error occurred');
        setProcessing(false);
        worker.terminate();
        workerRef.current = null;
      };

      const msg: EditMessage = { type: 'edit', blob: image.blob, mimeType: image.blob.type || 'image/png', operation, params };
      worker.postMessage(msg);
    },
    [image, processing, pushUndo, showToast]
  );

  /* ── Tool actions ── */
  const handleCropApply = useCallback(() => {
    if (!crop || !image || !imgRef.current) return;
    const img = imgRef.current;
    const scaleX = image.width / img.width;
    const scaleY = image.height / img.height;
    applyEdit('crop', {
      x: Math.round(crop.x * scaleX),
      y: Math.round(crop.y * scaleY),
      width: Math.round(crop.width * scaleX),
      height: Math.round(crop.height * scaleY),
    });
  }, [crop, image, applyEdit]);

  const handleResize = useCallback(() => {
    const w = parseInt(resizeW, 10);
    const h = parseInt(resizeH, 10);
    if (!w || !h || w < 1 || h < 1) {
      showToast('Enter valid dimensions');
      return;
    }
    applyEdit('resize', { targetWidth: w, targetHeight: h });
  }, [resizeW, resizeH, applyEdit, showToast]);

  const handleResizeW = useCallback(
    (val: string) => {
      setResizeW(val);
      if (lockAspect && image) {
        const w = parseInt(val, 10);
        if (w > 0) {
          setResizeH(String(Math.round(w * (image.height / image.width))));
        }
      }
    },
    [lockAspect, image]
  );

  const handleResizeH = useCallback(
    (val: string) => {
      setResizeH(val);
      if (lockAspect && image) {
        const h = parseInt(val, 10);
        if (h > 0) {
          setResizeW(String(Math.round(h * (image.width / image.height))));
        }
      }
    },
    [lockAspect, image]
  );

  const handleRotate = useCallback(
    (degrees: 90 | 180 | 270) => applyEdit('rotate', { degrees }),
    [applyEdit]
  );

  const handleFlip = useCallback(
    (direction: 'horizontal' | 'vertical') => applyEdit('flip', { direction }),
    [applyEdit]
  );

  /* ── Download ── */
  const handleDownload = useCallback(() => {
    if (!image) return;
    downloadSingle(image.blob, image.name, image.blob.type || 'image/png');
  }, [image]);

  /* ── Transfer to other tool ── */
  const handleTransfer = useCallback(
    async (target: string) => {
      if (!image) return;
      await setImage({
        blob: image.blob,
        name: image.name,
        mimeType: image.blob.type || 'image/png',
        width: image.width,
        height: image.height,
        from: 'edit',
      });
      window.location.href = target;
    },
    [image]
  );

  /* ── No image: show DropZone ── */
  if (!image) {
    return (
      <div className="max-w-xl mx-auto">
        <DropZone onFiles={handleFiles} />
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-bg-card border border-border rounded-lg px-4 py-2 text-sm text-text-primary toast-enter shadow-lg">
          {toast}
        </div>
      )}

      {/* Toolbar: tool pills */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-bg-primary/60 border border-border rounded-xl p-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              disabled={processing}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                activeTool === tool.id
                  ? 'bg-gold text-bg-primary font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} />
              </svg>
              {tool.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0 || processing}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
            </svg>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={processing}
            className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Download
          </button>
        </div>
      </div>

      {/* Context bar per tool */}
      <div className="bg-bg-card border border-border rounded-xl px-4 py-3">
        {activeTool === 'crop' && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-text-secondary">
              Drag on the image to select a crop area
              {crop && crop.width > 0 && (
                <span className="ml-2 text-text-primary">
                  {Math.round(crop.width)} x {Math.round(crop.height)}px (display)
                </span>
              )}
            </p>
            <button
              onClick={handleCropApply}
              disabled={!crop || crop.width === 0 || processing}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply Crop
            </button>
          </div>
        )}

        {activeTool === 'resize' && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-text-secondary">W</label>
            <input
              type="number"
              min={1}
              value={resizeW}
              onChange={(e) => handleResizeW(e.target.value)}
              className="w-20 bg-bg-primary border border-border rounded-md px-2 py-1.5 text-xs text-text-primary outline-none focus:border-gold/50 transition-colors"
            />
            <button
              onClick={() => setLockAspect(!lockAspect)}
              className={`text-xs px-2 py-1.5 rounded-md transition-all cursor-pointer ${
                lockAspect ? 'text-gold bg-gold/10' : 'text-text-secondary bg-white/5'
              }`}
              title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {lockAspect ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                )}
              </svg>
            </button>
            <label className="text-xs text-text-secondary">H</label>
            <input
              type="number"
              min={1}
              value={resizeH}
              onChange={(e) => handleResizeH(e.target.value)}
              className="w-20 bg-bg-primary border border-border rounded-md px-2 py-1.5 text-xs text-text-primary outline-none focus:border-gold/50 transition-colors"
            />
            <span className="text-xs text-text-secondary">
              {image.width} x {image.height}
            </span>
            <button
              onClick={handleResize}
              disabled={processing}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
            >
              Apply Resize
            </button>
          </div>
        )}

        {activeTool === 'rotate' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary mr-2">Rotate:</span>
            {([90, 180, 270] as const).map((deg) => (
              <button
                key={deg}
                onClick={() => handleRotate(deg)}
                disabled={processing}
                className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deg}°
              </button>
            ))}
          </div>
        )}

        {activeTool === 'flip' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary mr-2">Flip:</span>
            <button
              onClick={() => handleFlip('horizontal')}
              disabled={processing}
              className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Horizontal
            </button>
            <button
              onClick={() => handleFlip('vertical')}
              disabled={processing}
              className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Vertical
            </button>
          </div>
        )}
      </div>

      {/* Canvas preview area */}
      <div className="relative bg-bg-card border border-border rounded-xl p-4 flex items-center justify-center min-h-[300px] overflow-hidden">
        {/* Processing overlay */}
        {processing && (
          <div className="absolute inset-0 bg-bg-primary/70 z-10 flex items-center justify-center rounded-xl">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 text-gold progress-ring" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-xs text-text-secondary">Processing...</span>
            </div>
          </div>
        )}

        {previewUrl && activeTool === 'crop' ? (
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} disabled={processing}>
            <img
              ref={imgRef}
              src={previewUrl}
              alt="Edit preview"
              className="max-w-full max-h-[60vh] object-contain"
              draggable={false}
            />
          </ReactCrop>
        ) : previewUrl ? (
          <img
            ref={imgRef}
            src={previewUrl}
            alt="Edit preview"
            className="max-w-full max-h-[60vh] object-contain"
            draggable={false}
          />
        ) : null}
      </div>

      {/* Image info + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-text-secondary">
        <div className="flex items-center gap-3">
          <span>{image.name}</span>
          <span>{image.width} x {image.height}</span>
          <span>{(image.blob.size / 1024).toFixed(1)} KB</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-text-secondary">Send to:</span>
          <button
            onClick={() => handleTransfer('/')}
            disabled={processing}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Compress
          </button>
          <button
            onClick={() => handleTransfer('/remove-bg')}
            disabled={processing}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Remove BG
          </button>
        </div>
      </div>

      {/* Add another image */}
      <DropZone onFiles={handleFiles} compact disabled={processing} />
    </div>
  );
}
