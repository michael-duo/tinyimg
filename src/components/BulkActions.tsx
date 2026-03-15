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
    <div className="rounded-xl border border-border bg-bg-card p-5">
      {/* Top row: title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-white text-base font-semibold tracking-tight">Results</h2>
          {isProcessing && (
            <div className="flex items-center gap-2 text-gold text-xs font-medium">
              <svg className="progress-ring w-4 h-4" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="60 28" strokeLinecap="round" />
              </svg>
              Processing...
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {doneResults.length > 1 && (
            <button
              onClick={handleDownloadAll}
              className="btn-shine bg-gold hover:bg-gold-light text-bg-primary text-xs font-bold px-5 py-2.5 rounded-lg transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download All (.zip)
            </button>
          )}
          <button
            onClick={onClear}
            className="border border-border text-text-secondary hover:text-error hover:border-error/40 text-xs font-medium px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-4 flex flex-wrap items-center gap-6">
        {/* Progress bar */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-text-secondary">
              <span className="text-white font-semibold">{totalProcessed}</span> / {totalFiles} files
            </span>
            {!isProcessing && totalProcessed === totalFiles && (
              <span className="text-success font-medium count-up">Complete</span>
            )}
          </div>
          <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
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

        {/* Savings stat */}
        {totalSaved > 0 && (
          <div className="count-up flex items-center gap-3 bg-success/[0.06] border border-success/10 rounded-lg px-4 py-2.5">
            <div className="text-right">
              <p className="text-success text-sm font-bold leading-none">-{totalPercent}%</p>
              <p className="text-success/60 text-[10px] mt-0.5">saved</p>
            </div>
            <div className="w-px h-8 bg-success/20" />
            <div>
              <p className="text-white text-sm font-semibold leading-none">{formatSize(totalSaved)}</p>
              <p className="text-text-secondary text-[10px] mt-0.5">smaller</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
