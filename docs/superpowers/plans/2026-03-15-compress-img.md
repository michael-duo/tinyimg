# CompressImg Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, client-side image compression/conversion/resize tool deployed on Cloudflare Pages with SEO-optimized dark/gold theme.

**Architecture:** Astro SSG for static HTML + SEO. Single React island for all interactive UI (drop zone, settings, results). Web Worker with OffscreenCanvas for image processing off-main-thread. JSZip for bulk download.

**Tech Stack:** Astro 5, React 19, Tailwind CSS 4, TypeScript, OffscreenCanvas API, Web Workers, JSZip, file-saver

---

## Chunk 1: Project Scaffold & Static Shell

### Task 1: Initialize Astro project with React + Tailwind

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/styles/global.css`

- [ ] **Step 1: Create .gitignore**

Write `.gitignore`:

```
node_modules/
dist/
.astro/
.superpowers/
```

- [ ] **Step 2: Scaffold Astro project**

```bash
cd /Users/michael/Desktop/michael/michael-compress-img
npm create astro@latest . -- --template minimal --no-install --no-git --typescript strict
```

- [ ] **Step 3: Install dependencies**

```bash
npm install @astrojs/react @astrojs/sitemap react react-dom jszip file-saver @tailwindcss/vite tailwindcss
npm install -D @types/react @types/react-dom @types/file-saver
```

- [ ] **Step 4: Configure Astro with Tailwind v4 (Vite plugin)**

Update `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://compressimg.pages.dev',
  integrations: [react(), sitemap()],
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 5: Configure Tailwind v4 theme via CSS**

No `tailwind.config.mjs` needed — Tailwind v4 uses CSS-based configuration.
```

- [ ] **Step 6: Create global CSS with Tailwind v4 theme**

Write `src/styles/global.css`:

```css
@import "tailwindcss";

