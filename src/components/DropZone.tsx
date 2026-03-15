import React, { useRef, useState, useCallback } from 'react';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled) return;
      const arr = Array.from(files);
      if (arr.length > 0) onFiles(arr);
    },
    [onFiles, disabled]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    }
  };

  const borderColor = isDragging ? 'border-gold-light' : 'border-gold';
  const bgColor = isDragging ? 'bg-gold-dim' : 'bg-transparent';
  const cursor = disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer';

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Drop zone: drop images here or click to browse"
      className={`border-2 border-dashed ${borderColor} ${bgColor} ${cursor} rounded-2xl p-12 text-center transition-all duration-200 select-none outline-none focus-visible:ring-2 focus-visible:ring-gold`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* Upload icon */}
      <div className="flex justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-12 h-12 ${isDragging ? 'text-gold-light' : 'text-gold'} transition-colors duration-200`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>

      <p className="text-text-primary text-xl font-semibold mb-1">
        Drop your images here
      </p>
      <p className="text-text-secondary text-sm mb-4">
        or click to browse files
      </p>
      <p className="text-text-secondary text-xs">
        Supports JPEG, PNG, WebP, AVIF, GIF &middot; Up to 20 MB per file &middot; Max 50 files
      </p>
    </div>
  );
}
