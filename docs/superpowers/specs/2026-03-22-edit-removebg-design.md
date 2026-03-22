# TinyIMG — Image Editor & Background Removal Feature Design

**Date:** 2026-03-22
**Status:** Approved

## Overview

Add two new tools to TinyIMG alongside the existing compress tool:
1. **Image Editor** (`/edit`) — crop, resize, rotate, flip
2. **Background Remover** (`/remove-bg`) — client-side AI background removal

All tools are linked: users can chain operations (compress → edit → remove bg) without re-uploading.

## Decisions

- **Client-side only** — no external APIs, zero server, consistent with existing architecture
- **Background removal library**: `@imgly/background-removal` (ONNX model, ~5MB, good quality, simple API)
- **Image transfer**: IndexedDB via `idb-keyval` (stores blobs directly, no base64 overhead)
- **Routing**: 3 separate pages for SEO — `/` (compress), `/edit`, `/remove-bg`
- **Homepage stays as compress tool**, with prominent "More Tools" section showcasing edit + remove-bg

## Routing & Pages

| Route | Tool | SEO Title |
|-------|------|-----------|
| `/` | Image Compressor (existing) | Free Online Image Compressor \| TinyIMG |
| `/edit` | Image Editor | Free Online Image Editor - Crop, Resize, Rotate \| TinyIMG |
| `/remove-bg` | Background Remover | Free Background Remover - Remove Image Background \| TinyIMG |

Each page:
- Own `.astro` file in `src/pages/`
- Shared `Layout.astro` with unique SEO meta (title, description, OG image, JSON-LD)
- Independent React island with `client:visible`
- Own DropZone for direct upload OR receives image from IndexedDB

## Image Transfer System

### `src/lib/image-transfer.ts`

Wrapper on `idb-keyval`:

```typescript
interface TransferImage {
  blob: Blob;
  name: string;
  mimeType: string;          // blob.type — explicit for downstream tools
  width: number;             // needed for editor canvas setup + resize inputs
  height: number;            // needed for editor canvas setup + resize inputs
  from: 'compress' | 'edit' | 'remove-bg';
}

setImage(data: TransferImage): Promise<void>   // save to IndexedDB
getImage(): Promise<TransferImage | null>       // read from IndexedDB
clearImage(): Promise<void>                     // delete after load
```

### Transfer flow

1. User finishes operation on any tool → ResultCard shows action buttons ("Edit", "Remove BG", "Compress")
2. Click action → `setImage({ blob, name, mimeType: blob.type, width, height, from })` → `window.location.href = '/edit'`
3. Target page checks IndexedDB on mount → image found → load into tool, `clearImage()`
4. No image found → show standard DropZone for fresh upload

## Image Editor (`/edit`)

### UI Layout

```
┌─────────────────────────────────────────────┐
│  Toolbar: [Crop] [Resize] [Rotate] [Flip]   │
├─────────────────────────────────────────────┤
│                                             │
│              Canvas Preview                 │
│        (centered, max viewport)             │
│                                             │
├─────────────────────────────────────────────┤
│  Context bar (changes per active tool):     │
│  - Crop: aspect ratio presets (Free, 1:1,   │
│    16:9, 4:3, 3:2)                          │
│  - Resize: W × H inputs + lock aspect ratio │
│  - Rotate: 90° CW, 90° CCW, 180°           │
│  - Flip: Horizontal, Vertical               │
├─────────────────────────────────────────────┤
│  [Reset] [Undo]    [Download] [→ Compress]  │
│                     [→ Remove BG]           │
└─────────────────────────────────────────────┘
```

### Tool details

| Tool | Implementation | Library |
|------|---------------|---------|
| Crop | Draggable selection overlay on canvas | `react-image-crop` |
| Resize | Width/height inputs, locked aspect ratio toggle | Native canvas drawImage |
| Rotate | 90°/180°/270° preset buttons | Native canvas transform |
| Flip | Horizontal / Vertical buttons | Native canvas scale(-1,1) or scale(1,-1) |

### Processing

- All transforms execute on `OffscreenCanvas` in `src/workers/edit-worker.ts`
- Preview renders on main thread `<canvas>`
- **Undo**: stack of blob states after each operation, Undo pops previous state. **Max 10 states** — oldest dropped when exceeded to prevent memory exhaustion on mobile
- **CSS import**: `react-image-crop/dist/ReactCrop.css` must be imported in the `ImageEditor.tsx` component (Astro/Vite handles CSS imports in React islands correctly)

