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
