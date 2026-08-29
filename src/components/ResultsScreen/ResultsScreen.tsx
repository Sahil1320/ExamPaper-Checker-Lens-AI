'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProcessingResult, BoundingBox } from '@/types';
import styles from './ResultsScreen.module.css';

interface ResultsScreenProps {
  result: ProcessingResult;
  onBack: () => void;
}

export default function ResultsScreen({ result, onBack }: ResultsScreenProps) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [mobileTab, setMobileTab] = useState<'questions' | 'answers'>('questions');
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const totalPages = result.answerSheetPages.length;

  const toggleQuestion = useCallback((qId: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  }, []);

  const toggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setExpandedQuestions(new Set());
    } else {
      setExpandedQuestions(new Set(result.questions.map(q => q.id)));
    }
    setAllExpanded(!allExpanded);
  }, [allExpanded, result.questions]);

  const selectQuestion = useCallback((qId: string) => {
    setSelectedQuestionId(qId);
    setExpandedQuestions(prev => new Set(prev).add(qId));

    // Find the answer and scroll to it
    const answer = result.answers.find(a => a.questionId === qId);
    if (answer && answer.boundingBoxes.length > 0) {
      const bb = answer.boundingBoxes[0];
      setCurrentPage(bb.page);

      // On mobile, switch to answer tab
      setMobileTab('answers');

      // Scroll to the highlighted region
      setTimeout(() => {
        const pageEl = pageRefs.current.get(bb.page);
        if (pageEl && viewerRef.current) {
          const pageRect = pageEl.getBoundingClientRect();
          const viewerRect = viewerRef.current.getBoundingClientRect();
          const targetY = pageRect.top - viewerRect.top + viewerRef.current.scrollTop + (pageRect.height * bb.y / 100) - 100;
          viewerRef.current.scrollTo({ top: targetY, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [result.answers]);

  const getGradeForQuestion = useCallback((qId: string) => {
    return result.grades.find(g => g.questionId === qId);
  }, [result.grades]);

  const getAnswerForQuestion = useCallback((qId: string) => {
    return result.answers.find(a => a.questionId === qId);
  }, [result.answers]);

  const getScoreClass = (score: number, maxScore: number, status?: string) => {
    if (status === 'incorrect' || score === 0) return styles.scoreRed;
    const ratio = maxScore > 0 ? score / maxScore : 0;
    if (ratio >= 0.8) return styles.scoreGreen;
    if (ratio >= 0.4) return styles.scoreOrange;
    return styles.scoreRed;
  };

  const getGradeClass = (grade: string) => {
    if (grade.startsWith('A')) return styles.gradeA;
    if (grade.startsWith('B')) return styles.gradeB;
    if (grade.startsWith('C')) return styles.gradeC;
    return styles.gradeD;
  };

  // Get highlights for current view
  const getHighlightsForPage = useCallback((pageIndex: number): { bb: BoundingBox; questionNumber: string }[] => {
    if (!selectedQuestionId) return [];
    const answer = result.answers.find(a => a.questionId === selectedQuestionId);
    if (!answer) return [];
    const question = result.questions.find(q => q.id === selectedQuestionId);
    return answer.boundingBoxes
      .filter(bb => bb.page === pageIndex)
      .map(bb => ({ bb, questionNumber: question?.number || '?' }));
  }, [selectedQuestionId, result.answers, result.questions]);

  // Track scroll position to update page indicator
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleScroll = () => {
      let closestPage = 0;
      let minDistance = Infinity;
      pageRefs.current.forEach((el, pageIdx) => {
        const rect = el.getBoundingClientRect();
        const viewerRect = viewer.getBoundingClientRect();
        const distance = Math.abs(rect.top - viewerRect.top);
        if (distance < minDistance) {
          minDistance = distance;
          closestPage = pageIdx;
        }
      });
      setCurrentPage(closestPage);
    };

    viewer.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewer.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={styles.container}>
      {/* Mobile Tabs */}
      <div className={styles.mobileTabs}>
        <div className={styles.tabBar}>
          <button
            className={mobileTab === 'questions' ? styles.tabActive : styles.tab}
            onClick={() => setMobileTab('questions')}
          >
            Questions
          </button>
          <button
            className={mobileTab === 'answers' ? styles.tabActive : styles.tab}
            onClick={() => setMobileTab('answers')}
          >
            Answer Sheet
          </button>
        </div>
      </div>

      {/* LEFT PANEL: Questions */}
      <div className={`${styles.questionPanel} ${mobileTab !== 'questions' ? styles.questionPanelHidden : ''}`}>
        {/* Back button */}
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          New Assessment
        </button>

        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelTitle}>Extracted Questions <span className={styles.panelTitleSub}>(from question paper)</span></div>
          </div>
          <button className={styles.expandAllBtn} onClick={toggleExpandAll}>
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>

        <div className={styles.questionList}>
          {result.questions.map((question) => {
            const grade = getGradeForQuestion(question.id);
            const answer = getAnswerForQuestion(question.id);
            const isSelected = selectedQuestionId === question.id;
            const isExpanded = expandedQuestions.has(question.id);

            return (
              <div
                key={question.id}
                className={isSelected ? styles.questionItemSelected : styles.questionItem}
                onClick={() => selectQuestion(question.id)}
              >
                <div className={styles.questionRow}>
                  <div className={styles.questionNumber}>{question.number}</div>
                  <div className={styles.questionContent}>
                    <div className={styles.questionText}>{question.text}</div>
                  </div>
                  <div className={styles.questionMeta}>
                    {grade && (
                      <span className={getScoreClass(grade.score, grade.maxScore, grade.status)}>
                        {grade.score}/{grade.maxScore}
                      </span>
                    )}
                    <button
                      className={isExpanded ? styles.chevronOpen : styles.chevron}
                      onClick={(e) => { e.stopPropagation(); toggleQuestion(question.id); }}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Not answered indicator */}
                {answer && !answer.isAnswered && (
                  <div className={styles.notAnswered}>⚠ Not answered</div>
                )}

                {/* Expanded feedback */}
                {isExpanded && grade && (
                  <div className={styles.feedbackSection}>
                    <div className={styles.feedbackLabel}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                      </svg>
                      AI Feedback
                    </div>
                    <div className={styles.feedbackText}>{grade.feedback}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary Bar */}
        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{result.summary.totalScore}/{result.summary.maxTotalScore}</span>
            <span className={styles.summaryLabel}>Total Score</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{result.summary.percentage}%</span>
            <span className={styles.summaryLabel}>Percentage</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{result.summary.answeredQuestions}/{result.summary.totalQuestions}</span>
            <span className={styles.summaryLabel}>Answered</span>
          </div>
          <div className={getGradeClass(result.summary.grade)}>
            Grade {result.summary.grade}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Answer Sheet */}
      <div className={`${styles.answerPanel} ${mobileTab !== 'answers' ? styles.answerPanelHidden : ''}`}>
        <div className={styles.answerHeader}>
          <span className={styles.answerTitle}>Answer Sheet</span>
          <div className={styles.answerControls}>
            {/* Zoom */}
            <div className={styles.zoomControls}>
              <button className={styles.zoomBtn} onClick={() => setZoom(z => Math.max(50, z - 25))} aria-label="Zoom out">
                −
              </button>
              <span className={styles.zoomLevel}>{zoom}%</span>
              <button className={styles.zoomBtn} onClick={() => setZoom(z => Math.min(200, z + 25))} aria-label="Zoom in">
                +
              </button>
            </div>

            {/* Page nav */}
            <div className={styles.pageNav}>
              <button
                className={currentPage > 0 ? styles.pageBtn : styles.pageBtnDisabled}
                onClick={() => {
                  const prev = Math.max(0, currentPage - 1);
                  setCurrentPage(prev);
                  pageRefs.current.get(prev)?.scrollIntoView({ behavior: 'smooth' });
                }}
                aria-label="Previous page"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span>Page {currentPage + 1} of {totalPages}</span>
              <button
                className={currentPage < totalPages - 1 ? styles.pageBtn : styles.pageBtnDisabled}
                onClick={() => {
                  const next = Math.min(totalPages - 1, currentPage + 1);
                  setCurrentPage(next);
                  pageRefs.current.get(next)?.scrollIntoView({ behavior: 'smooth' });
                }}
                aria-label="Next page"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.answerViewer} ref={viewerRef}>
          {result.answerSheetPages.map((pageImg, pageIdx) => {
            const highlights = getHighlightsForPage(pageIdx);
            return (
              <div
                key={pageIdx}
                className={styles.pageWrapper}
                ref={(el) => { if (el) pageRefs.current.set(pageIdx, el); }}
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
              >
                <img
                  src={pageImg}
                  alt={`Answer sheet page ${pageIdx + 1}`}
                  className={styles.pageImage}
                  draggable={false}
                />
                {/* Highlight overlays */}
                {highlights.map((h, i) => (
                  <div
                    key={i}
                    className={styles.highlight}
                    style={{
                      left: `${h.bb.x}%`,
                      top: `${h.bb.y}%`,
                      width: `${h.bb.width}%`,
                      height: `${h.bb.height}%`,
                    }}
                  >
                    <span className={styles.highlightBadge}>Q{h.questionNumber}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
