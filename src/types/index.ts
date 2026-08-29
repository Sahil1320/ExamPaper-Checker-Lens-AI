// ===== Core Data Types =====

export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  pageCount: number;
  type: 'question_paper' | 'answer_sheet';
  previewUrl?: string;
}

export interface BoundingBox {
  page: number;       // 0-indexed page number
  x: number;          // percentage from left (0-100)
  y: number;          // percentage from top (0-100)
  width: number;      // percentage width (0-100)
  height: number;     // percentage height (0-100)
}

export interface Question {
  id: string;
  number: string;           // e.g., "1", "2", "11(a)", "11(b)"
  text: string;
  maxMarks: number;
  subParts?: string[];      // for questions with sub-parts
}

export interface Answer {
  questionId: string;
  questionNumber: string;
  text: string;
  pageNumbers: number[];
  boundingBoxes: BoundingBox[];
  isAnswered: boolean;
}

export interface GradingResult {
  questionId: string;
  questionNumber: string;
  score: number;
  maxScore: number;
  feedback: string;
  status: 'correct' | 'partially_correct' | 'incorrect' | 'unattempted';
  isCorrect: boolean;
}

export interface ProcessingResult {
  questions: Question[];
  answers: Answer[];
  grades: GradingResult[];
  answerSheetPages: string[];   // base64 encoded page images
  questionPaperPages: string[]; // base64 encoded page images
  summary: GradingSummary;
}

export interface GradingSummary {
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  totalQuestions: number;
  answeredQuestions: number;
  unansweredQuestions: number;
  grade: string;
}

// ===== API Types =====

export interface ProcessRequest {
  questionPaperImages: string[];   // base64 images
  answerSheetImages: string[];     // base64 images
}

export interface ProcessResponse {
  success: boolean;
  data?: ProcessingResult;
  error?: string;
}

// ===== UI State Types =====

export type AppView = 'upload' | 'extracting' | 'results';

export interface AppState {
  view: AppView;
  questionPaper: UploadedFile | null;
  answerSheet: UploadedFile | null;
  processingResult: ProcessingResult | null;
  selectedQuestionId: string | null;
  error: string | null;
}
