import React, { useEffect, useState } from 'react';
import { formatSize } from '../lib/format';
import { downloadSingle } from '../lib/download';

export type ResultStatus = 'pending' | 'processing' | 'done' | 'error';

export interface FileResult {
  id: string;
  originalFile: File;
  blob: Blob | null;
  sizes: { original: number; compressed: number } | null;
  dimensions: { width: number; height: number } | null;
  status: ResultStatus;
  error: string | null;
  outputFormat: string;
  isAnimatedGif: boolean;
}

interface ResultCardProps {
  result: FileResult;
}

export default function ResultCard({ result }: ResultCardProps) {
  const { originalFile, blob, sizes, dimensions, status, error, outputFormat, isAnimatedGif } = result;
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // Generate thumbnail from compressed blob if available, otherwise from original file
  useEffect(() => {
    const source = blob ?? originalFile;
    const url = URL.createObjectURL(source);
    setThumbnailUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob, originalFile]);

  const savedBytes = sizes ? sizes.original - sizes.compressed : 0;
  const savedPercent = sizes && sizes.original > 0
    ? Math.round((savedBytes / sizes.original) * 100)
    : 0;
  const grew = savedBytes < 0;

  const handleDownload = () => {
    if (blob) downloadSingle(blob, originalFile.name, outputFormat);
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 flex gap-4 items-start">
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-lg overflow-hidden bg-bg-primary flex-shrink-0 flex items-center justify-center border border-border">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={originalFile.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-border" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-text-primary text-sm font-medium truncate"
          title={originalFile.name}
        >
          {originalFile.name}
        </p>

        {dimensions && (
          <p className="text-text-secondary text-xs mt-0.5">
            {dimensions.width} &times; {dimensions.height}
          </p>
        )}

        {/* Sizes */}
        {status === 'done' && sizes && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
            <span className="text-text-secondary text-xs line-through">
              {formatSize(sizes.original)}
            </span>
            <svg className="w-3 h-3 text-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-text-primary text-xs font-medium">
              {formatSize(sizes.compressed)}
            </span>
            {!grew && savedPercent > 0 && (
              <span className="text-success text-xs font-semibold">
                -{savedPercent}%
              </span>
            )}
            {grew && (
              <span className="text-error text-xs font-semibold">
                +{Math.abs(savedPercent)}% (larger)
              </span>
            )}
          </div>
        )}

        {status === 'pending' && (
          <p className="text-text-secondary text-xs mt-1">Waiting…</p>
        )}

        {status === 'processing' && (
          <p className="text-gold text-xs mt-1 animate-pulse">Processing…</p>
        )}

        {status === 'error' && (
          <p className="text-error text-xs mt-1" role="alert">
            {error ?? 'An error occurred'}
          </p>
        )}

        {isAnimatedGif && status === 'done' && (
          <p className="text-text-secondary text-xs mt-1 italic">
            Note: animated GIFs are compressed as static frames.
          </p>
        )}
      </div>

      {/* Download button */}
      {status === 'done' && blob && (
        <button
          onClick={handleDownload}
          className="flex-shrink-0 bg-gold hover:bg-gold-light text-bg-primary text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          aria-label={`Download ${originalFile.name}`}
        >
          Download
        </button>
      )}
    </div>
  );
}
