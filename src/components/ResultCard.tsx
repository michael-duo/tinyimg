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

export default function ResultCard({ result, index }: ResultCardProps) {
  const { originalFile, blob, sizes, status, error, outputFormat } = result;
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const source = blob ?? originalFile;
    const url = URL.createObjectURL(source);
    setThumbnailUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob, originalFile]);

  const savedPercent = sizes && sizes.original > 0
    ? Math.round(((sizes.original - sizes.compressed) / sizes.original) * 100)
    : 0;
  const grew = sizes ? sizes.compressed > sizes.original : false;

  const handleDownload = () => {
    if (blob) downloadSingle(blob, originalFile.name, outputFormat);
  };

  return (
    <div
      className={`
        card-enter
        rounded-lg px-3 py-2.5 flex gap-3 items-center
        transition-all duration-300
        ${status === 'processing'
          ? 'bg-gold/[0.04] border border-gold/15'
          : status === 'error'
            ? 'bg-error/[0.03] border border-error/15'
            : 'bg-bg-card border border-border hover:border-border/60'
        }
      `}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Thumbnail */}
      <div className={`
        w-9 h-9 rounded-md overflow-hidden flex-shrink-0
        ${status === 'processing' ? 'shimmer' : 'bg-bg-primary'}
      `}>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            className={`w-full h-full object-cover ${status === 'processing' ? 'opacity-50' : ''}`}
          />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-xs font-medium truncate" title={originalFile.name}>
          {originalFile.name}
        </p>
        {status === 'processing' && (
          <span className="text-gold text-[10px]">Compressing...</span>
        )}
        {status === 'pending' && (
          <span className="text-text-secondary/50 text-[10px]">Queued</span>
        )}
        {status === 'error' && (
          <span className="text-error text-[10px]">{error ?? 'Failed'}</span>
        )}
      </div>

      {/* Size info */}
      {status === 'done' && sizes && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-text-secondary text-[11px]">{formatSize(sizes.original)}</span>
          <svg className="w-3 h-3 text-gold/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="text-white text-[11px] font-semibold">{formatSize(sizes.compressed)}</span>
          {!grew && savedPercent > 0 && (
            <span className="count-up text-success text-[10px] font-bold bg-success/10 px-1.5 py-0.5 rounded">
              -{savedPercent}%
            </span>
          )}
          {grew && (
            <span className="text-error text-[10px] font-semibold bg-error/10 px-1.5 py-0.5 rounded">
              +{Math.abs(savedPercent)}%
            </span>
          )}
        </div>
      )}

      {/* Processing spinner */}
      {status === 'processing' && (
        <svg className="progress-ring w-5 h-5 flex-shrink-0" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="3" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
        </svg>
      )}

      {/* Download */}
      {status === 'done' && blob && (
        <button
          onClick={handleDownload}
          className="btn-shine flex-shrink-0 bg-gold hover:bg-gold-light text-bg-primary text-[11px] font-bold px-3 py-1.5 rounded-md transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
          aria-label={`Download ${originalFile.name}`}
        >
          Save
        </button>
      )}
    </div>
  );
}