@theme {
  --color-bg-primary: #0a0a0a;
  --color-bg-card: #141414;
  --color-bg-card-hover: #1a1a1a;
  --color-border: #222222;
  --color-gold: #c9a84c;
  --color-gold-light: #d4b85e;
  --color-gold-dim: rgba(201, 168, 76, 0.15);
  --color-text-primary: #e0e0e0;
  --color-text-secondary: #888888;
  --color-success: #4ade80;
  --color-error: #f87171;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

@layer base {
  body {
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
}
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Expected: Dev server running at `localhost:4321`, no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Astro project with React, Tailwind v4, sitemap"
```

---

### Task 2: Base Layout with SEO

**Files:**
- Create: `src/layouts/Layout.astro`
- Create: `public/favicon.svg`
- Create: `public/robots.txt`

- [ ] **Step 1: Create favicon SVG**

Write `public/favicon.svg` — a simple gold "C" icon:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0a0a0a"/>
  <text x="16" y="23" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="800" fill="#c9a84c">C</text>
</svg>
```

- [ ] **Step 2: Create robots.txt**

Write `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://compressimg.pages.dev/sitemap-index.xml
```

- [ ] **Step 3: Create Layout.astro with full SEO**

Write `src/layouts/Layout.astro`:

```astro
---
interface Props {
  title?: string;
  description?: string;
}

const {
  title = "CompressImg — Free Online Image Compressor | No Upload Required",
  description = "Compress, convert, and resize images instantly in your browser. Free, fast, and private — no data leaves your device. Supports JPEG, PNG, WebP, AVIF, GIF.",
} = Astro.props;

const canonicalURL = new URL(Astro.url.pathname, Astro.site);
const ogImage = new URL("/og-image.png", Astro.site);
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="canonical" href={canonicalURL} />

    <!-- Primary Meta -->
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta name="keywords" content="compress image, image compressor, convert png to webp, resize image, bulk image compression, free image tool" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content={canonicalURL} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={ogImage} />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImage} />

    <!-- Structured Data: WebApplication -->
    <script type="application/ld+json" set:html={JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "CompressImg",
      "url": canonicalURL,
      "description": description,
      "applicationCategory": "MultimediaApplication",
      "operatingSystem": "Any",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "browserRequirements": "Requires a modern browser with Web Worker and OffscreenCanvas support",
    })} />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 4: Verify layout renders**

Update `src/pages/index.astro` temporarily:

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout>
  <h1>CompressImg</h1>
</Layout>
```

Run: `npm run dev` → open browser → check page source for meta tags, structured data, canonical URL.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Layout.astro public/favicon.svg public/robots.txt src/pages/index.astro
git commit -m "feat: add base layout with SEO meta, structured data, favicon"
```

---

### Task 3: Header component

**Files:**
- Create: `src/components/Header.astro`

- [ ] **Step 1: Create Header.astro**

```astro
---
const navLinks = [
  { label: 'Compress', href: '#tool' },
  { label: 'Convert', href: '#tool' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
];
---

<header class="flex justify-between items-center px-6 md:px-12 py-5 border-b border-border">
  <a href="/" class="text-xl font-bold tracking-widest text-white">
    COMPRESS<span class="text-gold">IMG</span>
  </a>
  <nav class="hidden md:flex gap-8">
    {navLinks.map(link => (
      <a
        href={link.href}
        class="text-xs tracking-wider uppercase text-text-secondary hover:text-gold transition-colors"
      >
        {link.label}
      </a>
    ))}
  </nav>
</header>
```

- [ ] **Step 2: Add Header to index.astro and verify**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
---
<Layout>
  <Header />
  <h1>CompressImg</h1>
</Layout>
```

Run: `npm run dev` → verify header renders with logo + nav links.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.astro src/pages/index.astro
git commit -m "feat: add header component with nav links"
```

---

### Task 4: Hero component

**Files:**
- Create: `src/components/Hero.astro`

- [ ] **Step 1: Create Hero.astro**

```astro
---
const badges = [
  '🔒 100% Client-Side',
  '⚡ Web Worker Powered',
  '📦 Bulk Processing',
  '🔄 Format Convert',
];
---

<section class="text-center px-6 md:px-12 pt-16 pb-8">
  <h1 class="text-4xl md:text-5xl font-extrabold text-white mb-3">
    Compress Images <span class="text-gold">Instantly</span>
  </h1>
  <p class="text-text-secondary text-base md:text-lg max-w-xl mx-auto leading-relaxed mb-5">
    Free, fast, and private. Compress, convert, and resize your images directly in your browser. No uploads to any server.
  </p>
  <div class="flex flex-wrap gap-3 justify-center">
    {badges.map(badge => (
      <span class="bg-bg-card border border-border rounded-full px-4 py-1.5 text-xs text-text-secondary tracking-wide">
        {badge}
      </span>
    ))}
  </div>
</section>
```

- [ ] **Step 2: Add Hero to index.astro and verify**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Hero from '../components/Hero.astro';
---
<Layout>
  <Header />
  <Hero />
</Layout>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Hero.astro src/pages/index.astro
git commit -m "feat: add hero section with tagline and badges"
```

---

### Task 5: Footer + How It Works + FAQ (SEO content)

**Files:**
- Create: `src/components/Footer.astro`
- Create: `src/components/HowItWorks.astro`
- Create: `src/components/FAQ.astro`

- [ ] **Step 1: Create HowItWorks.astro**

```astro
<section id="how-it-works" class="px-6 md:px-12 py-16 border-t border-border">
  <h2 class="text-2xl font-bold text-white text-center mb-12">How It Works</h2>
  <div class="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
    {[
      { step: '01', title: 'Upload', desc: 'Drag and drop your images or click to browse. Supports JPEG, PNG, WebP, AVIF, and GIF.' },
      { step: '02', title: 'Configure', desc: 'Set quality level, choose output format, and optionally resize. Process up to 50 images at once.' },
      { step: '03', title: 'Download', desc: 'Get your compressed images instantly. Download individually or as a ZIP file.' },
    ].map(item => (
      <div class="text-center">
        <div class="text-gold text-4xl font-extrabold mb-3">{item.step}</div>
        <h3 class="text-white font-semibold text-lg mb-2">{item.title}</h3>
        <p class="text-text-secondary text-sm leading-relaxed">{item.desc}</p>
      </div>
    ))}
  </div>
</section>
```

- [ ] **Step 2: Create FAQ.astro**

```astro
---
const faqs = [
  { q: 'Is my data safe?', a: 'Absolutely. All image processing happens directly in your browser using Web Workers and OffscreenCanvas. Your files are never uploaded to any server.' },
  { q: 'What formats are supported?', a: 'We support JPEG, PNG, WebP, AVIF (Chrome/Edge), and GIF. You can also convert between formats — for example, PNG to WebP for smaller file sizes.' },
  { q: 'How much can I compress?', a: 'Compression results vary by image, but typically you can expect 40-80% file size reduction without noticeable quality loss.' },
  { q: 'Is there a file size limit?', a: 'Each file can be up to 20MB, and you can process up to 50 files at once with our bulk processing feature.' },
  { q: 'Does it work on mobile?', a: 'Yes! CompressImg is fully responsive and works on any modern mobile browser.' },
  { q: 'Is it really free?', a: 'Yes, completely free with no hidden costs, no watermarks, and no sign-up required.' },
];
---

<section id="faq" class="px-6 md:px-12 py-16 border-t border-border">
  <h2 class="text-2xl font-bold text-white text-center mb-12">Frequently Asked Questions</h2>
  <div class="max-w-2xl mx-auto space-y-4">
    {faqs.map(faq => (
      <details class="group bg-bg-card border border-border rounded-xl">
        <summary class="flex justify-between items-center cursor-pointer px-6 py-4 text-white font-medium text-sm">
          {faq.q}
          <span class="text-gold transition-transform group-open:rotate-45 text-lg">+</span>
        </summary>
        <div class="px-6 pb-4 text-text-secondary text-sm leading-relaxed">
          {faq.a}
        </div>
      </details>
    ))}
  </div>
</section>
```

- [ ] **Step 3: Create Footer.astro**

```astro
---
const links = [
  { label: 'Compress', href: '#tool' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
];
---

<footer class="text-center px-6 md:px-12 py-12 mt-12 border-t border-border">
  <nav class="flex gap-6 justify-center mb-4">
    {links.map(link => (
      <a href={link.href} class="text-text-secondary text-xs hover:text-gold transition-colors">
        {link.label}
      </a>
    ))}
  </nav>
  <p class="text-text-secondary text-xs">
    CompressImg — Free online image compressor. No data leaves your browser.
  </p>
</footer>
```

- [ ] **Step 4: Assemble full index.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Hero from '../components/Hero.astro';
import HowItWorks from '../components/HowItWorks.astro';
import FAQ from '../components/FAQ.astro';
import Footer from '../components/Footer.astro';
---
<Layout>
  <Header />
  <Hero />
  <div id="tool" class="px-6 md:px-12 mt-8">
    <!-- ImageProcessor React island will go here in Chunk 2 -->
    <div class="border-2 border-dashed border-gold rounded-2xl bg-gold-dim p-16 text-center">
      <p class="text-white text-lg font-medium">Image Processor (coming next)</p>
    </div>
  </div>
  <HowItWorks />
  <FAQ />
  <Footer />
</Layout>
```

- [ ] **Step 5: Verify full page renders correctly**

Run: `npm run dev` → check all sections render, anchor links work, FAQ accordion opens/closes.

- [ ] **Step 6: Build and check output**

```bash
npm run build
```

Expected: `dist/` directory with static HTML, sitemap generated.

- [ ] **Step 7: Commit**

```bash
git add src/components/Footer.astro src/components/HowItWorks.astro src/components/FAQ.astro src/pages/index.astro
git commit -m "feat: add footer, how-it-works, FAQ sections with SEO content"
```

---

## Chunk 2: Image Processing Core (Web Worker + Pipeline)

### Task 6: Web Worker — image processing pipeline

**Files:**
- Create: `src/workers/image-worker.ts`
- Create: `src/lib/format-support.ts`

- [ ] **Step 1: Create format support detection**

Write `src/lib/format-support.ts`:

```ts
export type ImageFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'image/gif';

export const FORMAT_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
  'image/gif': 'GIF',
};

export const SUPPORTED_INPUT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
]);

