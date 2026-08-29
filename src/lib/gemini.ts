import { GoogleGenerativeAI, Part } from '@google/generative-ai';

export function createGeminiClient(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
}

function imageToGenerativePart(base64Data: string, mimeType: string = 'image/jpeg'): Part {
  const data = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  return {
    inlineData: {
      data,
      mimeType,
    },
  };
}

export interface EvaluationItem {
  questionNumber: string;
  isAnswered: boolean;
  status: 'correct' | 'partially_correct' | 'incorrect' | 'unattempted';
  score: number;
  maxScore: number;
  feedback: string;
  answerText: string;
  pageNumber: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  boundingBoxes?: Array<{ page: number; x: number; y: number; width: number; height: number }>;
}

/**
 * Super-fast unified evaluation in a single Gemini multimodal call (completes in ~4-7 seconds).
 * Eliminates Vercel Serverless timeout issues by avoiding multi-roundtrip serial requests.
 */
export async function evaluateExamUnified(
  apiKey: string,
  questionPaperImages: string[],
  answerSheetImages: string[]
): Promise<{
  questions: { number: string; text: string; maxMarks: number }[];
  evaluations: EvaluationItem[];
}> {
  const model = createGeminiClient(apiKey);

  const parts: (string | Part)[] = [];

  parts.push('=== SECTION 1: QUESTION PAPER IMAGES ===');
  questionPaperImages.forEach((img, idx) => {
    parts.push(`[Question Paper Page ${idx + 1}]`);
    parts.push(imageToGenerativePart(img));
  });

  parts.push('=== SECTION 2: STUDENT HANDWRITTEN ANSWER SHEET IMAGES ===');
  answerSheetImages.forEach((img, idx) => {
    parts.push(`[Answer Sheet Page ${idx + 1} (pageNumber: ${idx})]`);
    parts.push(imageToGenerativePart(img));
  });

  const prompt = `You are a strict, precise teacher grading a student's handwritten answer sheet.

TASK:
1. Extract ALL questions in printed order from the QUESTION PAPER images (number format: "1", "2", "3", "4", "5(a)", "11(a)", etc.) with maximum marks.
2. Match student handwritten answers from the ANSWER SHEET images for every question (even if written out of order).
3. Grade each answer strictly and calculate accurate bounding boxes (percentages 0-100 relative to page dimensions, 0-indexed pageNumber):
   - "correct": factually accurate and complete (score = maxScore)
   - "partially_correct": minor mistakes or incomplete (0 < score < maxScore)
   - "incorrect": wrong answer or major misconceptions (score = 0)
   - "unattempted": question was left unanswered by the student (score = 0, isAnswered = false, boundingBoxes = [])

BOUNDING BOX RULES:
- Tightly enclose ONLY the student's handwritten answer block for THIS question.
- Do NOT overlap with other question labels or answers.
- Multi-page answer: provide boundingBoxes array for each page.

Return ONLY a valid JSON object in this exact format:
{
  "questions": [
    {
      "number": "1",
      "text": "Full question text",
      "maxMarks": 2
    }
  ],
  "evaluations": [
    {
      "questionNumber": "1",
      "isAnswered": true,
      "status": "correct",
      "score": 2,
      "maxScore": 2,
      "feedback": "Detailed constructive feedback",
      "answerText": "Extracted student answer text",
      "pageNumber": 0,
      "boundingBox": { "x": 5, "y": 10, "width": 90, "height": 15 },
      "boundingBoxes": [
        { "page": 0, "x": 5, "y": 10, "width": 90, "height": 15 }
      ]
    },
    {
      "questionNumber": "2",
      "isAnswered": false,
      "status": "unattempted",
      "score": 0,
      "maxScore": 2,
      "feedback": "This question was not attempted.",
      "answerText": "",
      "pageNumber": 0,
      "boundingBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "boundingBoxes": []
    }
  ]
}`;

  parts.push(prompt);

  const result = await model.generateContent(parts);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse exam evaluation from AI response');
  }
}

export async function extractQuestions(
  apiKey: string,
  questionPaperImages: string[]
): Promise<{ questions: { number: string; text: string; maxMarks: number }[] }> {
  const model = createGeminiClient(apiKey);
  const imageParts = questionPaperImages.map(img => imageToGenerativePart(img));

  const prompt = `Extract ALL questions in order from these exam paper images.
Return ONLY JSON:
{
  "questions": [
    { "number": "1", "text": "Question text", "maxMarks": 2 }
  ]
}`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse questions from AI response');
  }
}

export async function extractAnswersAndGrade(
  apiKey: string,
  answerSheetImages: string[],
  questions: { number: string; text: string; maxMarks: number }[]
): Promise<{ evaluations: EvaluationItem[] }> {
  const model = createGeminiClient(apiKey);
  const imageParts = answerSheetImages.map(img => imageToGenerativePart(img));
  const questionsList = questions.map(q => `Q${q.number}: "${q.text}" [${q.maxMarks}]`).join('\n');

  const prompt = `Grade this student answer sheet.
QUESTIONS:
${questionsList}

Return ONLY JSON:
{
  "evaluations": [
    {
      "questionNumber": "1",
      "isAnswered": true,
      "status": "correct",
      "score": 2,
      "maxScore": 2,
      "feedback": "...",
      "answerText": "...",
      "pageNumber": 0,
      "boundingBox": { "x": 5, "y": 10, "width": 90, "height": 15 },
      "boundingBoxes": [{ "page": 0, "x": 5, "y": 10, "width": 90, "height": 15 }]
    }
  ]
}`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return { evaluations: parsed.evaluations || parsed.answers || [] };
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { evaluations: parsed.evaluations || parsed.answers || [] };
    }
    throw new Error('Failed to parse answers from AI response');
  }
}
