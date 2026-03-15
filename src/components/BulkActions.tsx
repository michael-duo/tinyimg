import React from 'react';
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

  const totalOriginal = results.reduce((acc, r) => acc + (r.sizes?.original ?? 0), 0);
  const totalCompressed = results.reduce((acc, r) => acc + (r.sizes?.compressed ?? 0), 0);
  const totalSaved = totalOriginal - totalCompressed;

  const handleDownloadAll = async () => {
    const files = doneResults.map((r) => ({
      blob: r.blob!,
      filename: getCompressedFilename(r.originalFile.name, r.outputFormat),
    }));
    await downloadAll(files);
  };

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-text-secondary">
          <span className="text-text-primary font-semibold">{totalProcessed}</span>
          <span> / {totalFiles}</span>
          <span className="text-text-secondary"> processed</span>
        </span>

        {totalSaved > 0 && (
          <span className="text-success font-medium">
            Saved {formatSize(totalSaved)} total
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {doneResults.length > 1 && (
          <button
            onClick={handleDownloadAll}
            className="bg-gold hover:bg-gold-light text-bg-primary text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Download All (.zip)
          </button>
        )}
        <button
          onClick={onClear}
          className="border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
