# Image Editor & Background Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image editor (crop/resize/rotate/flip) and AI background removal to TinyIMG, with seamless tool-chaining via IndexedDB.

**Architecture:** Three independent Astro pages (`/`, `/edit`, `/remove-bg`), each with its own React island. Images transfer between tools via IndexedDB (`idb-keyval`). Edit operations run in a Web Worker on OffscreenCanvas. Background removal runs on main thread via `@imgly/background-removal` (library manages its own ONNX offloading).

**Tech Stack:** Astro 5, React 18, Tailwind CSS 4, `idb-keyval`, `react-image-crop`, `@imgly/background-removal`, Web Workers, OffscreenCanvas

**Spec:** `docs/superpowers/specs/2026-03-22-edit-removebg-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/image-transfer.ts` | IndexedDB wrapper — `setImage()`, `getImage()`, `clearImage()` |
| `src/workers/edit-worker.ts` | Web Worker — crop, resize, rotate, flip on OffscreenCanvas |
| `src/components/ImageEditor.tsx` | React island — editor UI, canvas preview, toolbar, undo stack |
| `src/components/BackgroundRemover.tsx` | React island — bg removal UI, before/after slider, progress |
| `src/components/MoreTools.astro` | Static section — 2 cards linking to `/edit` and `/remove-bg` |
| `src/pages/edit.astro` | Astro page — SEO + ImageEditor island |
| `src/pages/remove-bg.astro` | Astro page — SEO + BackgroundRemover island |
| `src/components/Header.astro` | Modified — add tool nav links |
| `src/components/ResultCard.tsx` | Modified — add "Edit" + "Remove BG" action buttons |
| `src/pages/index.astro` | Modified — add MoreTools section |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the 3 new packages**

```bash
npm install idb-keyval react-image-crop @imgly/background-removal
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add idb-keyval, react-image-crop, @imgly/background-removal deps"
```

---

## Task 2: Image Transfer System

**Files:**
- Create: `src/lib/image-transfer.ts`

- [ ] **Step 1: Create image-transfer.ts**

```typescript
import { get, set, del } from 'idb-keyval';

const TRANSFER_KEY = 'tinyimg-transfer';

export interface TransferImage {
  blob: Blob;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  from: 'compress' | 'edit' | 'remove-bg';
}

export async function setImage(data: TransferImage): Promise<void> {
  await set(TRANSFER_KEY, data);
}

export async function getImage(): Promise<TransferImage | null> {
  const data = await get<TransferImage>(TRANSFER_KEY);
  return data ?? null;
}

export async function clearImage(): Promise<void> {
  await del(TRANSFER_KEY);
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-transfer.ts
git commit -m "feat: add IndexedDB image transfer utility"
```

---

## Task 3: Edit Worker

**Files:**
- Create: `src/workers/edit-worker.ts`

- [ ] **Step 1: Create edit-worker.ts**

```typescript
export interface EditMessage {
  type: 'edit';
  blob: Blob;
  operation: 'crop' | 'resize' | 'rotate' | 'flip';
  params: {
    // crop
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    // resize
    targetWidth?: number;
    targetHeight?: number;
    // rotate
    degrees?: 90 | 180 | 270;
    // flip
    direction?: 'horizontal' | 'vertical';
  };
}

export interface EditResultMessage {
  type: 'result';
  blob: Blob;
  width: number;
  height: number;
}

export interface EditErrorMessage {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<EditMessage>) => {
  const { blob, operation, params } = e.data;

  try {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;

    let canvas: OffscreenCanvas;
    let ctx: OffscreenCanvasRenderingContext2D;

    switch (operation) {
      case 'crop': {
        const cx = params.x ?? 0;
        const cy = params.y ?? 0;
        const cw = params.width ?? width;
        const ch = params.height ?? height;
        canvas = new OffscreenCanvas(cw, ch);
        ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, cw, ch);
        width = cw;
        height = ch;
        break;
      }

      case 'resize': {
        const tw = params.targetWidth ?? width;
        const th = params.targetHeight ?? height;
        canvas = new OffscreenCanvas(tw, th);
        ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0, tw, th);
        width = tw;
        height = th;
        break;
      }

      case 'rotate': {
        const deg = params.degrees ?? 90;
        const swap = deg === 90 || deg === 270;
        const cw2 = swap ? height : width;
        const ch2 = swap ? width : height;
        canvas = new OffscreenCanvas(cw2, ch2);
        ctx = canvas.getContext('2d')!;
        ctx.translate(cw2 / 2, ch2 / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(bitmap, -width / 2, -height / 2);
        width = cw2;
        height = ch2;
        break;
      }

      case 'flip': {
        canvas = new OffscreenCanvas(width, height);
        ctx = canvas.getContext('2d')!;
        if (params.direction === 'horizontal') {
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
        } else {
          ctx.translate(0, height);
          ctx.scale(1, -1);
        }
        ctx.drawImage(bitmap, 0, 0);
        break;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    bitmap.close();

    // Encode as PNG to preserve quality between edits (lossless)
    const resultBlob = await canvas.convertToBlob({ type: 'image/png' });

    const response: EditResultMessage = {
      type: 'result',
      blob: resultBlob,
      width,
      height,
    };
    self.postMessage(response);
  } catch (err) {
    const response: EditErrorMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown edit error',
    };
    self.postMessage(response);
  }
};
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/workers/edit-worker.ts
git commit -m "feat: add edit worker for crop/resize/rotate/flip"
```

