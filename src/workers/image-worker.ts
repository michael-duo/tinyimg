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
