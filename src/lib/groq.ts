import Groq from 'groq-sdk';

export function createGroqClient(apiKey: string) {
  return new Groq({ apiKey });
}

function formatImageUrl(base64Data: string): string {
  if (base64Data.startsWith('data:')) {
    return base64Data;
  }
  return `data:image/jpeg;base64,${base64Data}`;
}

async function executeVisionCompletion(
  groq: Groq,
  prompt: string,
  images: string[]
): Promise<string> {
  const imageContents = images.map(img => ({
    type: 'image_url' as const,
    image_url: {
      url: formatImageUrl(img),
    },
  }));

  // Qwen 3.x defaults to "thinking" mode which wastes output tokens on internal
  // reasoning. Prepending /no_think disables it so the model jumps straight to JSON.
  const noThinkPrompt = `/no_think\n${prompt}`;

  const models = ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b'];

  let lastError: unknown = null;

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];

    // Strategy 1: Use response_format with /no_think
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert exam evaluator. Respond with valid JSON only.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: noThinkPrompt },
              ...imageContents,
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content || '{}';
      JSON.parse(content); // validate
      return content;
    } catch (err: unknown) {
      lastError = err;
      const errCode = (err as any)?.error?.error?.code || '';
      const errMsg = (err as Error)?.message || '';
      console.warn(`[Groq] ${model} attempt 1 failed: ${errCode || errMsg}`);

      // Strategy 2: If JSON validation failed, retry without response_format
      if (errCode === 'json_validate_failed' || errMsg.includes('json')) {
        // Small delay to avoid rate-limit churn
        await new Promise(r => setTimeout(r, 2000));

        try {
          console.warn(`[Groq] Trying ${model} without response_format constraint...`);
          const fallbackResponse = await groq.chat.completions.create({
            model,
            messages: [
              {
                role: 'system',
                content: 'Respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.',
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: noThinkPrompt + '\n\nReturn ONLY the raw JSON object.' },
                  ...imageContents,
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 4096,
          });

          const rawContent = fallbackResponse.choices[0]?.message?.content || '';
          const jsonContent = extractJsonFromText(rawContent);
          if (jsonContent) return jsonContent;
        } catch (fallbackErr) {
          console.warn(`[Groq] ${model} fallback also failed:`, (fallbackErr as Error)?.message);
          lastError = fallbackErr;
        }
      }
    }

    // Delay before trying next model to respect rate limits
    if (mi < models.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw lastError || new Error('Vision completion failed across all models');
}

/**
 * Extracts a valid JSON object from text that may contain markdown fences or explanatory content.
 */
function extractJsonFromText(text: string): string | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const candidate = cleaned.substring(start, end + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function extractQuestions(
  apiKey: string,
  questionPaperImages: string[]
): Promise<{ questions: { number: string; text: string; maxMarks: number }[] }> {
  const groq = createGroqClient(apiKey);

  const prompt = `Analyze this exam paper image. Extract ALL questions in order.
For sub-parts (e.g. 11(a), 11(b), 5(a)), list each sub-part as a separate item.
Number format: "1", "2", "3", "4", "5(a)", "11(a)", etc.

Return ONLY JSON:
{
  "questions": [
    {
      "number": "1",
      "text": "Question text here",
      "maxMarks": 2
    }
  ]
}`;

  const content = await executeVisionCompletion(groq, prompt, questionPaperImages);

  try {
    const parsed = JSON.parse(content);
    return { questions: parsed.questions || parsed.data || [] };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { questions: parsed.questions || parsed.data || [] };
    }
    throw new Error('Failed to parse questions from AI response');
  }
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

export async function extractAnswersAndGrade(
  apiKey: string,
  answerSheetImages: string[],
  questions: { number: string; text: string; maxMarks: number }[]
): Promise<{ evaluations: EvaluationItem[] }> {
  const groq = createGroqClient(apiKey);

  const questionsList = questions.map(q => 
    `Q${q.number}: "${q.text}" [${q.maxMarks}]`
  ).join('\n');

  const prompt = `Grade this handwritten answer sheet.

QUESTIONS:
${questionsList}

RULES:
- Status: "correct" (score=maxScore), "partially_correct" (0<score<maxScore), "incorrect" (score=0), "unattempted" (score=0, isAnswered=false)
- BoundingBox: percentages 0-100 relative to page. pageNumber is 0-indexed. Tightly enclose ONLY this answer, no overlap with other answers.
- Multi-page answers: use boundingBoxes array with page field.
- Unattempted: boundingBoxes=[], boundingBox={x:0,y:0,width:0,height:0}

Return JSON:
{"evaluations":[{"questionNumber":"1","isAnswered":true,"status":"correct","score":2,"maxScore":2,"feedback":"...","answerText":"...","pageNumber":0,"boundingBox":{"x":5,"y":10,"width":90,"height":12},"boundingBoxes":[{"page":0,"x":5,"y":10,"width":90,"height":12}]}]}`;

  const content = await executeVisionCompletion(groq, prompt, answerSheetImages);

  try {
    const parsed = JSON.parse(content);
    const evals = parsed.evaluations || parsed.answers || parsed.data || [];
    return { evaluations: evals };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const evals = parsed.evaluations || parsed.answers || parsed.data || [];
      return { evaluations: evals };
    }
    throw new Error('Failed to parse evaluations from AI response');
  }
}
