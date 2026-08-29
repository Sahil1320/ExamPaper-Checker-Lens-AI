import { NextRequest, NextResponse } from 'next/server';
import * as groqService from '@/lib/groq';
import * as geminiService from '@/lib/gemini';

export const maxDuration = 60; // Allow up to 60 seconds for processing

function normalize(str: string | number | undefined | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .toLowerCase()
    .replace(/^(question|q|ans|answer|no\.?)\s*/i, '')
    .replace(/[().:\s_-]/g, '')
    .trim();
}

function matchesQuestion(num1: string | number | undefined, num2: string | number | undefined): boolean {
  const n1 = normalize(num1);
  const n2 = normalize(num2);
  if (!n1 || !n2) return false;
  return n1 === n2 || n1.endsWith(n2) || n2.endsWith(n1);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questionPaperImages, answerSheetImages } = body;

    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!groqKey && !geminiKey) {
      return NextResponse.json(
        { success: false, error: 'No API key configured. Set GOOGLE_GEMINI_API_KEY (recommended) or GROQ_API_KEY in .env.local' },
        { status: 500 }
      );
    }

    if (!questionPaperImages?.length || !answerSheetImages?.length) {
      return NextResponse.json(
        { success: false, error: 'Both question paper and answer sheet images are required' },
        { status: 400 }
      );
    }

    // Prefer Gemini (1M TPM free) over Groq (8K TPM free, can't handle multi-image)
    const useGemini = Boolean(geminiKey);
    const primaryService = useGemini ? geminiService : groqService;
    const primaryKey = (useGemini ? geminiKey : groqKey) as string;
    const fallbackService = useGemini && groqKey ? groqService : (!useGemini && geminiKey ? geminiService : null);
    const fallbackKey = useGemini && groqKey ? groqKey : (!useGemini && geminiKey ? geminiKey : null);

    let extractedQuestions;
    let evalResult;

    try {
      // Step 1: Extract questions from the question paper
      extractedQuestions = await primaryService.extractQuestions(primaryKey, questionPaperImages);

      // Step 2: Extract answers and grade them
      evalResult = await primaryService.extractAnswersAndGrade(
        primaryKey,
        answerSheetImages,
        extractedQuestions.questions
      );
    } catch (primaryErr) {
      console.warn(`[AI] Primary provider failed:`, (primaryErr as Error)?.message);

      if (fallbackService && fallbackKey) {
        console.log(`[AI] Falling back to ${useGemini ? 'Groq' : 'Gemini'}...`);
        // Step 1 fallback
        if (!extractedQuestions) {
          extractedQuestions = await fallbackService.extractQuestions(fallbackKey, questionPaperImages);
        }
        // Step 2 fallback
        evalResult = await fallbackService.extractAnswersAndGrade(
          fallbackKey,
          answerSheetImages,
          extractedQuestions.questions
        );
      } else {
        throw primaryErr;
      }
    }

    // Extract unified evaluation items (supporting both { evaluations: [...] } and { answers: [...], grades: [...] })
    let evaluations: Array<{
      questionNumber: string;
      isAnswered?: boolean;
      status?: 'correct' | 'partially_correct' | 'incorrect' | 'unattempted';
      score?: number;
      maxScore?: number;
      feedback?: string;
      answerText?: string;
      pageNumber?: number;
      boundingBox?: { x: number; y: number; width: number; height: number };
      boundingBoxes?: Array<{ page?: number; x?: number; y?: number; width?: number; height?: number }>;
    }> = [];

    if ('evaluations' in evalResult && Array.isArray(evalResult.evaluations)) {
      evaluations = evalResult.evaluations;
    } else if ('answers' in evalResult && Array.isArray((evalResult as any).answers)) {
      const ansArr = (evalResult as any).answers as Array<any>;
      const gradeArr = ((evalResult as any).grades || []) as Array<any>;
      evaluations = ansArr.map((ans, i) => {
        const grade = gradeArr.find((g: any) => matchesQuestion(g.questionNumber, ans.questionNumber)) || gradeArr[i];
        return {
          questionNumber: ans.questionNumber,
          isAnswered: ans.isAnswered,
          status: ans.isAnswered ? (grade?.isCorrect ? 'correct' : 'incorrect') : 'unattempted',
          score: grade?.score,
          maxScore: grade?.maxScore,
          feedback: grade?.feedback,
          answerText: ans.answerText,
          pageNumber: ans.pageNumber,
          boundingBox: ans.boundingBox,
          boundingBoxes: ans.boundingBoxes,
        };
      });
    }

    // Step 3: Build structured response
    const questions = extractedQuestions.questions.map((q, i) => ({
      id: `q-${i}`,
      number: q.number,
      text: q.text,
      maxMarks: Number(q.maxMarks) || 2,
    }));

    const answers = questions.map((q, idx) => {
      let evalItem = evaluations.find(e => matchesQuestion(e.questionNumber, q.number));
      if (!evalItem && evaluations.length === questions.length) {
        evalItem = evaluations[idx];
      }

      const isAnswered = Boolean(
        evalItem &&
        evalItem.isAnswered !== false &&
        evalItem.status !== 'unattempted' &&
        (evalItem.answerText && evalItem.answerText.trim().length > 0)
      );

      let boxList: Array<{ page: number; x: number; y: number; width: number; height: number }> = [];

      if (isAnswered) {
        if (evalItem?.boundingBoxes && Array.isArray(evalItem.boundingBoxes) && evalItem.boundingBoxes.length > 0) {
          boxList = evalItem.boundingBoxes
            .filter(b => b && (Number(b.width) > 0 || Number(b.height) > 0))
            .map(b => ({
              page: Number(b.page ?? evalItem?.pageNumber ?? 0),
              x: Math.max(0, Math.min(100, Number(b.x) || 5)),
              y: Math.max(0, Math.min(100, Number(b.y) || 10)),
              width: Math.max(1, Math.min(100, Number(b.width) || 90)),
              height: Math.max(1, Math.min(100, Number(b.height) || 12)),
            }));
        } else if (evalItem?.boundingBox && (Number(evalItem.boundingBox.width) > 0 || Number(evalItem.boundingBox.height) > 0)) {
          boxList = [{
            page: Number(evalItem.pageNumber || 0),
            x: Math.max(0, Math.min(100, Number(evalItem.boundingBox.x) || 5)),
            y: Math.max(0, Math.min(100, Number(evalItem.boundingBox.y) || 10)),
            width: Math.max(1, Math.min(100, Number(evalItem.boundingBox.width) || 90)),
            height: Math.max(1, Math.min(100, Number(evalItem.boundingBox.height) || 12)),
          }];
        }
      }

      const pageNums = boxList.length > 0
        ? Array.from(new Set(boxList.map(b => b.page)))
        : (evalItem && evalItem.pageNumber !== undefined ? [evalItem.pageNumber] : [0]);

      return {
        questionId: q.id,
        questionNumber: q.number,
        text: evalItem?.answerText || '',
        pageNumbers: pageNums,
        boundingBoxes: boxList,
        isAnswered,
      };
    });

    const grades = questions.map((q, idx) => {
      let evalItem = evaluations.find(e => matchesQuestion(e.questionNumber, q.number));
      if (!evalItem && evaluations.length === questions.length) {
        evalItem = evaluations[idx];
      }

      const matchedAnswer = answers[idx];
      const isAnswered = matchedAnswer?.isAnswered ?? false;
      const maxScore = Number(evalItem?.maxScore) || q.maxMarks;

      let status: 'correct' | 'partially_correct' | 'incorrect' | 'unattempted' = 'unattempted';
      let score = 0;

      if (!isAnswered || evalItem?.status === 'unattempted') {
        status = 'unattempted';
        score = 0;
      } else if (evalItem?.status === 'incorrect') {
        status = 'incorrect';
        score = 0;
      } else if (evalItem?.status === 'correct') {
        status = 'correct';
        score = evalItem.score !== undefined ? Number(evalItem.score) : maxScore;
      } else if (evalItem?.status === 'partially_correct') {
        status = 'partially_correct';
        score = evalItem.score !== undefined ? Number(evalItem.score) : Math.max(1, Math.round(maxScore / 2));
      } else {
        // Fallback inference if status not specified
        const rawScore = evalItem?.score !== undefined ? Number(evalItem.score) : 0;
        if (rawScore >= maxScore) {
          status = 'correct';
          score = maxScore;
        } else if (rawScore > 0) {
          status = 'partially_correct';
          score = rawScore;
        } else {
          status = 'incorrect';
          score = 0;
        }
      }

      // CRITICAL GUARANTEE: If answer is incorrect or unattempted, score MUST be 0
      if (status === 'incorrect' || status === 'unattempted') {
        score = 0;
      }

      const isCorrect = status === 'correct';

      return {
        questionId: q.id,
        questionNumber: q.number,
        score,
        maxScore,
        status,
        feedback: evalItem?.feedback || (isAnswered ? 'Answer evaluated.' : 'This question was not attempted by the student.'),
        isCorrect,
      };
    });

    // Calculate summary
    const totalScore = grades.reduce((sum, g) => sum + g.score, 0);
    const maxTotalScore = grades.reduce((sum, g) => sum + g.maxScore, 0);
    const answeredQuestions = answers.filter(a => a.isAnswered).length;
    const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;

    let grade = 'D';
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B+';
    else if (percentage >= 60) grade = 'B';
    else if (percentage >= 50) grade = 'C';
    else if (percentage >= 40) grade = 'D';
    else grade = 'F';

    return NextResponse.json({
      success: true,
      data: {
        questions,
        answers,
        grades,
        summary: {
          totalScore,
          maxTotalScore,
          percentage,
          totalQuestions: questions.length,
          answeredQuestions,
          unansweredQuestions: questions.length - answeredQuestions,
          grade,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Processing error:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
