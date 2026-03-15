import { useCallback, useEffect, useRef, useState } from 'react';
import DropZone from './DropZone';
import SettingsBar from './SettingsBar';
import type { Settings } from './SettingsBar';
import ResultCard from './ResultCard';
import type { FileResult } from './ResultCard';
import BulkActions from './BulkActions';
import {
  detectOutputFormats,
  SUPPORTED_INPUT_TYPES,
  MAX_FILE_SIZE,
  MAX_FILE_COUNT,
  WORKER_TIMEOUT_MS,
} from '../lib/format-support';
import type { ImageFormat } from '../lib/format-support';

interface Toast {
  message: string;
  id: number;
}

let toastCounter = 0;
let resultCounter = 0;

export default function ImageProcessor() {
  const [settings, setSettings] = useState<Settings>({
    quality: 80,
    format: 'original',
    maxWidth: undefined,
  });
  const [results, setResults] = useState<FileResult[]>([]);
  const [outputFormats, setOutputFormats] = useState<ImageFormat[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const workerRef = useRef<Worker | null>(null);

  // Detect supported formats on mount
  useEffect(() => {
    detectOutputFormats().then(setOutputFormats);
  }, []);

  // Show a toast that auto-dismisses after 4 seconds
  const showToast = useCallback((message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { message, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Validate files and return only accepted ones
  const validateFiles = useCallback(
    (files: File[]): File[] => {
      const existingCount = results.length;

      if (existingCount >= MAX_FILE_COUNT) {
        showToast(`Maximum ${MAX_FILE_COUNT} files allowed.`);
        return [];
      }

      const accepted: File[] = [];
      const errors: string[] = [];

      for (const file of files) {
        if (existingCount + accepted.length >= MAX_FILE_COUNT) {
          errors.push(`Only ${MAX_FILE_COUNT} files max — some files were skipped.`);
          break;
        }
        if (!SUPPORTED_INPUT_TYPES.has(file.type)) {
          errors.push(`"${file.name}" is not a supported image type.`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`"${file.name}" exceeds the 20 MB size limit.`);
          continue;
        }
        accepted.push(file);
      }

      // Deduplicate error messages
      const unique = [...new Set(errors)];
      unique.forEach(showToast);

      return accepted;
    },
    [results.length, showToast]
  );

  // Process files sequentially using a Web Worker
  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsProcessing(true);

      // Initialise a fresh worker for this batch
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      const worker = new Worker(
        new URL('../workers/image-worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      // Create pending result entries
      const newResults: FileResult[] = files.map((file) => ({
        id: String(++resultCounter),
        originalFile: file,
        blob: null,
        sizes: null,
        dimensions: null,
        status: 'pending',
        error: null,
        outputFormat:
          settings.format === 'original' ? file.type : settings.format,
        isAnimatedGif: file.type === 'image/gif',
      }));

      setResults((prev) => [...prev, ...newResults]);

      // Process each file sequentially
      for (let i = 0; i < newResults.length; i++) {
        const entry = newResults[i];
        const file = entry.originalFile;
        const outputFormat =
          settings.format === 'original' ? file.type : settings.format;

        // Mark as processing
        setResults((prev) =>
          prev.map((r) =>
            r.id === entry.id ? { ...r, status: 'processing' } : r
          )
        );

        const workerResult = await new Promise<{
          blob: Blob;
          originalSize: number;
          newSize: number;
          width: number;
          height: number;
        } | { error: string }>((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ error: 'Processing timed out' });
          }, WORKER_TIMEOUT_MS);

          const handler = (e: MessageEvent) => {
            clearTimeout(timeout);
            worker.removeEventListener('message', handler);
            if (e.data.type === 'result') {
              resolve(e.data);
            } else {
              resolve({ error: e.data.message ?? 'Unknown error' });
            }
          };

          worker.addEventListener('message', handler);
          worker.postMessage({
            type: 'process',
            file,
            settings: {
              quality: settings.quality / 100,
              format: settings.format,
              maxWidth: settings.maxWidth,
            },
          });
        });

        if ('error' in workerResult) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === entry.id
                ? { ...r, status: 'error', error: workerResult.error }
                : r
            )
          );
        } else {
          setResults((prev) =>
            prev.map((r) =>
              r.id === entry.id
                ? {
                    ...r,
                    status: 'done',
                    blob: workerResult.blob,
                    outputFormat,
                    sizes: {
                      original: workerResult.originalSize,
                      compressed: workerResult.newSize,
                    },
                    dimensions: {
                      width: workerResult.width,
                      height: workerResult.height,
                    },
                  }
                : r
            )
          );
        }
      }

      worker.terminate();
      workerRef.current = null;
      setIsProcessing(false);
    },
    [settings]
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      const accepted = validateFiles(files);
      if (accepted.length > 0) processFiles(accepted);
    },
    [validateFiles, processFiles]
  );

  const handleClear = useCallback(() => {
    // Revoke any object URLs that ResultCard may have created via the blob prop
    // (ResultCard manages its own thumbnail URLs internally, so we just need to
    // terminate any ongoing work and reset state)
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsProcessing(false);
    setResults([]);
  }, []);

  const totalProcessed = results.filter(
    (r) => r.status === 'done' || r.status === 'error'
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Toasts */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-bg-card border border-border text-text-primary text-sm px-4 py-3 rounded-xl shadow-lg pointer-events-auto max-w-xs"
            role="alert"
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Drop Zone */}
      <DropZone onFiles={handleFiles} disabled={isProcessing} />

      {/* Settings */}
      <SettingsBar
        settings={settings}
        onChange={setSettings}
        outputFormats={outputFormats}
      />

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-4">
          <BulkActions
            results={results}
            onClear={handleClear}
            totalProcessed={totalProcessed}
            totalFiles={results.length}
          />
          <div className="flex flex-col gap-3">
            {results.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
