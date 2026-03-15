# Contributing

Thank you for your interest in contributing to compressimg. This document covers how to set up the project locally, the PR process, and the code style guidelines.

## Development Setup

**Requirements:** Node.js 22 (see `.nvmrc`)

```bash
git clone https://github.com/michaelduong/compressimg.git
cd compressimg
npm install
npm run dev
```

The dev server runs at [http://localhost:4321](http://localhost:4321).

To verify your changes build cleanly before submitting a PR:

```bash
npm run build
```

There is no test framework configured. Build verification is the minimum bar.

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep commits focused and atomic.
3. Ensure `npm run build` passes with no errors.
4. Open a pull request using the provided template.
5. Describe what changed and why, not just what the diff shows.

PRs that introduce server-side logic, backend dependencies, or image upload functionality will not be accepted — see the constraint below.

## Code Style

- **Framework**: Astro 5 + React 18. Static content goes in `.astro` components; interactive UI goes in `.tsx` React islands.
- **Styling**: Tailwind CSS v4. The theme (colors, spacing tokens) is defined in `src/styles/global.css` inside the `@theme` block. There is no `tailwind.config.mjs`.
- **TypeScript**: Strict mode is enabled. All new code must be fully typed — no `any`, no `@ts-ignore` without a comment explaining why.
- **Formatting**: 2-space indentation, UTF-8, LF line endings (see `.editorconfig`). Format your code consistently with the existing style.
- **Imports**: ESM throughout. No CommonJS `require()`.

## Core Constraint: No Server-Side Code

compressimg is intentionally a zero-server tool. All image processing must happen client-side using Web APIs (Web Worker, OffscreenCanvas, Canvas API). Do not introduce:

- API routes or server endpoints
- Node.js image processing libraries (sharp, jimp, etc.)
- Any code that sends image data over the network

If a feature cannot be implemented purely in the browser, it is out of scope for this project.

## Reporting Bugs

Use the bug report issue template. Include browser version, OS, file types involved, and steps to reproduce.
