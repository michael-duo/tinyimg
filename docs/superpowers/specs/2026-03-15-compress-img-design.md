# CompressImg — Design Spec

## Overview

A free, public-facing online image compression tool. All processing happens client-side (no server). Deployed on Cloudflare Pages. Dark theme with gold accents. English UI.

## Goals

1. **Public tool** — like TinyPNG/Squoosh, accessible to everyone
2. **SEO-optimized** — target top Google rankings for "compress image online", "convert image to webp", etc.
3. **No server** — 100% client-side processing, zero data leaves the browser
4. **Cloudflare Pages** deployment — static site, global CDN

## Features

### Core
- **Compress**: Reduce file size with configurable quality (1-100%)
- **Convert**: Change format between JPEG, PNG, WebP, AVIF, GIF (AVIF: Chrome/Edge only — show browser support notice; animated GIF: first frame only)
- **Resize**: Preset max dimensions (1920, 1280, 800) or custom
- **Bulk processing**: Up to 50 files at once, max 20MB per file

### Validation & Error Handling
- **File type validation**: Check MIME type on drop/select, reject unsupported types with toast message
- **File size limit**: Max 20MB per file — show error for oversized files
- **Corrupt images**: Catch decode errors in worker, surface per-file error state in ResultCard
- **Worker crashes**: Timeout after 30s per file, show error and allow retry

### UX
- Drag & drop + file picker upload
- Settings bar: quality slider, output format, resize option
- Result cards: filename, dimensions, original size → compressed size, % saved
- Download individual files or bulk download as .zip
- Progress indicator per file during processing

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Astro** (SSG) | Best SEO out-of-box, minimal JS shipped, island architecture |
| Interactive UI | **React** (Astro islands) | Only hydrated for the image processor component |
| Styling | **Tailwind CSS** | Utility-first, easy dark theme, small bundle |
| Image processing | **OffscreenCanvas** + `convertToBlob()` | Resize, compress, and convert in one step — no extra library |
| Bulk download | **JSZip** + **file-saver** | Zip multiple results for download |
| Web Worker | **Dedicated Worker** | Off-main-thread processing, no UI blocking |
| Deploy | **Cloudflare Pages** | Free tier, global CDN, Astro adapter available |

## Architecture

