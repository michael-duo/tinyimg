import { useRef, useState, useCallback } from 'react';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Compact mode when results exist */
  compact?: boolean;
}

export default function DropZone({ onFiles, disabled = false, compact = false }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled) return;
      const arr = Array.from(files);
      if (arr.length > 0) onFiles(arr);
    },
    [onFiles, disabled]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
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
      e.target.value = '';
    }
  };

  const sharedProps = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onClick: handleClick,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); },
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
      className="hidden"
      onChange={handleInputChange}
      disabled={disabled}
    />
  );

  /* ── Compact: inline strip ── */
  if (compact) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Add more files"
        className={`
          flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg cursor-pointer
          transition-all duration-300 select-none outline-none
          ${isDragging
            ? 'bg-gold/10 border border-gold/30'
            : 'border border-dashed border-border hover:border-gold/30 hover:bg-white/2'
          }
          ${disabled ? 'opacity-40 pointer-events-none' : ''}
        `}
        {...sharedProps}
      >
        {fileInput}
        <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-text-secondary text-xs">
          {isDragging ? 'Drop here' : 'Add more images'}
        </span>
      </div>
    );
  }

  /* ── Full: hero drop zone ── */
  return (
    <div
      className={`dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Drop zone: drop images here or click to browse"
      {...sharedProps}
    >
      <div className="dropzone-inner absolute inset-0 pointer-events-none" />
      <div className="dropzone-bg" />

      <div className="relative z-10 py-10 px-6 text-center select-none outline-none flex flex-col items-center gap-3">
        {fileInput}

        <div className={`dropzone-icon w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${
          isDragging ? 'bg-gold/15 border border-gold/30' : 'bg-white/3 border border-white/5'
        }`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 transition-colors duration-300 ${isDragging ? 'text-gold' : 'text-text-secondary'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <p className={`text-base font-semibold tracking-tight transition-colors duration-300 ${
            isDragging ? 'text-gold' : 'text-white'
          }`}>
            {isDragging ? 'Release to compress' : 'Drop images to compress'}
          </p>
          <p className="text-text-secondary text-sm">
            or <span className="text-gold/80 underline underline-offset-2 decoration-gold/30">browse files</span>
          </p>
          <p className="text-text-secondary/40 text-xs mt-1 tracking-wide">JPEG · PNG · WebP · AVIF · GIF</p>
        </div>
      </div>
    </div>
  );
}
