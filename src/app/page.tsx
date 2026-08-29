'use client';

import { useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar/Sidebar';
import Header from '@/components/Header/Header';
import UploadScreen from '@/components/UploadScreen/UploadScreen';
import ExtractingScreen from '@/components/ExtractingScreen/ExtractingScreen';
import ResultsScreen from '@/components/ResultsScreen/ResultsScreen';
import type { ProcessingResult, AppView } from '@/types';
import styles from './page.module.css';

interface FileData {
  file: File;
  name: string;
  size: number;
  pageCount: number;
}

const PROCESSING_STEPS = [
  'Converting documents to images',
  'Extracting questions from paper',
  'Mapping answers & grading',
  'Generating feedback',
];

export default function Home() {
  const [view, setView] = useState<AppView>('upload');
  const [questionPaper, setQuestionPaper] = useState<FileData | null>(null);
  const [answerSheet, setAnswerSheet] = useState<FileData | null>(null);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (file: File, type: 'question' | 'answer') => {
    // Validate file size
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Please upload a PDF or image file');
      return;
    }

    setError(null);

    let pageCount = 1;
    if (file.type === 'application/pdf') {
      try {
        const { getPageCount } = await import('@/lib/pdfToImages');
        pageCount = await getPageCount(file);
      } catch {
        pageCount = 1;
      }
    }

    const fileData: FileData = {
      file,
      name: file.name,
      size: file.size,
      pageCount,
    };

    if (type === 'question') {
      setQuestionPaper(fileData);
    } else {
      setAnswerSheet(fileData);
    }
  }, []);

  const handleStartMapping = useCallback(async () => {
    if (!questionPaper || !answerSheet) return;

    setView('extracting');
    setCurrentStep(0);
    setError(null);

    try {
      // Step 1: Convert PDFs to images
      setCurrentStep(0);
      const { fileToImages } = await import('@/lib/pdfToImages');
      const [qpImages, asImages] = await Promise.all([
        fileToImages(questionPaper.file),
        fileToImages(answerSheet.file),
      ]);

      // Step 2: Send to API for processing
      setCurrentStep(1);

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPaperImages: qpImages,
          answerSheetImages: asImages,
        }),
      });

      setCurrentStep(2);

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Processing failed');
      }

      setCurrentStep(3);

      // Add page images to result
      const result: ProcessingResult = {
        ...data.data,
        answerSheetPages: asImages,
        questionPaperPages: qpImages,
      };

      // Small delay to show completion
      await new Promise(r => setTimeout(r, 800));

      setProcessingResult(result);
      setView('results');
    } catch (err: unknown) {
      console.error('Processing error:', err);
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setView('upload');
    }
  }, [questionPaper, answerSheet]);

  const handleBack = useCallback(() => {
    setView('upload');
    setProcessingResult(null);
    setQuestionPaper(null);
    setAnswerSheet(null);
    setCurrentStep(0);
    setError(null);
  }, []);

  return (
    <div className={styles.appLayout}>
      <Sidebar collapsed={view === 'results'} />
      <main className={styles.mainContent} style={view === 'results' ? { marginLeft: 'var(--sidebar-collapsed)' } : undefined}>
        <Header />
        <div className={styles.mainBody}>
          {view === 'upload' && (
            <UploadScreen
              questionPaper={questionPaper}
              answerSheet={answerSheet}
              onQuestionPaperSelect={(f) => handleFileSelect(f, 'question')}
              onAnswerSheetSelect={(f) => handleFileSelect(f, 'answer')}
              onQuestionPaperRemove={() => setQuestionPaper(null)}
              onAnswerSheetRemove={() => setAnswerSheet(null)}
              onStartMapping={handleStartMapping}
            />
          )}

          {view === 'extracting' && (
            <ExtractingScreen
              currentStep={currentStep}
              steps={PROCESSING_STEPS}
            />
          )}

          {view === 'results' && processingResult && (
            <ResultsScreen
              result={processingResult}
              onBack={handleBack}
            />
          )}

          {error && view === 'upload' && (
            <div style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#FEE2E2',
              color: '#DC2626',
              padding: '12px 24px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 500,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 1000,
              maxWidth: '90%',
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
