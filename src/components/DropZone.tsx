import { useRef, useState, useCallback } from 'react';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function DropZone({ onFiles, disabled = false }: DropZoneProps) {
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

  return (
    <div
      className={`dropzone-wrapper ${isDragging ? 'dragging' : ''} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="dropzone-border">
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Drop zone: drop images here or click to browse"
          className={`
            relative rounded-[1.15rem] px-8 py-12 text-center cursor-pointer
            transition-all duration-500 ease-out select-none outline-none
            focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary
            ${isDragging ? 'bg-gold-dim scale-[1.01]' : 'bg-bg-primary hover:bg-[#0e0e0e]'}
          `}
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

          {/* Floating upload icon */}
          <div className="flex justify-center mb-4">
            <div className={`float-icon p-3.5 rounded-2xl bg-gold-dim border border-gold/20 transition-all duration-300 ${isDragging ? 'scale-110 bg-gold/20' : ''}`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-7 h-7 text-gold"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
          </div>

          <p className="text-white text-lg font-semibold mb-1 tracking-tight">
            {isDragging ? 'Release to compress' : 'Drop images to compress'}
          </p>
          <p className="text-text-secondary text-sm">
            or <span className="text-gold underline underline-offset-2 decoration-gold/40">browse files</span>
          </p>
          <p className="text-text-secondary/40 text-[11px] mt-3">
            JPEG · PNG · WebP · AVIF · GIF — max 20 MB · 50 files
          </p>
        </div>
      </div>
    </div>
  );
}
