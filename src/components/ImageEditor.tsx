import { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import DropZone from './DropZone';
import { getImage, setImage, clearImage } from '../lib/image-transfer';
import { downloadSingle } from '../lib/download';
import type { EditMessage, EditResultMessage, EditErrorMessage } from '../workers/edit-worker';
import type { FaceDetector as FaceDetectorType, FaceDetectorResult } from '@mediapipe/tasks-vision';

/* ── Types ── */
type Tool = 'crop' | 'resize' | 'rotate' | 'flip' | 'faceblur' | 'smartcrop';

interface BoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

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

/* ── Social media crop presets ── */
const SOCIAL_PRESETS = [
  { label: 'IG Post', aspect: 4 / 5, desc: '1080×1350' },
  { label: 'IG Story', aspect: 9 / 16, desc: '1080×1920' },
  { label: 'Twitter', aspect: 16 / 9, desc: '1200×675' },
  { label: 'FB Cover', aspect: 205 / 78, desc: '820×312' },
  { label: 'YT Thumb', aspect: 16 / 9, desc: '1280×720' },
] as const;

/* ── Tool definitions ── */
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'crop', label: 'Crop', icon: 'M4 4h4v16H4V4zm12 0h4v16h-4V4zM4 4h16v4H4V4zm0 12h16v4H4v-4z' },
  { id: 'resize', label: 'Resize', icon: 'M4 8V4h4M4 16v4h4M20 8V4h-4M20 16v4h-4' },
  { id: 'rotate', label: 'Rotate', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  { id: 'flip', label: 'Flip', icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4' },
  { id: 'faceblur', label: 'Face Blur', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
  { id: 'smartcrop', label: 'Smart Crop', icon: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

/* ── Face blur helper ── */
function applyFaceBlur(img: HTMLImageElement, faces: BoundingBox[], blurRadius: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  ctx.filter = `blur(${blurRadius}px)`;
  for (const face of faces) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(face.originX, face.originY, face.width, face.height);
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  ctx.filter = 'none';

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))), 'image/png');
  });
}

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

  /* ── AI face detection state ── */
  const [detectedFaces, setDetectedFaces] = useState<BoundingBox[]>([]);
  const [detectingFaces, setDetectingFaces] = useState(false);
  const [blurRadius, setBlurRadius] = useState(20);

  const imgRef = useRef<HTMLImageElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const faceDetectorRef = useRef<FaceDetectorType | null>(null);

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

  /* ── Initialize FaceDetector (shared between faceblur and smartcrop) ── */
  const getFaceDetector = useCallback(async (): Promise<FaceDetectorType> => {
    if (faceDetectorRef.current) return faceDetectorRef.current;
    const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );
    const detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
    });
    faceDetectorRef.current = detector;
    return detector;
  }, []);

  /* ── Detect faces on current image ── */
  const detectFaces = useCallback(async () => {
    if (!imgRef.current || !image) return;
    setDetectingFaces(true);
    setDetectedFaces([]);
    try {
      const detector = await getFaceDetector();
      // FaceDetector needs the image to be loaded; use the displayed img element
      const result: FaceDetectorResult = detector.detect(imgRef.current);
      const faces = result.detections
        .filter((d) => d.boundingBox)
        .map((d) => ({
          originX: d.boundingBox.originX,
          originY: d.boundingBox.originY,
          width: d.boundingBox.width,
          height: d.boundingBox.height,
        }));
      setDetectedFaces(faces);
      if (faces.length === 0) {
        showToast('No faces detected');
      }
    } catch (err) {
      console.error('Face detection failed:', err);
      showToast('Face detection failed');
    } finally {
      setDetectingFaces(false);
    }
  }, [image, getFaceDetector, showToast]);

  /* ── Auto-detect faces when switching to faceblur or smartcrop ── */
  useEffect(() => {
    if ((activeTool === 'faceblur' || activeTool === 'smartcrop') && image && imgRef.current) {
      // Wait a tick for the img element to render with the latest src
      const timer = setTimeout(() => detectFaces(), 100);
      return () => clearTimeout(timer);
    }
    if (activeTool !== 'faceblur' && activeTool !== 'smartcrop') {
      setDetectedFaces([]);
    }
  }, [activeTool, image]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Smart crop: compute crop from detected faces ── */
  useEffect(() => {
    if (activeTool !== 'smartcrop' || detectedFaces.length === 0 || !image || !imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.width / image.width;
    const scaleY = img.height / image.height;

    // Find bounding box of all faces (in natural image coordinates)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const face of detectedFaces) {
      minX = Math.min(minX, face.originX);
      minY = Math.min(minY, face.originY);
      maxX = Math.max(maxX, face.originX + face.width);
      maxY = Math.max(maxY, face.originY + face.height);
    }

    // Add 30% padding
    const padX = (maxX - minX) * 0.3;
    const padY = (maxY - minY) * 0.3;
    minX = Math.max(0, minX - padX);
    minY = Math.max(0, minY - padY);
    maxX = Math.min(image.width, maxX + padX);
    maxY = Math.min(image.height, maxY + padY);

    // Convert to display coordinates for ReactCrop
    setCrop({
      unit: 'px',
      x: minX * scaleX,
      y: minY * scaleY,
      width: (maxX - minX) * scaleX,
      height: (maxY - minY) * scaleY,
    });
  }, [detectedFaces, activeTool, image]);

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

  /* ── Reset to original ── */
  const handleReset = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const original = prev[0];
      setImageState(original);
      setCrop(undefined);
      return [];
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

  /* ── Face blur apply ── */
  const handleFaceBlurApply = useCallback(async () => {
    if (!image || !imgRef.current || detectedFaces.length === 0 || processing) return;
    pushUndo(image);
    setProcessing(true);
    try {
      // Create a full-resolution image element for blur
      const fullImg = new Image();
      fullImg.crossOrigin = 'anonymous';
      const url = URL.createObjectURL(image.blob);
      await new Promise<void>((resolve, reject) => {
        fullImg.onload = () => resolve();
        fullImg.onerror = () => reject(new Error('Failed to load image'));
        fullImg.src = url;
      });
      const blob = await applyFaceBlur(fullImg, detectedFaces, blurRadius);
      URL.revokeObjectURL(url);
      setImageState({ blob, width: image.width, height: image.height, name: image.name });
      setDetectedFaces([]);
      showToast('Face blur applied');
    } catch (err) {
      console.error('Face blur failed:', err);
      showToast('Face blur failed');
      // revert undo
      setUndoStack((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const reverted = next.pop()!;
        setImageState(reverted);
        return next;
      });
    } finally {
      setProcessing(false);
    }
  }, [image, detectedFaces, blurRadius, processing, pushUndo, showToast]);

  /* ── Smart crop apply (reuses handleCropApply) ── */
  const handleSmartCropApply = handleCropApply;

  /* ── Download ── */
  const handleDownload = useCallback(() => {
    if (!image) return;
    downloadSingle(image.blob, image.name, image.blob.type || 'image/png', 'edited');
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

  /* ── Compute face overlay boxes (display coordinates) ── */
  const faceOverlayBoxes = (activeTool === 'faceblur' || activeTool === 'smartcrop') && imgRef.current && image
    ? detectedFaces.map((face) => {
        const img = imgRef.current!;
        const scaleX = img.width / image.width;
        const scaleY = img.height / image.height;
        return {
          left: face.originX * scaleX,
          top: face.originY * scaleY,
          width: face.width * scaleX,
          height: face.height * scaleY,
        };
      })
    : [];

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

          {/* Reset to original */}
          <button
            onClick={handleReset}
            disabled={undoStack.length === 0 || processing}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="Reset to original"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">Aspect:</span>
              <div className="flex gap-1 bg-bg-primary/60 border border-border rounded-xl p-1">
                {ASPECT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => { setAspectRatio(preset.value); setCrop(undefined); }}
                    className={`text-xs px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer ${
                      aspectRatio === preset.value
                        ? 'bg-gold text-bg-primary font-semibold'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">Social:</span>
              <div className="flex gap-1 flex-wrap">
                {SOCIAL_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => { setAspectRatio(preset.aspect); setCrop(undefined); }}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all duration-200 cursor-pointer ${
                      aspectRatio === preset.aspect
                        ? 'bg-gold/20 border-gold/60 text-gold font-semibold'
                        : 'bg-bg-primary/40 border-border text-text-secondary hover:text-text-primary hover:border-border/80'
                    }`}
                  >
                    <span>{preset.label}</span>
                    <span className="text-[10px] opacity-60">{preset.desc}</span>
                  </button>
                ))}
              </div>
            </div>

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

        {activeTool === 'faceblur' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-text-secondary">
                {detectingFaces
                  ? 'Detecting faces...'
                  : detectedFaces.length > 0
                    ? `${detectedFaces.length} face${detectedFaces.length > 1 ? 's' : ''} detected`
                    : 'No faces found'}
              </span>
              {detectingFaces && (
                <svg className="w-4 h-4 text-gold progress-ring" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                  <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              <button
                onClick={detectFaces}
                disabled={detectingFaces || processing}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Re-detect
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-text-secondary">Blur intensity:</label>
              <input
                type="range"
                min={10}
                max={50}
                value={blurRadius}
                onChange={(e) => setBlurRadius(Number(e.target.value))}
                className="w-32 accent-gold"
              />
              <span className="text-xs text-text-primary">{blurRadius}px</span>
              <button
                onClick={handleFaceBlurApply}
                disabled={detectedFaces.length === 0 || processing || detectingFaces}
                className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
              >
                Apply Blur
              </button>
            </div>
          </div>
        )}

        {activeTool === 'smartcrop' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-text-secondary">
                {detectingFaces
                  ? 'Detecting faces...'
                  : detectedFaces.length > 0
                    ? `${detectedFaces.length} face${detectedFaces.length > 1 ? 's' : ''} detected — crop region auto-set`
                    : 'No faces detected — try manual crop'}
              </span>
              {detectingFaces && (
                <svg className="w-4 h-4 text-gold progress-ring" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                  <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              <button
                onClick={detectFaces}
                disabled={detectingFaces || processing}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Re-detect
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-text-secondary">
                {crop && crop.width > 0
                  ? `Crop: ${Math.round(crop.width)} x ${Math.round(crop.height)}px (display) — adjust if needed`
                  : 'Select a crop area or detect faces to auto-crop'}
              </p>
              <button
                onClick={handleSmartCropApply}
                disabled={!crop || crop.width === 0 || processing}
                className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply Crop
              </button>
            </div>
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

        {previewUrl && (activeTool === 'crop' || activeTool === 'smartcrop') ? (
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} disabled={processing} aspect={activeTool === 'crop' ? aspectRatio : undefined}>
            <img
              ref={imgRef}
              src={previewUrl}
              alt="Edit preview"
              className="max-w-full max-h-[60vh] object-contain"
              draggable={false}
            />
          </ReactCrop>
        ) : previewUrl ? (
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={previewUrl}
              alt="Edit preview"
              className="max-w-full max-h-[60vh] object-contain"
              draggable={false}
            />
            {/* Face detection overlay */}
            {activeTool === 'faceblur' && faceOverlayBoxes.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {faceOverlayBoxes.map((box, i) => (
                  <div
                    key={i}
                    className="absolute border-2 border-gold rounded-md"
                    style={{
                      left: `${box.left}px`,
                      top: `${box.top}px`,
                      width: `${box.width}px`,
                      height: `${box.height}px`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 text-[10px] text-gold bg-bg-primary/80 px-1 rounded">
                      Face {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
