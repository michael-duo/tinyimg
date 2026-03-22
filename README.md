<p align="center">
  <img src="https://raw.githubusercontent.com/michael-duo/tinyimg/main/public/logo.webp" alt="TinyIMG" width="80" height="80" />
</p>

<h1 align="center">TinyIMG</h1>

<p align="center">
  Fast, privacy-first image toolkit that runs entirely in your browser.<br/>
  Compress, convert, edit, and remove backgrounds — no uploads, no servers.
</p>

<p align="center">
  <a href="https://tinyimg.michaelit.dev/">
    <img src="https://img.shields.io/badge/Live-tinyimg.michaelit.dev-c9a84c?style=flat-square" alt="Live Demo" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/michael-duo/tinyimg?style=flat-square" alt="MIT License" />
  </a>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-5-BC52EE?style=flat-square&logo=astro&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
</p>

---

## Why TinyIMG?

Most image tools upload your files to a server. TinyIMG doesn't. Every operation — compression, format conversion, background removal, editing — happens **100% client-side** using Web Workers, OffscreenCanvas, and on-device AI models. Your images never leave your browser.

## Features

### Compress & Convert
- **Smart compression** — automatically tries multiple quality levels across formats (original, WebP, JPEG) and picks the smallest output
- **Batch processing** — drop up to 50 files at once
- **Format conversion** — JPEG, PNG, WebP, AVIF
- **Quality & resize controls** — adjustable quality slider and max-width downscaling
- **Bulk ZIP download** — download all results in one click
- **Clipboard paste** — Ctrl+V to compress directly from clipboard

### Background Removal
- **AI-powered** — runs on-device ML models (no server, no API key)
- **Dual model support** — choose between quality and speed
- **Batch processing** — remove backgrounds from multiple images at once

### Image Editor
- **Crop & resize** — freeform or social media presets (Instagram, Facebook, Twitter, etc.)
- **AI face blur** — automatically detects and blurs faces using MediaPipe
- **Smart crop** — AI-assisted content-aware cropping

## Getting Started

**Prerequisites:** Node.js 22+ (see [`.nvmrc`](.nvmrc))

```bash
git clone https://github.com/michael-duo/tinyimg.git
cd tinyimg
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on `localhost:4321` |
| `npm run build` | Production static build → `dist/` |
| `npm run preview` | Preview production build locally |

## Architecture

```
Browser (zero server)
├── Astro SSG ─────────── Static HTML pages, zero JS for marketing content
├── React Islands ─────── Hydrate on visibility (client:visible)
│   ├── ImageProcessor ── Compression orchestrator
│   ├── ImageEditor ───── Crop, blur, smart crop
│   └── RemoveBg ──────── Background removal UI
├── Web Workers ───────── Off-main-thread image processing
│   └── OffscreenCanvas + convertToBlob()
└── On-device AI ──────── @imgly/background-removal, MediaPipe
```

**Key design decisions:**
- **Island architecture** — static `.astro` components ship zero JS; React islands hydrate only when needed
- **Worker-per-batch** — a short-lived Web Worker is spawned for each compression batch, then terminated
- **Smart codec selection** — the worker tries every codec/quality combination and returns the smallest result
- **No server dependency** — all processing uses browser APIs (Canvas, Web Worker, WebAssembly)

## Deployment

TinyIMG is a fully static site. Deploy the `dist/` output to any static host.

**Cloudflare Pages** (recommended):

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | `22` |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a PR.

**Core constraint:** TinyIMG is a zero-server tool. All image processing must happen client-side using Web APIs. PRs that introduce server-side logic or network image uploads will not be accepted.

## License

[MIT](LICENSE) &copy; 2026 Michael Duong
