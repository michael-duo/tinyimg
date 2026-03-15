import { useEffect, useState } from 'react';
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
  index: number;
}

/* Circular progress spinner */
function ProcessingSpinner() {
  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      <svg className="progress-ring w-10 h-10" viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r="14"
          fill="none"
          stroke="rgba(201,168,76,0.15)"
          strokeWidth="3"
        />
        <circle
          cx="18" cy="18" r="14"
          fill="none"
          stroke="#c9a84c"
          strokeWidth="3"
          strokeDasharray="60 28"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/* Success checkmark */
function SuccessCheck() {
  return (
    <div className="check-pop w-10 h-10 flex-shrink-0 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

/* Error icon */
function ErrorIcon() {
  return (
    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-error/10 border border-error/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}

/* Pending dots */
function PendingDots() {
  return (
    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-secondary/50 animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}

export default function ResultCard({ result, index }: ResultCardProps) {
  const { originalFile, blob, sizes, dimensions, status, error, outputFormat, isAnimatedGif } = result;
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

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
    <div
      className={`
        card-enter group
        rounded-xl p-4 flex gap-4 items-center
        transition-all duration-300
        ${status === 'processing'
          ? 'bg-gold/[0.04] border border-gold/20 processing-glow'
          : status === 'error'
            ? 'bg-error/[0.04] border border-error/20'
            : status === 'done'
              ? 'bg-bg-card border border-border hover:border-gold/30'
              : 'bg-bg-card border border-border'
        }
      `}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Status indicator */}
      {status === 'processing' && <ProcessingSpinner />}
      {status === 'done' && <SuccessCheck />}
      {status === 'error' && <ErrorIcon />}
      {status === 'pending' && <PendingDots />}

      {/* Thumbnail */}
      <div className={`
        w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center
        border transition-all duration-300
        ${status === 'processing'
          ? 'border-gold/20 shimmer'
          : 'border-border bg-bg-primary'
        }
      `}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={originalFile.name}
            className={`w-full h-full object-cover transition-all duration-500 ${status === 'processing' ? 'opacity-60 blur-[1px]' : ''}`}
          />
        ) : (
          <div className="w-6 h-6 rounded bg-border" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm font-medium truncate" title={originalFile.name}>
          {originalFile.name}
        </p>

        {dimensions && (
          <p className="text-text-secondary text-xs mt-0.5">
            {dimensions.width} &times; {dimensions.height}
          </p>
        )}

        {/* Status-specific content */}
        {status === 'processing' && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-gold text-xs font-medium">Compressing</span>
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-gold animate-pulse"
                  style={{ animationDelay: `${i * 300}ms` }}
                />
              ))}
            </span>
          </div>
        )}

        {status === 'pending' && (
          <p className="text-text-secondary/60 text-xs mt-1.5">Queued</p>
        )}

        {status === 'error' && (
          <p className="text-error text-xs mt-1.5" role="alert">
            {error ?? 'Processing failed'}
          </p>
        )}

        {status === 'done' && sizes && (
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-text-secondary text-xs">
              {formatSize(sizes.original)}
            </span>
            <svg className="w-3 h-3 text-gold flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="text-white text-xs font-semibold">
              {formatSize(sizes.compressed)}
            </span>
            {!grew && savedPercent > 0 && (
              <span className="count-up inline-flex items-center gap-1 text-success text-xs font-bold bg-success/10 px-2 py-0.5 rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                -{savedPercent}%
              </span>
            )}
            {grew && (
              <span className="text-error text-xs font-semibold bg-error/10 px-2 py-0.5 rounded-full">
                +{Math.abs(savedPercent)}%
              </span>
            )}
          </div>
        )}

        {isAnimatedGif && status === 'done' && (
          <p className="text-text-secondary/60 text-[11px] mt-1 italic">
            Animated GIF — first frame only
          </p>
        )}
      </div>

      {/* Download button */}
      {status === 'done' && blob && (
        <button
          onClick={handleDownload}
          className="btn-shine flex-shrink-0 bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
          aria-label={`Download ${originalFile.name}`}
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Save
          </span>
        </button>
      )}
    </div>
  );
}
