import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { Scorecard, Recommendation } from '../../types/index.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export interface InterviewAnalysis {
  summary: string;
  keyPoints: string[];
  strengths: string[];
  weaknesses: string[];
  notableQuotes: string[];
  overallScore: number;
  recommendation: Recommendation;
  scorecard: Scorecard;
}

export interface TranscriptSegment {
  speaker: 'candidate' | 'ai' | 'manager';
  text: string;
  timestamp?: Date;
  questionId?: string;
}

export interface JobRoleContext {
  title: string;
  description?: string;
  categories: {
    name: string;
    questions: {
      id: string;
      text: string;
      evaluationCriteria?: string;
    }[];
  }[];
}

/**
 * Generate a comprehensive interview summary using GPT-4
 */
export async function generateInterviewSummary(
  candidateName: string,
  jobRole: JobRoleContext,
  transcript: TranscriptSegment[]
): Promise<InterviewAnalysis> {
  // Format transcript for GPT
  const formattedTranscript = transcript
    .map((seg) => `[${seg.speaker.toUpperCase()}]: ${seg.text}`)
    .join('\n\n');

  // Build category/question context
  const questionContext = jobRole.categories
    .map((cat) => {
      const questions = cat.questions.map((q) => `  - ${q.text}`).join('\n');
      return `${cat.name}:\n${questions}`;
    })
    .join('\n\n');

  const systemPrompt = `You are an expert interview analyst for a recruiting platform.
Your task is to analyze interview transcripts and provide comprehensive, actionable insights.

Job Role: ${jobRole.title}
${jobRole.description ? `Description: ${jobRole.description}` : ''}

Interview Questions by Category:
${questionContext}

Analyze the interview and provide:
1. A concise summary (2-3 paragraphs)
2. Key points from the interview (3-5 bullets)
3. Candidate strengths (3-5 bullets)
4. Areas for improvement (2-4 bullets)
5. Notable quotes that demonstrate skills or concerns
6. Overall score (1-5, where 5 is exceptional)
7. Hiring recommendation (STRONG_YES, YES, MAYBE, NO, STRONG_NO)
8. Detailed scorecard by category

Be objective, specific, and evidence-based in your analysis.`;

  const userPrompt = `Candidate: ${candidateName}

Interview Transcript:
${formattedTranscript}

Please analyze this interview and respond in the following JSON format:
{
  "summary": "string - 2-3 paragraph summary",
  "keyPoints": ["string array of 3-5 key points"],
  "strengths": ["string array of candidate strengths"],
  "weaknesses": ["string array of areas for improvement"],
  "notableQuotes": ["string array of notable candidate quotes"],
  "overallScore": number (1-5),
  "recommendation": "STRONG_YES" | "YES" | "MAYBE" | "NO" | "STRONG_NO",
  "scorecard": {
    "categories": {
      "CategoryName": {
        "score": number (1-5),
        "notes": "string",
        "questions": [
          {
            "questionId": "string or null",
            "questionText": "string",
            "response": "string summary of candidate's response",
            "score": number (1-5),
            "notes": "string"
          }
        ]
      }
    },
    "overallScore": number (1-5),
    "strengths": ["string array"],
    "weaknesses": ["string array"],
    "recommendation": "STRONG_YES" | "YES" | "MAYBE" | "NO" | "STRONG_NO"
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4');
    }

    const analysis = JSON.parse(content) as InterviewAnalysis;

    // Validate and normalize the response
    return {
      summary: analysis.summary || 'Summary not available.',
      keyPoints: analysis.keyPoints || [],
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      notableQuotes: analysis.notableQuotes || [],
      overallScore: Math.min(5, Math.max(1, Math.round(analysis.overallScore || 3))),
      recommendation: validateRecommendation(analysis.recommendation),
      scorecard: analysis.scorecard || createDefaultScorecard(),
    };
  } catch (error) {
    console.error('Error generating interview summary:', error);
    throw error;
  }
}

/**
 * Generate quick insights for an in-progress interview
 */
export async function generateQuickInsights(
  transcript: TranscriptSegment[],
  currentQuestion?: string
): Promise<{ suggestions: string[]; redFlags: string[]; followUps: string[] }> {
  const recentTranscript = transcript.slice(-10); // Last 10 segments
  const formattedTranscript = recentTranscript
    .map((seg) => `[${seg.speaker.toUpperCase()}]: ${seg.text}`)
    .join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use faster model for real-time suggestions
      messages: [
        {
          role: 'system',
          content: `You are an interview coach providing real-time insights.
Be concise and actionable. Respond in JSON format.`,
        },
        {
          role: 'user',
          content: `Recent interview exchange:
${formattedTranscript}

${currentQuestion ? `Current question being discussed: ${currentQuestion}` : ''}

Provide brief insights in this JSON format:
{
  "suggestions": ["1-2 word suggestions for the interviewer"],
  "redFlags": ["any concerns about the candidate's responses"],
  "followUps": ["suggested follow-up questions based on responses"]
}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { suggestions: [], redFlags: [], followUps: [] };
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Error generating quick insights:', error);
    return { suggestions: [], redFlags: [], followUps: [] };
  }
}

/**
 * Generate comparison between multiple candidates
 */
export async function compareCandidates(
  candidates: Array<{
    name: string;
    summary: string;
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
  }>,
  jobRole: string
): Promise<{
  ranking: Array<{ name: string; rank: number; reason: string }>;
  comparison: string;
}> {
  const candidateData = candidates
    .map(
      (c, i) => `
Candidate ${i + 1}: ${c.name}
Score: ${c.overallScore}/5
Summary: ${c.summary}
Strengths: ${c.strengths.join(', ')}
Weaknesses: ${c.weaknesses.join(', ')}
`
    )
    .join('\n---\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a recruiting analyst comparing candidates for a ${jobRole} position.
Provide objective, evidence-based comparison.`,
        },
        {
          role: 'user',
          content: `Compare these candidates:
${candidateData}

Respond in JSON format:
{
  "ranking": [
    { "name": "string", "rank": number, "reason": "string explaining ranking" }
  ],
  "comparison": "string - 2-3 paragraph comparative analysis"
}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4');
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Error comparing candidates:', error);
    throw error;
  }
}

// Helper functions
function validateRecommendation(rec: string): Recommendation {
  const valid: Recommendation[] = ['STRONG_YES', 'YES', 'MAYBE', 'NO', 'STRONG_NO'];
  const upper = (rec || 'MAYBE').toUpperCase() as Recommendation;
  return valid.includes(upper) ? upper : 'MAYBE';
}

function createDefaultScorecard(): Scorecard {
  return {
    categories: {},
    overallScore: 3,
    strengths: [],
    weaknesses: [],
    recommendation: 'MAYBE',
  };
}
