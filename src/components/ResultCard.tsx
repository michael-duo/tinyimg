import { useEffect, useState } from 'react';
import { formatSize } from '../lib/format';
import { downloadSingle } from '../lib/download';
import { setImage } from '../lib/image-transfer';

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

  const handleTransfer = async (target: '/edit' | '/remove-bg') => {
    if (!blob || !result.dimensions) return;
    await setImage({
      blob,
      name: originalFile.name,
      mimeType: outputFormat,
      width: result.dimensions.width,
      height: result.dimensions.height,
      from: 'compress',
    });
    window.location.href = target;
  };

  return (
    <div
      className="card-enter flex items-center gap-4 py-3.5 border-b border-white/5 last:border-b-0"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Thumbnail */}
      <div className={`w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-bg-primary ${status === 'processing' ? 'shimmer' : ''}`}>
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" className={`w-full h-full object-cover ${status === 'processing' ? 'opacity-40' : ''}`} />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-text-primary text-sm font-medium truncate">{originalFile.name}</p>
          {result.isAnimatedGif && status === 'done' && (
            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              First frame only
            </span>
          )}
        </div>
        {status === 'processing' && (
          <span className="text-gold text-xs">Compressing...</span>
        )}
        {status === 'pending' && (
          <span className="text-text-secondary/50 text-xs">Queued</span>
        )}
        {status === 'error' && (
          <span className="text-error text-xs">{error ?? 'Failed'}</span>
        )}
      </div>

      {/* Status / sizes */}
      {status === 'done' && sizes && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-text-secondary text-sm">{formatSize(sizes.original)}</span>
          <span className="text-gold/40">→</span>
          <span className="text-white text-sm font-semibold">{formatSize(sizes.compressed)}</span>
          {!grew && savedPercent > 0 && (
            <span className="count-up text-success text-xs font-bold bg-success/10 px-2 py-1 rounded-md">-{savedPercent}%</span>
          )}
          {grew && (
            <span className="text-error text-xs font-bold bg-error/10 px-2 py-1 rounded-md">+{Math.abs(savedPercent)}%</span>
          )}
          <button
            onClick={handleDownload}
            className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-3.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer"
            aria-label={`Download ${originalFile.name}`}
          >
            Save
          </button>
          <button
            onClick={() => handleTransfer('/edit')}
            className="text-xs px-2.5 py-1.5 rounded-md text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/8 transition-all duration-200 cursor-pointer"
            aria-label={`Edit ${originalFile.name}`}
          >
            Edit
          </button>
          <button
            onClick={() => handleTransfer('/remove-bg')}
            className="text-xs px-2.5 py-1.5 rounded-md text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/8 transition-all duration-200 cursor-pointer"
            aria-label={`Remove background from ${originalFile.name}`}
          >
            BG
          </button>
        </div>
      )}

      {status === 'processing' && (
        <svg className="progress-ring w-5 h-5 shrink-0" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="3" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