### Worker message protocol

```typescript
// Main → Worker
{
  type: 'edit',
  blob: Blob,
  operation: 'crop' | 'resize' | 'rotate' | 'flip',
  params: {
    // crop
    x?: number; y?: number; width?: number; height?: number;
    // resize
    targetWidth?: number; targetHeight?: number;
    // rotate
    degrees?: 90 | 180 | 270;
    // flip
    direction?: 'horizontal' | 'vertical';
  }
}

// Worker → Main (success)
{
  type: 'result',
  blob: Blob,
  width: number,
  height: number
}

// Worker → Main (error)
{
  type: 'error',
  message: string
}
```

## Background Remover (`/remove-bg`)

### UI Layout

```
┌──────────────────────────────────────┐
│  DropZone (upload or from IndexedDB) │
├──────────────────────────────────────┤
│                                      │
│   Before / After split-view slider   │
│   (drag to compare original vs       │
│    removed background)               │
│                                      │
├──────────────────────────────────────┤
│  Progress bar (model loading +       │
│  processing)                         │
├──────────────────────────────────────┤
│  [Download PNG] [Download WebP]      │
│  [→ Edit] [→ Compress]              │
└──────────────────────────────────────┘
```

### Processing flow

1. User uploads or receives image
2. Show original preview
3. Run `@imgly/background-removal` on **main thread** (library uses DOM APIs internally — `HTMLCanvasElement`, `HTMLImageElement` — and cannot run in a Web Worker). The library handles its own ONNX worker offloading internally via `config.device`.
4. Progress bar: model download (first time ~5MB, cached after) + inference. Use library's `progress` callback.
5. Output: PNG blob with alpha channel
6. **Auto-compress output**: wrap output blob as `new File([blob], name, { type: 'image/png' })` then send to existing `image-worker.ts` (worker expects `File`, not `Blob`). Worker compresses via `OffscreenCanvas` → `convertToBlob({ type: 'image/webp' })`. Offer both downloads: original PNG (lossless, larger) and WebP (smaller). Note: WebP supports alpha natively. `image-worker.ts` itself remains untouched — caller wraps the blob.
7. Show before/after slider comparison

### Constraints

- Single image at a time (no batch — model is heavy)
- Model cached in browser after first download
- Animated GIFs not supported for bg removal

## Homepage Changes

### "More Tools" section

Positioned after the compress tool, before FAQ section on `/`:

- 2 prominent cards with icons, title, short description, CTA link
- Card 1: "Image Editor" — Crop, resize, rotate & flip your images
- Card 2: "Background Remover" — Remove backgrounds instantly with AI

### Header navigation

Update `Header.astro`:
- Add nav links: **Compress** | **Edit** | **Remove BG**
- Highlight active page based on current path

### ResultCard additions

Each compressed result card gets 2 new action buttons (only visible when `status === 'done'`):
- "Edit" → transfers blob to `/edit`
- "Remove BG" → transfers blob to `/remove-bg`

## New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `@imgly/background-removal` | Client-side AI bg removal (ONNX) | ~5MB model (lazy loaded) |
| `react-image-crop` | Crop selection UI component | ~15KB |
| `idb-keyval` | Simple IndexedDB wrapper | ~1KB |

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/edit.astro` | Editor page with SEO |
| `src/pages/remove-bg.astro` | Remove BG page with SEO |
| `src/components/ImageEditor.tsx` | React island — editor UI + canvas |
| `src/components/BackgroundRemover.tsx` | React island — bg removal UI |
| `src/components/MoreTools.astro` | Homepage tools showcase section |
| `src/lib/image-transfer.ts` | IndexedDB blob transfer utility |
| `src/workers/edit-worker.ts` | Web Worker for crop/resize/rotate/flip |
| ~~`src/workers/bg-remove-worker.ts`~~ | Not needed — `@imgly/background-removal` runs on main thread with internal ONNX offloading |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/Header.astro` | Add nav links to 3 tools |
| `src/components/ResultCard.tsx` | Add "Edit" + "Remove BG" action buttons |
| `src/pages/index.astro` | Add MoreTools section |
| `package.json` | Add 3 new dependencies |

## Files NOT Modified

- `src/workers/image-worker.ts` — existing compress logic untouched
- `src/components/ImageProcessor.tsx` — untouched; transfer logic lives in `ResultCard.tsx` directly (it already has access to `result.blob`)
- All static Astro components (Hero, FAQ, Footer, HowItWorks, Features)
