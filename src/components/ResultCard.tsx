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
      className="card-enter flex items-center gap-3 py-2.5 border-b border-white/5 last:border-b-0"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Thumbnail */}
      <div className={`w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-bg-primary ${status === 'processing' ? 'shimmer' : ''}`}>
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" className={`w-full h-full object-cover ${status === 'processing' ? 'opacity-40' : ''}`} />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-xs font-medium truncate">{originalFile.name}</p>
      </div>

      {/* Status / sizes */}
      {status === 'done' && sizes && (
        <>
          <span className="text-text-secondary text-[11px] flex-shrink-0">{formatSize(sizes.original)}</span>
          <span className="text-gold/40 text-[11px] flex-shrink-0">→</span>
          <span className="text-white text-[11px] font-semibold flex-shrink-0">{formatSize(sizes.compressed)}</span>
          {!grew && savedPercent > 0 && (
            <span className="count-up text-success text-[10px] font-bold bg-success/10 px-1.5 py-0.5 rounded flex-shrink-0">-{savedPercent}%</span>
          )}
          {grew && (
            <span className="text-error text-[10px] font-bold bg-error/10 px-1.5 py-0.5 rounded flex-shrink-0">+{Math.abs(savedPercent)}%</span>
          )}
          <button
            onClick={handleDownload}
            className="text-gold text-[11px] font-semibold underline underline-offset-2 decoration-gold/30 hover:decoration-gold cursor-pointer flex-shrink-0 transition-colors"
            aria-label={`Download ${originalFile.name}`}
          >
            Save
          </button>
        </>
      )}

      {status === 'processing' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <svg className="progress-ring w-4 h-4" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="3" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
          </svg>
          <span className="text-gold text-[11px]">Compressing...</span>
        </div>
      )}

      {status === 'pending' && (
        <span className="text-text-secondary/40 text-[11px] flex-shrink-0">Queued</span>
      )}

      {status === 'error' && (
        <span className="text-error text-[11px] flex-shrink-0">{error ?? 'Failed'}</span>
      )}
    </div>
  );
}
