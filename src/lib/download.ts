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
