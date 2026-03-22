# Logo Prompt — TinyIMG

**Files cần tạo:**
- `public/logo.png` — Logo chính (512x512px, transparent background)
- `public/logo-dark.png` — Logo trên nền tối (512x512px)
- `public/favicon.svg` — Favicon nhỏ (32x32px) — update sau khi có logo

## Prompt cho Gemini:

Design a modern, minimal logo for "TinyIMG" — a free online image processing toolkit (compress, edit, remove background). The logo should work as both an app icon and a brand mark.

Requirements:
- Icon/symbol only (no text) — will be paired with "TinyIMG" wordmark separately
- Concept: Combine the idea of "tiny/compression" (shrinking, minimizing) with "image" (photo, picture frame, pixels)
- Suggested concepts to explore:
  - A small diamond or gem shape (representing compressed/refined quality)
  - A minimalist photo frame being squeezed/compressed with an arrow
  - Abstract pixels condensing into a smaller form
  - A tiny sparkle/star over an image icon (representing the magic of processing)
- Color: Gold (#c9a84c) as primary, works on both dark (#0a0a0a) and light backgrounds
- Style: Geometric, clean lines, flat design, no gradients or 3D effects
- Must be recognizable at 16x16px (favicon size)
- Premium, trustworthy feel — not playful or cartoonish

Output: Square format (512x512px), transparent background, PNG.

## Prompt cho wordmark (optional):

Design a wordmark for "TinyIMG" to pair with the icon above.
- "Tiny" in a clean sans-serif font (Inter or similar), regular weight, white (#e8e8ea)
- "IMG" in gold (#c9a84c), bold weight, slightly larger or with a subtle gradient (gold to light gold #e8d48b)
- Kerning should be tight
- Output: Wide format (800x200px), transparent background, PNG.

## Sau khi có logo:

1. Save icon as `public/logo.png`
2. Tôi sẽ update `public/favicon.svg` từ chữ "C" sang icon mới
3. Update `public/site.webmanifest` nếu cần
4. Update Header.astro logo area nếu muốn dùng icon thay SVG hiện tại