export async function detectOutputFormats(): Promise<ImageFormat[]> {
  const formats: ImageFormat[] = ['image/jpeg', 'image/png', 'image/webp'];

  // Test AVIF support
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d')!;
    ctx.fillRect(0, 0, 1, 1);
    const blob = await canvas.convertToBlob({ type: 'image/avif' });
    if (blob.type === 'image/avif') {
      formats.push('image/avif');
    }
  } catch {
    // AVIF not supported
  }

  return formats;
}

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_FILE_COUNT = 50;
export const WORKER_TIMEOUT_MS = 30_000;
```

- [ ] **Step 2: Create image-worker.ts**

Write `src/workers/image-worker.ts`:

```ts
export interface ProcessMessage {
  type: 'process';
  file: File;
  settings: {
    quality: number; // 0-1
    format: string;  // MIME type e.g. 'image/webp'
    maxWidth?: number;
  };
}

export interface ResultMessage {
  type: 'result';
  blob: Blob;
  originalSize: number;
  newSize: number;
  width: number;
  height: number;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<ProcessMessage>) => {
  const { file, settings } = e.data;

  try {
    // 1. Decode image
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    // 2. Resize if needed
    if (settings.maxWidth && width > settings.maxWidth) {
      const ratio = settings.maxWidth / width;
      width = settings.maxWidth;
      height = Math.round(height * ratio);
    }

    // 3. Draw to OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // 4. Convert + compress
    const outputType = settings.format === 'original' ? file.type : settings.format;
    const blobOptions: ImageEncodeOptions = { type: outputType };

    // PNG is lossless — quality param doesn't apply
    if (outputType !== 'image/png') {
      blobOptions.quality = settings.quality;
    }

    const blob = await canvas.convertToBlob(blobOptions);

    const response: ResultMessage = {
      type: 'result',
      blob,
      originalSize: file.size,
      newSize: blob.size,
      width,
      height,
    };

    self.postMessage(response);
  } catch (err) {
    const response: ErrorMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown processing error',
    };
    self.postMessage(response);
  }
};
```

- [ ] **Step 3: Verify worker file has no TypeScript errors**

```bash
npx tsc --noEmit src/workers/image-worker.ts src/lib/format-support.ts
```

Expected: No errors (may need to adjust tsconfig for worker types).

- [ ] **Step 4: Commit**

```bash
git add src/workers/image-worker.ts src/lib/format-support.ts
git commit -m "feat: add image processing web worker and format support detection"
```

---

### Task 7: Download utility (single + bulk)

**Files:**
- Create: `src/lib/download.ts`

- [ ] **Step 1: Create download.ts**

Write `src/lib/download.ts`:

```ts
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface DownloadableFile {
  blob: Blob;
  filename: string;
}

