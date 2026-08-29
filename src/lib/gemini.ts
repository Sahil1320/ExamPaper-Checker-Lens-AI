import { GoogleGenerativeAI, Part } from '@google/generative-ai';

export function createGeminiClient(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
}

function imageToGenerativePart(base64Data: string, mimeType: string = 'image/png'): Part {
  // Strip the data URL prefix if present
  const data = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  return {
    inlineData: {
      data,
      mimeType,
    },
  };
}

export async function extractQuestions(
  apiKey: string,
  questionPaperImages: string[]
): Promise<{ questions: { number: string; text: string; maxMarks: number }[] }> {
  const model = createGeminiClient(apiKey);

  const imageParts = questionPaperImages.map(img => imageToGenerativePart(img));

  const prompt = `You are an expert at analyzing question papers. Analyze the provided question paper image(s) and extract ALL questions.

CRITICAL RULES:
1. Extract EVERY question in the EXACT printed order
2. Treat labelled sub-parts as SEPARATE questions (e.g., "11(a)" and "11(b)" should be TWO separate entries)
3. Preserve the ORIGINAL question numbering exactly as printed
4. Include the FULL question text
5. Determine the maximum marks for each question (look for marks in brackets like [2], (2 marks), etc.)
6. If marks are not explicitly stated, estimate based on question complexity (short answer: 1-2, medium: 3, long: 5)

Respond ONLY with valid JSON in this exact format:
{
  "questions": [
    {
      "number": "1",
      "text": "Full question text here",
      "maxMarks": 2
    },
    {
      "number": "2(a)",
      "text": "Full sub-question text here",
      "maxMarks": 3
    }
  ]
}

Do NOT include any text outside the JSON. Do NOT use markdown code blocks.`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text().trim();

  // Parse JSON, handling potential markdown code blocks
  const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Attempt to find JSON in the response
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse questions from AI response');
  }
}

export async function extractAnswersAndGrade(
  apiKey: string,
  answerSheetImages: string[],
  questions: { number: string; text: string; maxMarks: number }[]
): Promise<{
  answers: {
    questionNumber: string;
    answerText: string;
    isAnswered: boolean;
    pageNumber: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }[];
  grades: {
    questionNumber: string;
    score: number;
    maxScore: number;
    feedback: string;
    isCorrect: boolean;
  }[];
}> {
  const model = createGeminiClient(apiKey);

  const imageParts = answerSheetImages.map(img => imageToGenerativePart(img));

  const questionsList = questions.map(q => `- Q${q.number}: "${q.text}" (Max: ${q.maxMarks} marks)`).join('\n');

  const prompt = `You are an expert teacher grading a student's handwritten answer sheet. 

Here are the questions from the question paper:
${questionsList}

Analyze the student's handwritten answer sheet image(s) and:

1. IDENTIFY which question each answer corresponds to (students may answer out of order)
2. EXTRACT the text of each answer
3. DETERMINE the bounding box location of each answer on the page
4. GRADE each answer and provide constructive feedback
5. Mark questions that were NOT answered

CRITICAL RULES for bounding boxes:
- Coordinates are PERCENTAGES (0-100) relative to page dimensions:
  - pageNumber: 0-indexed page (Page 1 = 0, Page 2 = 1, etc.)
  - x = distance from LEFT edge (0 = left, 100 = right)
  - y = distance from TOP edge (0 = top, 100 = bottom) where this question's answer starts
  - width = percentage width of the handwritten area (usually 85-92)
  - height = percentage height covering ONLY this specific question's answer lines
- STRICT ISOLATION: The bounding box MUST tightly enclose ONLY the student's handwritten answer for THIS question.
- DO NOT OVERLAP: Stop the bounding box IMMEDIATELY where this question's answer ends. NEVER include subsequent question labels (like "Q9", "Q10"), subsequent answers, or notes like "Q9. Question left unanswered." inside the previous question's bounding box!
- For questions continuing across multiple pages, you may provide "boundingBoxes": [{ "page": 1, "x": 5, "y": 70, "width": 90, "height": 20 }, { "page": 2, "x": 5, "y": 8, "width": 90, "height": 18 }]
- For unanswered questions: isAnswered: false, boundingBox: { x: 0, y: 0, width: 0, height: 0 }, boundingBoxes: []

CRITICAL RULES for answer mapping:
- Match answers to questions by content and question numbers written by the student
- If a student wrote "Q3" or "3)" before their answer, map it to question 3
- Handle answers written out of order
- Mark unanswered questions with isAnswered: false

CRITICAL RULES for grading:
- Grade based on accuracy, completeness, and understanding shown
- Provide specific, constructive feedback
- Be fair but rigorous

${answerSheetImages.length > 1 ? `There are ${answerSheetImages.length} pages. The pageNumber is 0-indexed (first page = 0, second = 1, etc.)` : 'There is 1 page. Set pageNumber to 0 for all answers.'}

Respond ONLY with valid JSON in this exact format:
{
  "answers": [
    {
      "questionNumber": "1",
      "answerText": "Student's written answer text",
      "isAnswered": true,
      "pageNumber": 0,
      "boundingBox": { "x": 5, "y": 10, "width": 90, "height": 15 },
      "boundingBoxes": [
        { "page": 0, "x": 5, "y": 10, "width": 90, "height": 15 }
      ]
    },
    {
      "questionNumber": "3",
      "answerText": "",
      "isAnswered": false,
      "pageNumber": 0,
      "boundingBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "boundingBoxes": []
    }
  ],
  "grades": [
    {
      "questionNumber": "1",
      "score": 2,
      "maxScore": 2,
      "feedback": "Excellent work! You correctly identified the chloroplast as the organelle responsible for photosynthesis. Keep it up!",
      "isCorrect": true
    },
    {
      "questionNumber": "3",
      "score": 0,
      "maxScore": 2,
      "feedback": "This question was not attempted. Remember to attempt all questions even if you are unsure.",
      "isCorrect": false
    }
  ]
}

Do NOT include any text outside the JSON. Do NOT use markdown code blocks. Include an entry for EVERY question, even unanswered ones.`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text().trim();

  const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse answers from AI response');
  }
}
