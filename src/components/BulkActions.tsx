import { formatSize } from '../lib/format';
import { downloadAll, getCompressedFilename } from '../lib/download';
import type { FileResult } from './ResultCard';

interface BulkActionsProps {
  results: FileResult[];
  onClear: () => void;
  totalProcessed: number;
  totalFiles: number;
}

export default function BulkActions({ results, onClear, totalProcessed, totalFiles }: BulkActionsProps) {
  const doneResults = results.filter((r) => r.status === 'done' && r.blob);
  const isProcessing = results.some((r) => r.status === 'processing' || r.status === 'pending');

  const totalOriginal = doneResults.reduce((acc, r) => acc + (r.sizes?.original ?? 0), 0);
  const totalCompressed = doneResults.reduce((acc, r) => acc + (r.sizes?.compressed ?? 0), 0);
  const totalSaved = totalOriginal - totalCompressed;
  const totalPercent = totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0;

  const handleDownloadAll = async () => {
    const files = doneResults.map((r) => ({
      blob: r.blob!,
      filename: getCompressedFilename(r.originalFile.name, r.outputFormat),
    }));
    await downloadAll(files);
  };

  return (
    <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
      <div className="flex items-center gap-3 text-xs">
        {isProcessing && (
          <svg className="progress-ring w-3.5 h-3.5" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="3" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
          </svg>
        )}
        <span className="text-text-secondary">
          <span className="text-white font-semibold">{totalProcessed}</span>/{totalFiles}
        </span>
        {totalSaved > 0 && (
          <span className="count-up text-success font-semibold">-{totalPercent}% · {formatSize(totalSaved)} saved</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {doneResults.length > 1 && (
          <button
            onClick={handleDownloadAll}
            className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-[11px] font-bold px-3.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer"
          >
            ↓ Save All
          </button>
        )}
        <button
          onClick={onClear}
          className="text-text-secondary/40 hover:text-error text-[11px] cursor-pointer transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
