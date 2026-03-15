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
        card-enter rounded-xl overflow-hidden transition-all duration-300
        ${status === 'processing'
          ? 'bg-gold/[0.04] border border-gold/15 processing-glow'
          : status === 'error'
            ? 'bg-error/[0.03] border border-error/15'
            : 'bg-bg-card border border-border hover:border-border/60'
        }
      `}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Thumbnail */}
      <div className={`relative w-full aspect-[4/3] bg-bg-primary ${status === 'processing' ? 'shimmer' : ''}`}>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            className={`w-full h-full object-cover ${status === 'processing' ? 'opacity-40' : ''}`}
          />
        )}

        {/* Processing overlay */}
        {status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="progress-ring w-8 h-8" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {/* Savings badge */}
        {status === 'done' && sizes && !grew && savedPercent > 0 && (
          <div className="absolute top-2 right-2 count-up text-[11px] font-bold text-success bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-md">
            -{savedPercent}%
          </div>
        )}
        {status === 'done' && grew && (
          <div className="absolute top-2 right-2 text-[11px] font-bold text-error bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-md">
            +{Math.abs(savedPercent)}%
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <p className="text-text-primary text-xs font-medium truncate" title={originalFile.name}>
          {originalFile.name}
        </p>

        {status === 'done' && sizes && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-[11px]">
              {formatSize(sizes.original)}
              <span className="text-gold/50 mx-1">→</span>
              <span className="text-white font-medium">{formatSize(sizes.compressed)}</span>
            </span>
            <button
              onClick={handleDownload}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-[10px] font-bold px-2.5 py-1 rounded-md transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
              aria-label={`Download ${originalFile.name}`}
            >
              Save
            </button>
          </div>
        )}

        {status === 'processing' && (
          <span className="text-gold text-[11px] font-medium">Compressing...</span>
        )}
        {status === 'pending' && (
          <span className="text-text-secondary/40 text-[11px]">Queued</span>
        )}
        {status === 'error' && (
          <span className="text-error text-[11px]">{error ?? 'Failed'}</span>
        )}
      </div>
    </div>
  );
}
