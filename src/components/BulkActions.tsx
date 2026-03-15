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
    <div className="flex items-center gap-3 py-2">
      {/* Progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          {isProcessing && (
            <svg className="progress-ring w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
            </svg>
          )}
          <span className="text-text-secondary">
            <span className="text-white font-semibold">{totalProcessed}</span>/{totalFiles}
          </span>
          {totalSaved > 0 && (
            <span className="count-up text-success font-semibold">
              -{totalPercent}% · {formatSize(totalSaved)} saved
            </span>
          )}
          {!isProcessing && totalProcessed === totalFiles && totalSaved <= 0 && (
            <span className="text-text-secondary">Done</span>
          )}
        </div>
        {/* Thin progress bar */}
        <div className="h-0.5 bg-white/5 rounded-full mt-1.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${totalFiles > 0 ? (totalProcessed / totalFiles) * 100 : 0}%`,
              background: totalProcessed === totalFiles
                ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                : 'linear-gradient(90deg, #c9a84c, #d4b85e)',
            }}
          />
        </div>
      </div>

      {/* Actions */}
      {doneResults.length > 1 && (
        <button
          onClick={handleDownloadAll}
          className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-[11px] font-bold px-3.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95 flex-shrink-0"
        >
          Save All (.zip)
        </button>
      )}
      <button
        onClick={onClear}
        className="text-text-secondary/50 hover:text-error text-[11px] px-2 py-1.5 rounded transition-colors cursor-pointer flex-shrink-0"
      >
        Clear
      </button>
    </div>
  );
}