---

## Task 4: Image Editor Component

**Files:**
- Create: `src/components/ImageEditor.tsx`

This is the largest component. It manages:
- Image loading (from IndexedDB transfer or file upload via DropZone)
- Canvas preview rendering
- Toolbar with 4 tools (crop, resize, rotate, flip)
- Context bar that changes per active tool
- Undo stack (max 10 states)
- Transfer to other tools + download

- [ ] **Step 1: Create ImageEditor.tsx**

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import DropZone from './DropZone';
import { getImage, clearImage, setImage as transferImage } from '../lib/image-transfer';
import { downloadSingle } from '../lib/download';
import type { EditMessage, EditResultMessage, EditErrorMessage } from '../workers/edit-worker';

type EditorTool = 'crop' | 'resize' | 'rotate' | 'flip';

interface ImageState {
  blob: Blob;
  width: number;
  height: number;
  name: string;
}

const MAX_UNDO = 10;

const ASPECT_PRESETS = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
] as const;

export default function ImageEditor() {
  // Image state
  const [image, setImage] = useState<ImageState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<ImageState[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Tool state
  const [activeTool, setActiveTool] = useState<EditorTool>('crop');
  const [crop, setCrop] = useState<Crop>();
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);

  const workerRef = useRef<Worker | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load transferred image on mount
  useEffect(() => {
    getImage().then((transferred) => {
      if (transferred) {
        loadImage({
          blob: transferred.blob,
          width: transferred.width,
          height: transferred.height,
          name: transferred.name,
        });
        clearImage();
      }
    });
  }, []);

  // Update preview URL when image changes
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image.blob);
    setPreviewUrl(url);
    setResizeWidth(image.width);
    setResizeHeight(image.height);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function loadImage(state: ImageState) {
    setImage(state);
    setUndoStack([]);
    setCrop(undefined);
  }

  const handleFiles = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      loadImage({ blob: file, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  async function applyEdit(operation: EditMessage['operation'], params: EditMessage['params']) {
    if (!image || isProcessing) return;
    setIsProcessing(true);

    // Push current state to undo stack
    setUndoStack((prev) => {
      const next = [...prev, image];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });

    try {
      if (workerRef.current) workerRef.current.terminate();
      const worker = new Worker(new URL('../workers/edit-worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      const result = await new Promise<EditResultMessage>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Edit timed out')), 30000);
        worker.onmessage = (e: MessageEvent<EditResultMessage | EditErrorMessage>) => {
          clearTimeout(timeout);
          if (e.data.type === 'error') reject(new Error(e.data.message));
          else resolve(e.data);
        };
        worker.postMessage({ type: 'edit', blob: image.blob, operation, params });
      });

      worker.terminate();
      workerRef.current = null;

      setImage({ blob: result.blob, width: result.width, height: result.height, name: image.name });
      setCrop(undefined);
    } catch (err) {
      console.error('Edit failed:', err);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setImage(prev);
    setCrop(undefined);
  }

  function handleReset() {
    if (undoStack.length === 0) return;
    const first = undoStack[0];
    setUndoStack([]);
    setImage(first);
    setCrop(undefined);
  }

  function handleApplyCrop() {
    if (!crop || !imgRef.current || !image) return;
    // Convert percentage crop to pixel values
    const displayW = imgRef.current.width;
    const displayH = imgRef.current.height;
    const scaleX = image.width / displayW;
    const scaleY = image.height / displayH;
    const px = Math.round(crop.x * scaleX);
    const py = Math.round(crop.y * scaleY);
    const pw = Math.round(crop.width * scaleX);
    const ph = Math.round(crop.height * scaleY);
    if (pw < 1 || ph < 1) return;
    applyEdit('crop', { x: px, y: py, width: pw, height: ph });
  }

  function handleResizeApply() {
    if (!image || resizeWidth < 1 || resizeHeight < 1) return;
    applyEdit('resize', { targetWidth: resizeWidth, targetHeight: resizeHeight });
  }

  function handleResizeWidthChange(w: number) {
    setResizeWidth(w);
    if (lockAspect && image && image.width > 0) {
      setResizeHeight(Math.round((w / image.width) * image.height));
    }
  }

  function handleResizeHeightChange(h: number) {
    setResizeHeight(h);
    if (lockAspect && image && image.height > 0) {
      setResizeWidth(Math.round((h / image.height) * image.width));
    }
  }

  async function handleTransfer(target: '/remove-bg' | '/') {
    if (!image) return;
    await transferImage({
      blob: image.blob,
      name: image.name,
      mimeType: image.blob.type,
      width: image.width,
      height: image.height,
      from: 'edit',
    });
    window.location.href = target;
  }

  function handleDownload() {
    if (!image) return;
    downloadSingle(image.blob, image.name, image.blob.type);
  }

  // ── No image loaded: show DropZone ──
  if (!image) {
    return (
      <div className="flex flex-col gap-5">
        <DropZone onFiles={handleFiles} />
        <p className="text-text-secondary text-xs text-center">Upload an image to start editing</p>
      </div>
    );
  }

  // ── Editor UI ──
  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 justify-center">
        {(['crop', 'resize', 'rotate', 'flip'] as const).map((tool) => (
          <button
            key={tool}
            onClick={() => setActiveTool(tool)}
            className={`text-xs px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer capitalize ${
              activeTool === tool
                ? 'bg-gold text-bg-primary font-semibold'
                : 'text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/8'
            }`}
          >
            {tool}
          </button>
        ))}
      </div>

      {/* Canvas preview */}
      <div className="relative flex justify-center bg-bg-primary/60 rounded-xl p-4 min-h-[300px] items-center">
        {activeTool === 'crop' && previewUrl ? (
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            aspect={aspectRatio}
            className="max-h-[60vh]"
          >
            <img
              ref={imgRef}
              src={previewUrl}
              alt="Edit preview"
              className="max-h-[60vh] max-w-full object-contain"
              draggable={false}
            />
          </ReactCrop>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt="Edit preview"
            className="max-h-[60vh] max-w-full object-contain"
          />
        ) : null}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
            <svg className="progress-ring w-8 h-8" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Dimensions info */}
      <p className="text-text-secondary text-xs text-center">
        {image.width} x {image.height}px
      </p>

      {/* Context bar */}
      <div className="flex items-center justify-center gap-3 min-h-[44px]">
        {activeTool === 'crop' && (
          <>
            <div className="flex gap-1.5 bg-bg-primary/60 border border-border rounded-xl p-1">
              {ASPECT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => { setAspectRatio(preset.value); setCrop(undefined); }}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                    aspectRatio === preset.value
                      ? 'bg-gold text-bg-primary font-semibold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleApplyCrop}
              disabled={!crop || isProcessing}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply Crop
            </button>
          </>
        )}

        {activeTool === 'resize' && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-text-secondary text-xs">W</label>
              <input
                type="number"
                value={resizeWidth}
                onChange={(e) => handleResizeWidthChange(Number(e.target.value))}
                className="w-20 bg-bg-primary border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-gold/50"
              />
            </div>
            <button
              onClick={() => setLockAspect(!lockAspect)}
              className={`text-xs px-2 py-1.5 rounded cursor-pointer transition-colors ${
                lockAspect ? 'text-gold' : 'text-text-secondary'
              }`}
              title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
            >
              {lockAspect ? '🔗' : '🔓'}
            </button>
            <div className="flex items-center gap-2">
              <label className="text-text-secondary text-xs">H</label>
              <input
                type="number"
                value={resizeHeight}
                onChange={(e) => handleResizeHeightChange(Number(e.target.value))}
                className="w-20 bg-bg-primary border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-gold/50"
              />
            </div>
            <button
              onClick={handleResizeApply}
              disabled={isProcessing}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        )}

        {activeTool === 'rotate' && (
          <div className="flex gap-2">
            <button onClick={() => applyEdit('rotate', { degrees: 270 })} disabled={isProcessing}
              className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer disabled:opacity-40 transition-all">
              90° CCW
            </button>
            <button onClick={() => applyEdit('rotate', { degrees: 90 })} disabled={isProcessing}
              className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer disabled:opacity-40 transition-all">
              90° CW
            </button>
            <button onClick={() => applyEdit('rotate', { degrees: 180 })} disabled={isProcessing}
              className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer disabled:opacity-40 transition-all">
              180°
            </button>
          </div>
        )}

        {activeTool === 'flip' && (
          <div className="flex gap-2">
            <button onClick={() => applyEdit('flip', { direction: 'horizontal' })} disabled={isProcessing}
              className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer disabled:opacity-40 transition-all">
              Flip Horizontal
            </button>
            <button onClick={() => applyEdit('flip', { direction: 'vertical' })} disabled={isProcessing}
              className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer disabled:opacity-40 transition-all">
              Flip Vertical
            </button>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between border-t border-white/5 pt-4">
        <div className="flex gap-2">
          <button onClick={handleReset} disabled={undoStack.length === 0 || isProcessing}
            className="text-xs px-3 py-2 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-30 transition-colors">
            Reset
          </button>
          <button onClick={handleUndo} disabled={undoStack.length === 0 || isProcessing}
            className="text-xs px-3 py-2 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-30 transition-colors">
            Undo
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownload}
            className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer">
            Download
          </button>
          <button onClick={() => handleTransfer('/')}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all">
            Compress
          </button>
          <button onClick={() => handleTransfer('/remove-bg')}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all">
            Remove BG
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds (component not yet mounted in any page, but TypeScript should compile).

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageEditor.tsx
git commit -m "feat: add ImageEditor component with crop/resize/rotate/flip"
```

---

## Task 5: Edit Page

**Files:**
- Create: `src/pages/edit.astro`

- [ ] **Step 1: Create edit.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import ImageEditor from '../components/ImageEditor';
---
<Layout
  title="Free Online Image Editor - Crop, Resize, Rotate | TinyIMG"
  description="Edit images directly in your browser. Crop, resize, rotate, and flip — free, fast, and private. No uploads required."
>
  <div class="noise-bg">
    <Header />

    <section class="px-6 md:px-10 pt-8 pb-4">
      <div class="max-w-2xl mx-auto text-center">
        <h1 class="font-display text-3xl md:text-4xl text-white mb-2">Image Editor</h1>
        <p class="text-text-secondary text-base">Crop, resize, rotate & flip — entirely in your browser</p>
      </div>
    </section>

    <div id="tool" class="px-6 md:px-10 mt-4 mb-8">
      <div class="max-w-3xl mx-auto">
        <div class="tool-glow bg-bg-card/40 rounded-2xl p-6 md:p-8">
          <ImageEditor client:visible />
        </div>
      </div>
    </div>

    <Footer />
  </div>
</Layout>
```

- [ ] **Step 2: Verify build and visit `/edit`**

```bash
npm run build
```

Expected: Build succeeds. Page `/edit` renders with the editor.

- [ ] **Step 3: Commit**

```bash
git add src/pages/edit.astro
git commit -m "feat: add /edit page with SEO"
```

---

## Task 6: Background Remover Component

**Files:**
- Create: `src/components/BackgroundRemover.tsx`

- [ ] **Step 1: Create BackgroundRemover.tsx**

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import DropZone from './DropZone';
import { getImage, clearImage, setImage as transferImage } from '../lib/image-transfer';
import { downloadSingle } from '../lib/download';

type BgStatus = 'idle' | 'loading' | 'processing' | 'done' | 'error';

interface BgResult {
  originalUrl: string;
  resultUrl: string;
  pngBlob: Blob;
  webpBlob: Blob | null;
  name: string;
  width: number;
  height: number;
}

export default function BackgroundRemover() {
  const [status, setStatus] = useState<BgStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BgResult | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [imageName, setImageName] = useState('image');

  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Load transferred image on mount
  useEffect(() => {
    getImage().then((transferred) => {
      if (transferred) {
        clearImage();
        processImage(transferred.blob, transferred.name, transferred.width, transferred.height);
      }
    });
  }, []);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.originalUrl);
        URL.revokeObjectURL(result.resultUrl);
      }
    };
  }, [result]);

  const handleFiles = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      processImage(file, file.name, img.naturalWidth, img.naturalHeight);
    };
    img.src = url;
  }, []);

  async function processImage(blob: Blob, name: string, width: number, height: number) {
    setStatus('loading');
    setProgress(0);
    setError(null);
    setImageName(name);

    try {
      // Dynamic import to avoid loading the heavy library until needed
      const { removeBackground } = await import('@imgly/background-removal');

      setStatus('processing');

      const resultBlob = await removeBackground(blob, {
        progress: (key: string, current: number, total: number) => {
          if (total > 0) setProgress(Math.round((current / total) * 100));
        },
      });

      // Auto-compress to WebP
      let webpBlob: Blob | null = null;
      try {
        const worker = new Worker(
          new URL('../workers/image-worker.ts', import.meta.url),
          { type: 'module' }
        );
        const file = new File([resultBlob], name, { type: 'image/png' });
        webpBlob = await new Promise<Blob | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 30000);
          worker.onmessage = (e) => {
            clearTimeout(timeout);
            worker.terminate();
            if (e.data.type === 'result') resolve(e.data.blob);
            else resolve(null);
          };
          worker.postMessage({
            type: 'process',
            file,
            settings: { format: 'image/webp' },
          });
        });
      } catch {
        // WebP compression failed, still have PNG
      }

      const originalUrl = URL.createObjectURL(blob);
      const resultUrl = URL.createObjectURL(resultBlob);

      setResult({ originalUrl, resultUrl, pngBlob: resultBlob, webpBlob, name, width, height });
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Background removal failed');
      setStatus('error');
    }
  }

  function handleSliderMove(clientX: number) {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  }

  function handleDownloadPng() {
    if (result) downloadSingle(result.pngBlob, result.name, 'image/png');
  }

  function handleDownloadWebp() {
    if (result?.webpBlob) downloadSingle(result.webpBlob, result.name, 'image/webp');
  }

  async function handleTransfer(target: '/edit' | '/') {
    if (!result) return;
    await transferImage({
      blob: result.pngBlob,
      name: result.name,
      mimeType: 'image/png',
      width: result.width,
      height: result.height,
      from: 'remove-bg',
    });
    window.location.href = target;
  }

  function handleClear() {
    if (result) {
      URL.revokeObjectURL(result.originalUrl);
      URL.revokeObjectURL(result.resultUrl);
    }
    setResult(null);
    setStatus('idle');
    setProgress(0);
    setError(null);
  }

  // ── Idle: show DropZone ──
  if (status === 'idle') {
    return (
      <div className="flex flex-col gap-5">
        <DropZone onFiles={handleFiles} />
        <p className="text-text-secondary text-xs text-center">Upload an image to remove its background</p>
      </div>
    );
  }

  // ── Loading / Processing ──
  if (status === 'loading' || status === 'processing') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <svg className="progress-ring w-10 h-10" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="3" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
        </svg>
        <p className="text-text-primary text-sm font-medium">
          {status === 'loading' ? 'Loading AI model...' : 'Removing background...'}
        </p>
        {progress > 0 && (
          <div className="w-48 h-1.5 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="text-text-secondary text-xs">First time may take a moment to download the AI model (~5MB)</p>
      </div>
    );
  }

  // ── Error ──
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-error text-sm">{error}</p>
        <button onClick={handleClear} className="text-xs px-4 py-2 text-text-secondary hover:text-text-primary cursor-pointer">
          Try again
        </button>
      </div>
    );
  }

  // ── Done: before/after slider ──
  return (
    <div className="flex flex-col gap-4">
      {/* Before/After slider */}
      <div
        ref={sliderRef}
        className="relative overflow-hidden rounded-xl bg-bg-primary cursor-col-resize select-none"
        style={{ aspectRatio: result ? `${result.width}/${result.height}` : undefined, maxHeight: '60vh' }}
        onMouseDown={() => { isDragging.current = true; }}
        onMouseUp={() => { isDragging.current = false; }}
        onMouseLeave={() => { isDragging.current = false; }}
        onMouseMove={(e) => { if (isDragging.current) handleSliderMove(e.clientX); }}
        onTouchMove={(e) => handleSliderMove(e.touches[0].clientX)}
      >
        {/* After (result) — full */}
        {result && (
          <>
            <img src={result.resultUrl} alt="Background removed" className="w-full h-full object-contain" />
            {/* Before (original) — clipped via clip-path to avoid offsetWidth issues */}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
              <img
                src={result.originalUrl}
                alt="Original"
                className="w-full h-full object-contain"
              />
            </div>
            {/* Slider line */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-gold" style={{ left: `${sliderPos}%` }}>
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-gold rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-bg-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-text-secondary px-1">
        <span>Original</span>
        <span>Background Removed</span>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between border-t border-white/5 pt-4">
        <button onClick={handleClear}
          className="text-xs px-3 py-2 text-text-secondary hover:text-text-primary cursor-pointer transition-colors">
          Clear
        </button>
        <div className="flex gap-2">
          <button onClick={handleDownloadPng}
            className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer">
            PNG
          </button>
          {result?.webpBlob && (
            <button onClick={handleDownloadWebp}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-md transition-all duration-200 cursor-pointer">
              WebP
            </button>
          )}
          <button onClick={() => handleTransfer('/edit')}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all">
            Edit
          </button>
          <button onClick={() => handleTransfer('/')}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-text-primary cursor-pointer transition-all">
            Compress
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/BackgroundRemover.tsx
git commit -m "feat: add BackgroundRemover component with before/after slider"
```

---

## Task 7: Remove BG Page

**Files:**
- Create: `src/pages/remove-bg.astro`

- [ ] **Step 1: Create remove-bg.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import BackgroundRemover from '../components/BackgroundRemover';
---
<Layout
  title="Free Background Remover - Remove Image Background | TinyIMG"
  description="Remove image backgrounds instantly with AI — free, private, and entirely in your browser. No uploads, no sign-up."
>
  <div class="noise-bg">
    <Header />

    <section class="px-6 md:px-10 pt-8 pb-4">
      <div class="max-w-2xl mx-auto text-center">
        <h1 class="font-display text-3xl md:text-4xl text-white mb-2">Background Remover</h1>
        <p class="text-text-secondary text-base">Remove backgrounds instantly with AI — right in your browser</p>
      </div>
    </section>

    <div id="tool" class="px-6 md:px-10 mt-4 mb-8">
      <div class="max-w-3xl mx-auto">
        <div class="tool-glow bg-bg-card/40 rounded-2xl p-6 md:p-8">
          <BackgroundRemover client:visible />
        </div>
      </div>
    </div>

    <Footer />
  </div>
</Layout>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Pages `/edit` and `/remove-bg` both render.

- [ ] **Step 3: Commit**

```bash
git add src/pages/remove-bg.astro
git commit -m "feat: add /remove-bg page with SEO"
```

---

## Task 8: Header Navigation

**Files:**
- Modify: `src/components/Header.astro`

- [ ] **Step 1: Update Header.astro nav links**

Replace the `navLinks` array in the frontmatter and update the nav:

Change:
```javascript
const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
];
```

To:
```javascript
const toolLinks = [
  { label: 'Compress', href: '/' },
  { label: 'Edit', href: '/edit' },
  { label: 'Remove BG', href: '/remove-bg' },
];

const currentPath = Astro.url.pathname;
```

Update the `<nav>` to show tool links with active state styling, and remove the "Start Compressing" CTA button (now redundant since tools are in nav). Replace:

```html
<nav class="hidden md:flex items-center gap-8">
  {navLinks.map(link => (
    <a
      href={link.href}
      class="text-[13px] tracking-wide text-text-secondary hover:text-white transition-colors duration-300"
    >
      {link.label}
    </a>
  ))}
  <a
    href="#tool"
    class="text-[13px] font-semibold tracking-wide text-bg-primary bg-gold hover:bg-gold-light px-5 py-2 rounded-lg transition-all duration-300"
  >
    Start Compressing
  </a>
</nav>
```

With:

```html
<nav class="hidden md:flex items-center gap-1.5 bg-bg-primary/60 border border-border rounded-xl p-1">
  {toolLinks.map(link => (
    <a
      href={link.href}
      class={`text-[13px] tracking-wide px-4 py-2 rounded-lg transition-all duration-200 ${
        currentPath === link.href
          ? 'bg-gold text-bg-primary font-semibold'
          : 'text-text-secondary hover:text-white'
      }`}
    >
      {link.label}
    </a>
  ))}
</nav>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Header shows 3 tool links.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.astro
git commit -m "feat: update header nav with tool links and active state"
```

---

## Task 9: ResultCard Transfer Buttons

**Files:**
- Modify: `src/components/ResultCard.tsx`

- [ ] **Step 1: Add transfer buttons to ResultCard**

Add import at top:
```typescript
import { setImage } from '../lib/image-transfer';
```

Add transfer handler inside the component (after `handleDownload`):
```typescript
const handleTransfer = async (target: '/edit' | '/remove-bg') => {
  if (!blob || !result.dimensions) return;
  await setImage({
    blob,
    name: originalFile.name,
    mimeType: outputFormat,
    width: result.dimensions.width,
    height: result.dimensions.height,
    from: 'compress',
  });
  window.location.href = target;
};
```

Add 2 buttons after the existing "Save" button (inside the `status === 'done' && sizes` block), before the closing `</div>`:
```tsx
<button
  onClick={() => handleTransfer('/edit')}
  className="text-xs px-2.5 py-1.5 rounded-md text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/8 transition-all duration-200 cursor-pointer"
  aria-label={`Edit ${originalFile.name}`}
>
  Edit
</button>
<button
  onClick={() => handleTransfer('/remove-bg')}
  className="text-xs px-2.5 py-1.5 rounded-md text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/8 transition-all duration-200 cursor-pointer"
  aria-label={`Remove background from ${originalFile.name}`}
>
  BG
</button>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ResultCard.tsx
git commit -m "feat: add Edit and Remove BG transfer buttons to ResultCard"
```

---

## Task 10: MoreTools Section on Homepage

**Files:**
- Create: `src/components/MoreTools.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create MoreTools.astro**

```astro
---
const tools = [
  {
    title: 'Image Editor',
    description: 'Crop, resize, rotate & flip your images — right in the browser.',
    href: '/edit',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />`,
  },
  {
    title: 'Background Remover',
    description: 'Remove backgrounds instantly with AI — free and private.',
    href: '/remove-bg',
    icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />`,
  },
];
---

<section class="px-6 md:px-10 py-16">
  <div class="max-w-3xl mx-auto">
    <h2 class="font-display text-2xl md:text-3xl text-white text-center mb-3">More Tools</h2>
    <p class="text-text-secondary text-center mb-8">Everything you need to work with images — free and private</p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tools.map(tool => (
        <a
          href={tool.href}
          class="feature-card block p-6 rounded-2xl border border-border bg-bg-card/40 hover:bg-bg-card-hover/60 transition-all group"
        >
          <div class="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-4 group-hover:bg-gold/15 transition-colors">
            <svg class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <Fragment set:html={tool.icon} />
            </svg>
          </div>
          <h3 class="text-white font-semibold text-lg mb-1">{tool.title}</h3>
          <p class="text-text-secondary text-sm">{tool.description}</p>
        </a>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add MoreTools to index.astro**

In `src/pages/index.astro`, add the import:
```javascript
import MoreTools from '../components/MoreTools.astro';
```

Add the section after the tool section and before `<Features />`:
```html
<div class="section-divider max-w-5xl mx-auto"></div>

<MoreTools />
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Homepage shows MoreTools section.

- [ ] **Step 4: Commit**

```bash
git add src/components/MoreTools.astro src/pages/index.astro
git commit -m "feat: add MoreTools section to homepage showcasing Edit and Remove BG"
```

---

## Task 11: Final Build Verification

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 2: Check generated pages**

```bash
ls dist/ dist/edit/ dist/remove-bg/
```

Expected: `index.html` exists in each directory.

- [ ] **Step 3: Preview and smoke test**

```bash
npm run preview
```

Verify:
- `/` — compress works, MoreTools visible, ResultCard has Edit/BG buttons
- `/edit` — DropZone shows, upload image, crop/resize/rotate/flip work, undo works, transfer buttons work
- `/remove-bg` — DropZone shows, upload image, bg removal runs, before/after slider works, download PNG/WebP works
- Header nav shows 3 tool links with active state highlighting

- [ ] **Step 4: Commit any fixes and final commit**

```bash
git add -A
git commit -m "feat: complete image editor and background removal features"
```
