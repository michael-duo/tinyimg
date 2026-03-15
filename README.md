# compressimg

A fast, privacy-first image compression tool that runs entirely in the browser. No uploads, no servers — your images never leave your device.

![compressimg screenshot](docs/screenshot.png)

---

## Features

- Compress JPEG, PNG, WebP, and AVIF images
- Smart format selection — automatically picks the smallest output across formats and quality levels
- Batch processing — up to 50 files at once
- Convert between formats (WebP, JPEG, original)
- Bulk download as ZIP
- Zero server — all processing happens client-side via Web Worker and OffscreenCanvas
- Works offline after first load

## Tech Stack

![Astro](https://img.shields.io/badge/Astro-5-BC52EE?logo=astro&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-deployed-F38020?logo=cloudflare&logoColor=white)

## Getting Started

**Requirements:** Node.js 22+

```bash
git clone https://github.com/michaelduong/compressimg.git
cd compressimg
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

### Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## How It Works

compressimg is a fully static site (Astro SSG) with a single React island for the interactive compression UI.

**Architecture:**

1. Static Astro pages are rendered at build time — zero JavaScript shipped for the marketing content.
2. The `ImageProcessor` React component hydrates with `client:visible` (only when scrolled into view).
3. When files are dropped, a short-lived **Web Worker** is spawned per batch.
4. Inside the worker, **OffscreenCanvas** + `convertToBlob()` perform resize and re-encode operations off the main thread.
5. Smart compression tries multiple codec/quality combinations (original format, WebP, JPEG) and returns the smallest result.
6. Results stream back to the UI via `postMessage`; the worker is terminated after the batch completes.

No image data is ever sent to a server.

## Deploy to Cloudflare Pages

The output is a fully static site with no server-side rendering. Deploy directly from the `dist/` directory.

```bash
npm run build
```

Then connect your GitHub repository to Cloudflare Pages with these settings:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — copyright 2026 Michael Duong
