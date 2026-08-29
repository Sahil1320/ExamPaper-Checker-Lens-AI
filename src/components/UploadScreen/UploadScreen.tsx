'use client';

import UploadCard from '../UploadCard/UploadCard';
import styles from './UploadScreen.module.css';

interface FileData {
  file: File;
  name: string;
  size: number;
  pageCount: number;
}

interface UploadScreenProps {
  questionPaper: FileData | null;
  answerSheet: FileData | null;
  onQuestionPaperSelect: (file: File) => void;
  onAnswerSheetSelect: (file: File) => void;
  onQuestionPaperRemove: () => void;
  onAnswerSheetRemove: () => void;
  onStartMapping: () => void;
}

export default function UploadScreen({
  questionPaper,
  answerSheet,
  onQuestionPaperSelect,
  onAnswerSheetSelect,
  onQuestionPaperRemove,
  onAnswerSheetRemove,
  onStartMapping,
}: UploadScreenProps) {
  const bothUploaded = questionPaper !== null && answerSheet !== null;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>
        Upload <span className={styles.titleHighlight}>Question Paper &amp; Answer Sheets</span>
      </h1>
      <p className={styles.subtitle}>Upload both files to get started</p>

      {/* Teacher Avatar */}
      <div className={styles.avatarContainer}>
        <div className={styles.avatarRingOuter} />
        <div className={styles.avatarRing} />
        <div className={styles.avatar}>
          <img src="/teacher-avatar.png" alt="Teacher avatar" className={styles.avatarImg} />
        </div>
      </div>

      {/* Upload Cards */}
      <div className={styles.cardsRow}>
        <UploadCard
          label="Question Paper"
          highlightWord="Question Paper"
          file={questionPaper}
          onFileSelect={onQuestionPaperSelect}
          onRemove={onQuestionPaperRemove}
        />
        <UploadCard
          label="Answer Sheet"
          highlightWord="Answer Sheet"
          file={answerSheet}
          onFileSelect={onAnswerSheetSelect}
          onRemove={onAnswerSheetRemove}
        />
      </div>

      {/* Start Mapping Button */}
      <button
        className={bothUploaded ? styles.startBtn : styles.startBtnDisabled}
        onClick={onStartMapping}
        disabled={!bothUploaded}
      >
        Start Mapping
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>

      <p className={styles.helperText}>
        Once both files are uploaded, you&apos;ll be able to map answers with questions.
      </p>
    </div>
  );
}
