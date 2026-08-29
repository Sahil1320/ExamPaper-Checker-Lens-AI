'use client';

import { useRef, useState, useCallback } from 'react';
import styles from './UploadCard.module.css';

interface UploadCardProps {
  label: string;
  highlightWord: string;
  file: { name: string; size: number; pageCount: number } | null;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function UploadCard({ label, highlightWord, file, onFileSelect, onRemove }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) onFileSelect(droppedFile);
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!file) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onFileSelect(selected);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  if (file) {
    return (
      <div className={`${styles.uploadCard} ${styles.uploadCardFilled}`}>
        <div className={styles.fileInfo}>
          <div className={styles.fileIcon}>
            <span className={styles.fileIconText}>PDF</span>
          </div>
          <div className={styles.fileDetails}>
            <div className={styles.fileName}>{file.name}</div>
            <div className={styles.fileMeta}>
              {formatSize(file.size)} • {file.pageCount} Page{file.pageCount !== 1 ? 's' : ''}
            </div>
          </div>
          <button className={styles.removeBtn} onClick={onRemove} aria-label="Remove file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.uploadCard} ${isDragging ? styles.uploadCardDragging : ''}`}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/*"
        onChange={handleChange}
        className={styles.hiddenInput}
      />
      <div className={styles.uploadIcon}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div className={styles.uploadLabel}>
        Upload <span>{highlightWord}</span>
      </div>
      <div className={styles.uploadHint}>Max 10MB</div>
    </div>
  );
}