```
michael-compress-img/
├── src/
│   ├── layouts/
│   │   └── Layout.astro              # Base layout: dark theme, SEO meta, structured data
│   ├── pages/
│   │   └── index.astro               # Single-page tool
│   ├── components/
│   │   ├── Header.astro              # Nav: logo + links
│   │   ├── Hero.astro                # Tagline + feature badges
│   │   ├── ImageProcessor.tsx        # React island — contains DropZone + all interactive UI
│   │   ├── SettingsBar.tsx           # Quality, format, resize controls
│   │   ├── ResultCard.tsx            # Per-file result display
│   │   ├── BulkActions.tsx           # Download all, clear all
│   │   └── Footer.astro             # Footer + SEO links
│   ├── workers/
│   │   └── image-worker.ts           # Web Worker for image processing
│   ├── lib/
│   │   ├── compress.ts               # Compression logic
│   │   ├── convert.ts                # Format conversion logic
│   │   ├── resize.ts                 # Resize logic
│   │   └── download.ts               # Single + bulk download (JSZip)
│   └── styles/
│       └── global.css                # Tailwind base + dark/gold theme tokens
├── public/
│   ├── favicon.svg
│   └── og-image.png                  # Open Graph image
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

## Processing Flow

### Component Integration
`ImageProcessor.tsx` is a single React island (`client:visible`) that owns the entire interactive area: DropZone, SettingsBar, ResultCards, and BulkActions. This avoids the complexity of bridging static Astro components with hydrated React — everything interactive lives inside one island boundary.

### Pipeline
1. User drops/selects files → `ImageProcessor` validates (type, size, count) → rejects invalid with error toast
2. Each valid file queued for processing with current settings (quality, format, resize)
3. Files sent to **Web Worker** sequentially (one at a time to avoid OOM on large batches) via `postMessage`:
   - Message schema: `{ type: 'process', file: File, settings: { quality: number, format: string, maxWidth?: number } }`
   - Worker decodes image via `createImageBitmap()`
   - Pipeline: **resize** (if maxWidth set, scale via OffscreenCanvas) → **convert + compress** (draw to OffscreenCanvas, export via `canvas.convertToBlob({ type, quality })`)
   - `convertToBlob` handles both format conversion and quality-based compression in one step
   - For AVIF: detect support at startup via `OffscreenCanvas.convertToBlob({ type: 'image/avif' })` test — hide AVIF from format dropdown on unsupported browsers
4. Worker posts back: `{ type: 'result', blob: Blob, originalSize: number, newSize: number, width: number, height: number }` or `{ type: 'error', message: string }`
5. Progress: tracked as per-file completion within the batch (e.g., "3 of 12 done") — `convertToBlob` has no intermediate progress callback
6. `ResultCard` renders per file: thumbnail (via `URL.createObjectURL`), sizes, % saved, download button
7. "Download All" → `JSZip` bundles all result blobs → triggers `.zip` download via `file-saver`. Output naming: `{original_name}-compressed.{ext}` (e.g., `photo-compressed.webp`). For animated GIFs, show notice on ResultCard that only first frame was processed.

### Why OffscreenCanvas + convertToBlob (not browser-image-compression)
- `browser-image-compression` has its own built-in Web Worker which conflicts with our dedicated worker setup
- `OffscreenCanvas.convertToBlob()` natively supports quality control + format conversion in one call
- Available in all modern browsers (Chrome 69+, Firefox 105+, Safari 16.4+)
- Simpler dependency — no extra library needed for the core pipeline

## SEO Strategy

### Technical SEO
- **SSG output**: Pure HTML pages, instant crawlability
- **Sitemap**: Auto-generated via `@astrojs/sitemap`
- **Canonical URL**: Set on every page
- **Robots.txt**: Allow all crawlers

### On-Page SEO
- **Title**: "CompressImg — Free Online Image Compressor | No Upload Required"
- **Meta description**: Targeting "compress image online", "convert png to webp", "resize image"
- **H1**: "Compress Images Instantly"
- **Structured data**: `WebApplication` schema (name, description, applicationCategory, operatingSystem, offers: free)
- **Content sections**: "How It Works", "FAQ" — keyword-rich, crawlable content below the tool
- **Semantic HTML**: Proper heading hierarchy (h1 > h2 > h3), aria-labels, alt text

### Performance SEO
- **Core Web Vitals**: Target LCP < 1.5s, CLS 0, FID < 50ms
- **Minimal JS**: Only hydrate the interactive island; hero, header, footer are static HTML
- **Image optimization**: SVG favicon, optimized OG image
- **Cloudflare CDN**: Edge-cached globally

## Visual Design

### Theme
- **Background**: `#0a0a0a` (near-black)
- **Card/Surface**: `#141414`
- **Border**: `#222222`
- **Gold accent**: `#c9a84c` (primary action color)
- **Text primary**: `#e0e0e0`
- **Text secondary**: `#888888`
- **Success**: `#4ade80` (green, for % saved)

### Typography
- Font: Inter (system fallback stack)
- Logo: Bold, letter-spaced, uppercase
- Headings: Bold/Extra-bold
- Body: Regular weight, 1.6 line-height

### Layout (single page, top to bottom)
1. **Header**: Logo left, nav right — all anchor links: Compress (#tool), Convert (#tool), How It Works (#how-it-works), FAQ (#faq)
2. **Hero**: Centered title + subtitle + feature badges
3. **Drop Zone**: Full-width dashed gold border, large padding
4. **Settings Bar**: Horizontal row — quality slider, format select, resize select
5. **Results**: Stacked card list, each card is a grid row (thumb | name | sizes | % | download)
6. **How It Works**: 3-step visual (Upload → Configure → Download)
7. **FAQ**: Accordion, targeting long-tail SEO keywords. Questions:
   - "Is my data safe?" → All processing in browser, no uploads
   - "What formats are supported?" → JPEG, PNG, WebP, AVIF, GIF
   - "How much can I compress?" → Depends on image, typically 40-80%
   - "Is there a file size limit?" → 20MB per file, 50 files at once
   - "Does it work on mobile?" → Yes, fully responsive
   - "Is it really free?" → Yes, no hidden costs
8. **Footer**: Links + trust copy ("No data leaves your browser")

## Cloudflare Pages Deployment

- Build command: `astro build`
- Output directory: `dist/`
- No server functions needed — pure static
- Custom domain can be added via Cloudflare DNS
- Auto-deploy via GitHub integration (optional)

## Out of Scope

- Server-side processing
- User accounts / authentication
- Image editing (crop, rotate, filters)
- API access
- Analytics dashboard (can add Cloudflare Web Analytics later)