function getCompressedFilename(originalName: string, outputFormat: string): string {
  const lastDot = originalName.lastIndexOf('.');
  const baseName = lastDot > 0 ? originalName.substring(0, lastDot) : originalName;

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
  };

  const ext = extMap[outputFormat] || 'bin';
  return `${baseName}-compressed.${ext}`;
}

export function downloadSingle(blob: Blob, originalName: string, outputFormat: string): void {
  const filename = getCompressedFilename(originalName, outputFormat);
  saveAs(blob, filename);
}

export async function downloadAll(files: DownloadableFile[]): Promise<void> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.filename, file.blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, 'compressimg-results.zip');
}

export { getCompressedFilename };
```

- [ ] **Step 2: Create shared format utility**

Write `src/lib/format.ts`:

```ts
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/download.ts src/lib/format.ts
git commit -m "feat: add download utility and format helpers"
```

---

## Chunk 3: React Interactive UI

### Task 8: ImageProcessor — main React island

**Files:**
- Create: `src/components/ImageProcessor.tsx`
- Create: `src/components/SettingsBar.tsx`
- Create: `src/components/ResultCard.tsx`
- Create: `src/components/DropZone.tsx`
- Create: `src/components/BulkActions.tsx`

- [ ] **Step 1: Create DropZone.tsx**

Write `src/components/DropZone.tsx`:

```tsx
import { useCallback, useRef, useState } from 'react';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function DropZone({ onFiles, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }, [onFiles, disabled]);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onFiles(files);
    e.target.value = '';
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDrag}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all
        ${isDragging ? 'border-gold bg-gold-dim/30 scale-[1.01]' : 'border-gold bg-gold-dim hover:bg-gold-dim/30'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="text-5xl mb-4">📁</div>
      <h3 className="text-white text-xl font-medium mb-2">Drop your images here</h3>
      <p className="text-text-secondary text-sm">or click to browse files</p>
      <p className="text-gold text-xs mt-3 tracking-wide">
        JPEG • PNG • WebP • AVIF • GIF — up to 50 files at once
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create SettingsBar.tsx**

Write `src/components/SettingsBar.tsx`:

```tsx
import type { ImageFormat } from '../lib/format-support';

export interface Settings {
  quality: number;
  format: string;
  maxWidth: number | null;
}

interface SettingsBarProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  outputFormats: ImageFormat[];
}

const RESIZE_OPTIONS = [
  { label: 'No resize', value: null },
  { label: 'Max 1920px', value: 1920 },
  { label: 'Max 1280px', value: 1280 },
  { label: 'Max 800px', value: 800 },
];

const FORMAT_DISPLAY: Record<string, string> = {
  original: 'Same as original',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
};

export default function SettingsBar({ settings, onChange, outputFormats }: SettingsBarProps) {
  return (
    <div className="flex flex-wrap gap-6 items-center justify-center py-6">
      {/* Quality */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary uppercase tracking-wider">Quality</span>
        <input
          type="range"
          min={1}
          max={100}
          value={settings.quality}
          onChange={e => onChange({ ...settings, quality: Number(e.target.value) })}
          className="w-28 accent-gold"
        />
        <span className="text-gold text-sm font-semibold w-9">{settings.quality}%</span>
      </div>

      {/* Format */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary uppercase tracking-wider">Output</span>
        <select
          value={settings.format}
          onChange={e => onChange({ ...settings, format: e.target.value })}
          className="bg-bg-card border border-border text-white px-4 py-2 rounded-lg text-sm outline-none"
        >
          <option value="original">Same as original</option>
          {outputFormats.map(fmt => (
            <option key={fmt} value={fmt}>{FORMAT_DISPLAY[fmt] || fmt}</option>
          ))}
        </select>
      </div>

      {/* Resize */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary uppercase tracking-wider">Resize</span>
        <select
          value={settings.maxWidth ?? ''}
          onChange={e => onChange({ ...settings, maxWidth: e.target.value ? Number(e.target.value) : null })}
          className="bg-bg-card border border-border text-white px-4 py-2 rounded-lg text-sm outline-none"
        >
          {RESIZE_OPTIONS.map(opt => (
            <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ResultCard.tsx**

Write `src/components/ResultCard.tsx`:

```tsx
import { downloadSingle } from '../lib/download';
import { formatSize } from '../lib/format';

export interface FileResult {
  id: string;
  originalFile: File;
  blob: Blob | null;
  originalSize: number;
  newSize: number | null;
  width: number | null;
  height: number | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  outputFormat: string;
  isAnimatedGif?: boolean;
}

interface ResultCardProps {
  result: FileResult;
}

export default function ResultCard({ result }: ResultCardProps) {
  const saved = result.newSize != null
    ? Math.round((1 - result.newSize / result.originalSize) * 100)
    : null;

  const thumbUrl = result.blob ? URL.createObjectURL(result.blob) : null;

  return (
    <div className="flex items-center gap-4 bg-bg-card border border-border rounded-xl px-5 py-4 hover:border-border/80 transition-colors">
      {/* Thumbnail */}
      <div className="w-14 h-10 bg-[#222] rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-text-secondary">IMG</span>
        )}
      </div>

      {/* Name + dimensions */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{result.originalFile.name}</p>
        {result.width && result.height && (
          <p className="text-text-secondary text-xs">{result.width} × {result.height}</p>
        )}
        {result.isAnimatedGif && (
          <p className="text-gold text-xs">Animated GIF — first frame only</p>
        )}
      </div>

      {/* Sizes */}
      <div className="text-sm text-text-secondary text-center w-36 hidden sm:block">
        {result.status === 'done' && result.newSize != null ? (
          <>
            {formatSize(result.originalSize)}
            <span className="text-gold mx-1">→</span>
            {formatSize(result.newSize)}
          </>
        ) : result.status === 'processing' ? (
          <span className="text-gold animate-pulse">Processing...</span>
        ) : result.status === 'error' ? (
          <span className="text-error">{result.error || 'Error'}</span>
        ) : (
          <span className="text-text-secondary">Pending</span>
        )}
      </div>

      {/* % Saved */}
      <div className="w-16 text-center hidden sm:block">
        {saved != null && (
          <span className={`text-sm font-bold ${saved > 0 ? 'text-success' : 'text-error'}`}>
            {saved > 0 ? `-${saved}%` : `+${Math.abs(saved)}%`}
          </span>
        )}
      </div>

      {/* Download button */}
      <div className="w-24 flex-shrink-0">
        {result.status === 'done' && result.blob && (
          <button
            onClick={() => downloadSingle(result.blob!, result.originalFile.name, result.outputFormat)}
            className="w-full border border-border text-white px-4 py-1.5 rounded-md text-xs hover:border-gold hover:text-gold transition-all"
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create BulkActions.tsx**

Write `src/components/BulkActions.tsx`:

```tsx
import { downloadAll, getCompressedFilename } from '../lib/download';
import { formatSize } from '../lib/format';
import type { FileResult } from './ResultCard';

interface BulkActionsProps {
  results: FileResult[];
  onClear: () => void;
  totalProcessed: number;
  totalFiles: number;
}

export default function BulkActions({ results, onClear, totalProcessed, totalFiles }: BulkActionsProps) {
  const doneResults = results.filter(r => r.status === 'done' && r.blob);
  const totalOriginal = doneResults.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCompressed = doneResults.reduce((sum, r) => sum + (r.newSize || 0), 0);
  const totalSaved = totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;

  const handleDownloadAll = async () => {
    const files = doneResults.map(r => ({
      blob: r.blob!,
      filename: getCompressedFilename(r.originalFile.name, r.outputFormat),
    }));
    await downloadAll(files);
  };

  return (
    <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
      <div>
        <h2 className="text-lg font-bold text-white">Results</h2>
        <div className="flex gap-6 text-sm text-text-secondary">
          <span><strong className="text-gold">{totalProcessed}</strong> / {totalFiles} processed</span>
          {doneResults.length > 0 && (
            <span>Total saved: <strong className="text-gold">{formatSize(totalOriginal - totalCompressed)} ({totalSaved}%)</strong></span>
          )}
        </div>
      </div>
      <div className="flex gap-3">
        {doneResults.length > 1 && (
          <button
            onClick={handleDownloadAll}
            className="bg-gold text-bg-primary px-6 py-2.5 rounded-lg font-bold text-sm tracking-wide uppercase hover:bg-gold-light transition-colors"
          >
            ↓ Download All (.zip)
          </button>
        )}
        <button
          onClick={onClear}
          className="border border-border text-text-secondary px-4 py-2.5 rounded-lg text-sm hover:border-error hover:text-error transition-all"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ImageProcessor.tsx — the main island**

Write `src/components/ImageProcessor.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import DropZone from './DropZone';
import SettingsBar, { type Settings } from './SettingsBar';
import ResultCard, { type FileResult } from './ResultCard';
import BulkActions from './BulkActions';
import {
  SUPPORTED_INPUT_TYPES,
  MAX_FILE_SIZE,
  MAX_FILE_COUNT,
  WORKER_TIMEOUT_MS,
  detectOutputFormats,
  type ImageFormat,
} from '../lib/format-support';

export default function ImageProcessor() {
  const [settings, setSettings] = useState<Settings>({
    quality: 80,
    format: 'original',
    maxWidth: null,
  });
  const [results, setResults] = useState<FileResult[]>([]);
  const [outputFormats, setOutputFormats] = useState<ImageFormat[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Detect supported output formats on mount
  useEffect(() => {
    detectOutputFormats().then(setOutputFormats);
  }, []);

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/image-worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => workerRef.current?.terminate();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const validateFiles = (files: File[]): File[] => {
    const valid: File[] = [];
    const currentCount = results.length;

    for (const file of files) {
      if (currentCount + valid.length >= MAX_FILE_COUNT) {
        showToast(`Maximum ${MAX_FILE_COUNT} files allowed`);
        break;
      }
      if (!SUPPORTED_INPUT_TYPES.has(file.type)) {
        showToast(`Unsupported format: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast(`File too large (max 20MB): ${file.name}`);
        continue;
      }
      valid.push(file);
    }

    return valid;
  };

  const processFiles = useCallback(async (files: File[]) => {
    const validFiles = validateFiles(files);
    if (validFiles.length === 0) return;

    // Create result entries
    const newResults: FileResult[] = validFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      originalFile: file,
      blob: null,
      originalSize: file.size,
      newSize: null,
      width: null,
      height: null,
      status: 'pending' as const,
      outputFormat: settings.format === 'original' ? file.type : settings.format,
      isAnimatedGif: file.type === 'image/gif',
    }));

    setResults(prev => [...prev, ...newResults]);
    setIsProcessing(true);

    const worker = workerRef.current;
    if (!worker) return;

    // Process sequentially
    for (const result of newResults) {
      setResults(prev =>
        prev.map(r => r.id === result.id ? { ...r, status: 'processing' as const } : r)
      );

      try {
        const processed = await new Promise<{ blob: Blob; newSize: number; width: number; height: number }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Processing timeout (30s)')), WORKER_TIMEOUT_MS);

          const handler = (e: MessageEvent) => {
            clearTimeout(timeout);
            worker.removeEventListener('message', handler);
            if (e.data.type === 'result') {
              resolve(e.data);
            } else {
              reject(new Error(e.data.message));
            }
          };

          worker.addEventListener('message', handler);
          worker.postMessage({
            type: 'process',
            file: result.originalFile,
            settings: {
              quality: settings.quality / 100,
              format: settings.format,
              maxWidth: settings.maxWidth,
            },
          });
        });

        setResults(prev =>
          prev.map(r => r.id === result.id ? {
            ...r,
            status: 'done' as const,
            blob: processed.blob,
            newSize: processed.newSize,
            width: processed.width,
            height: processed.height,
          } : r)
        );
      } catch (err) {
        setResults(prev =>
          prev.map(r => r.id === result.id ? {
            ...r,
            status: 'error' as const,
            error: err instanceof Error ? err.message : 'Unknown error',
          } : r)
        );
      }
    }

    setIsProcessing(false);
  }, [settings, results.length]);

  const handleClear = () => {
    // Revoke object URLs to prevent memory leaks
    results.forEach(r => {
      if (r.blob) URL.revokeObjectURL(URL.createObjectURL(r.blob));
    });
    setResults([]);
  };

  const totalProcessed = results.filter(r => r.status === 'done' || r.status === 'error').length;

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-error text-white px-4 py-2 rounded-lg text-sm shadow-lg animate-pulse">
          {toast}
        </div>
      )}

      <DropZone onFiles={processFiles} disabled={isProcessing} />
      <SettingsBar settings={settings} onChange={setSettings} outputFormats={outputFormats} />

      {results.length > 0 && (
        <div className="mt-6">
          <BulkActions
            results={results}
            onClear={handleClear}
            totalProcessed={totalProcessed}
            totalFiles={results.length}
          />
          <div className="flex flex-col gap-3">
            {results.map(result => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire ImageProcessor into index.astro**

Update `src/pages/index.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Hero from '../components/Hero.astro';
import ImageProcessor from '../components/ImageProcessor';
import HowItWorks from '../components/HowItWorks.astro';
import FAQ from '../components/FAQ.astro';
import Footer from '../components/Footer.astro';
---
<Layout>
  <Header />
  <Hero />
  <div id="tool" class="px-6 md:px-12 mt-8">
    <ImageProcessor client:visible />
  </div>
  <HowItWorks />
  <FAQ />
  <Footer />
</Layout>
```

- [ ] **Step 7: Verify full app works end-to-end**

Run: `npm run dev`
1. Drop an image → should process and show result card
2. Change quality slider → drop another image → verify different compression
3. Select WebP output format → drop PNG → verify conversion
4. Drop multiple images → verify sequential processing with progress
5. Click Download on a result → file downloads
6. Drop 2+ images → click "Download All" → zip downloads
7. Click "Clear All" → results cleared

- [ ] **Step 8: Commit**

```bash
git add src/components/DropZone.tsx src/components/SettingsBar.tsx src/components/ResultCard.tsx src/components/BulkActions.tsx src/components/ImageProcessor.tsx src/pages/index.astro
git commit -m "feat: add image processor React island with compress, convert, resize, bulk download"
```

---

## Chunk 4: Build Verification & Deploy Config

### Task 9: Production build + Cloudflare Pages config

**Files:**
- Modify: `astro.config.mjs` (if needed)
- Create: `public/_headers` (security headers)

- [ ] **Step 1: Add security headers for Cloudflare Pages**

Write `public/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

- [ ] **Step 2: Create OG image**

Generate a 1200x630 PNG for social media sharing. Create it via a temporary HTML file rendered to canvas, or use any image tool. The image should show:
- Dark background (#0a0a0a)
- "COMPRESSIMG" logo (white + gold)
- Subtitle: "Free Online Image Compressor — No Upload Required"

Save as `public/og-image.png` (PNG required — social platforms don't support SVG).

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Build succeeds, `dist/` contains static HTML + assets.

- [ ] **Step 4: Preview production build locally**

```bash
npm run preview
```

Expected: Site works at preview URL, all features functional.

- [ ] **Step 5: Verify build output for SEO**

Check `dist/index.html` contains:
- Meta title, description, keywords
- Open Graph tags
- Twitter Card tags
- Structured data JSON-LD
- Canonical URL
- Semantic heading hierarchy

Check `dist/sitemap-index.xml` exists.

- [ ] **Step 6: Commit**

```bash
git add public/_headers public/og-image.svg src/layouts/Layout.astro
git commit -m "feat: add Cloudflare headers, OG image, production build verified"
```

---

### Task 10: Deploy to Cloudflare Pages

- [ ] **Step 1: Confirm deployment readiness**

Verify:
- `npm run build` succeeds
- `dist/` contains all expected files
- No server-side code or functions

- [ ] **Step 2: Deploy via Wrangler or Cloudflare Dashboard**

Option A — Wrangler CLI:
```bash
npx wrangler pages deploy dist/ --project-name compressimg
```

Option B — Cloudflare Dashboard:
1. Go to Cloudflare Dashboard → Pages
2. Create new project → connect GitHub repo (if pushed)
3. Build command: `npm run build`
4. Output directory: `dist`

- [ ] **Step 3: Verify live deployment**

Check deployed URL:
- Page loads with dark/gold theme
- Image compression works
- All SEO meta tags present in source
- Lighthouse SEO score 90+

- [ ] **Step 4: Commit any deploy config changes**

```bash
git add -A
git commit -m "chore: deployment configuration complete"
```
