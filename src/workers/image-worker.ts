export interface ProcessMessage {
  type: 'process';
  file: File;
  settings: {
    format: string;  // MIME type or 'original'
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
  /** The actual output MIME type (may differ from requested if smart picked a better one) */
  actualFormat: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

/**
 * Quality presets per format — aggressive but visually acceptable.
 * Multiple levels tried from low to high; pick the first that's smaller than original.
 */
const QUALITY_LEVELS: Record<string, number[]> = {
  'image/jpeg': [0.70, 0.78, 0.85],
  'image/webp': [0.72, 0.80, 0.88],
  'image/avif': [0.60, 0.70, 0.80],
};

/** Try encoding at given type+quality, return blob */
async function tryEncode(
  canvas: OffscreenCanvas,
  type: string,
  quality?: number
): Promise<Blob> {
  const opts: ImageEncodeOptions = { type };
  if (quality !== undefined && type !== 'image/png') {
    opts.quality = quality;
  }
  return canvas.convertToBlob(opts);
}

/**
 * Smart compress: try multiple quality levels + WebP alternative.
 * Pick the smallest result that's still smaller than original.
 */
async function smartCompress(
  canvas: OffscreenCanvas,
  requestedType: string,
): Promise<Blob> {
  const candidates: Blob[] = [];

  // 1. Try requested format at multiple quality levels
  const levels = QUALITY_LEVELS[requestedType];
  if (levels) {
    // Start with lowest quality (most aggressive) first
    for (const q of levels) {
      candidates.push(await tryEncode(canvas, requestedType, q));
    }
  } else {
    // PNG or unknown — just encode as-is
    candidates.push(await tryEncode(canvas, requestedType));
  }

  // 2. Always try WebP as alternative (often significantly smaller)
  if (requestedType !== 'image/webp') {
    const webpLevels = QUALITY_LEVELS['image/webp']!;
    for (const q of webpLevels) {
      candidates.push(await tryEncode(canvas, 'image/webp', q));
    }
  }

  // 3. For PNG input, also try JPEG (drops alpha but much smaller for photos)
  if (requestedType === 'image/png') {
    const jpegLevels = QUALITY_LEVELS['image/jpeg']!;
    for (const q of jpegLevels) {
      candidates.push(await tryEncode(canvas, 'image/jpeg', q));
    }
  }

  // 4. Pick the smallest candidate
  candidates.sort((a, b) => a.size - b.size);
  return candidates[0];
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

    // 4. Smart compress
    const requestedType = settings.format === 'original' ? file.type : settings.format;
    const blob = await smartCompress(canvas, requestedType);

    const response: ResultMessage = {
      type: 'result',
      blob,
      originalSize: file.size,
      newSize: blob.size,
      width,
      height,
      actualFormat: blob.type,
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
