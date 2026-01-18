// AI Interview Engine - Manages interview flow and AI responses

import { logger } from '../../utils/logger.js';
import { getTTSClient, TTSVoice } from './ttsClient.js';
import { getWhisperClient } from './whisperClient.js';

interface Question {
  id: string;
  text: string;
  followUps: string[];
  evaluationCriteria?: string;
  timeAllocation: number;
  isRequired: boolean;
  categoryName: string;
}

interface InterviewConfig {
  candidateName: string;
  jobRoleTitle: string;
  companyName: string;
  mode: 'AI_ONLY' | 'HYBRID';
  voice: TTSVoice;
  questions: Question[];
  maxDurationMins: number;
}

interface InterviewState {
  status: 'NOT_STARTED' | 'INTRO' | 'QUESTIONING' | 'FOLLOW_UP' | 'CLOSING' | 'COMPLETED';
  currentQuestionIndex: number;
  currentFollowUpIndex: number;
  questionsAsked: string[];
  transcript: Array<{ speaker: 'ai' | 'candidate'; text: string; timestamp: Date; questionId?: string }>;
  startTime?: Date;
  lastActivityTime: Date;
}

type InterviewEventType =
  | 'ai_speaking'
  | 'ai_listening'
  | 'ai_thinking'
  | 'question_started'
  | 'question_completed'
  | 'interview_started'
  | 'interview_completed'
  | 'transcript_update'
  | 'error';

interface InterviewEvent {
  type: InterviewEventType;
  data?: unknown;
}

type EventCallback = (event: InterviewEvent) => void;

export class InterviewEngine {
  private config: InterviewConfig;
  private state: InterviewState;
  private ttsClient = getTTSClient();
  private whisperClient = getWhisperClient();
  private eventCallbacks: EventCallback[] = [];
  private audioBuffer: Buffer[] = [];
  private processingAudio = false;
  private openaiApiKey: string;

  constructor(config: InterviewConfig) {
    this.config = config;
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.state = {
      status: 'NOT_STARTED',
      currentQuestionIndex: 0,
      currentFollowUpIndex: 0,
      questionsAsked: [],
      transcript: [],
      lastActivityTime: new Date(),
    };
  }

  /**
   * Subscribe to interview events
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  private emit(event: InterviewEvent): void {
    this.eventCallbacks.forEach(cb => {
      try {
        cb(event);
      } catch (err) {
        logger.error({ err }, 'Error in event callback');
      }
    });
  }

  /**
   * Start the interview
   */
  async start(): Promise<void> {
    logger.info({ candidateName: this.config.candidateName }, 'Starting interview');

    this.state.status = 'INTRO';
    this.state.startTime = new Date();
    this.emit({ type: 'interview_started' });

    // Generate and speak introduction
    const introText = this.generateIntroduction();
    await this.speak(introText);

    // Transition to questioning
    this.state.status = 'QUESTIONING';
    await this.askCurrentQuestion();
  }

  /**
   * Process incoming audio from candidate
   */
  async processAudio(audioChunk: Buffer): Promise<void> {
    this.audioBuffer.push(audioChunk);
    this.state.lastActivityTime = new Date();

    // Process in 5-second chunks
    const totalSize = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);

    // Roughly 5 seconds of audio at typical webm bitrate
    if (totalSize > 80000 && !this.processingAudio) {
      await this.processAudioBuffer();
    }
  }

  /**
   * Force process any remaining audio
   */
  async flushAudio(): Promise<void> {
    if (this.audioBuffer.length > 0 && !this.processingAudio) {
      await this.processAudioBuffer();
    }
  }

  private async processAudioBuffer(): Promise<void> {
    if (this.audioBuffer.length === 0) return;

    this.processingAudio = true;
    const audioData = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];

    try {
      this.emit({ type: 'ai_thinking' });

      const result = await this.whisperClient.transcribe(audioData, {
        language: 'en',
        prompt: `Interview for ${this.config.jobRoleTitle} position. Candidate: ${this.config.candidateName}`,
      });

      if (result.text && result.text.trim().length > 0) {
        const currentQuestion = this.getCurrentQuestion();

        this.state.transcript.push({
          speaker: 'candidate',
          text: result.text,
          timestamp: new Date(),
          questionId: currentQuestion?.id,
        });

        this.emit({
          type: 'transcript_update',
          data: {
            speaker: 'candidate',
            text: result.text,
            questionId: currentQuestion?.id,
          },
        });

        // In AI_ONLY mode, analyze response and decide next action
        if (this.config.mode === 'AI_ONLY') {
          await this.analyzeResponseAndContinue(result.text);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error processing audio');
      this.emit({ type: 'error', data: { message: 'Failed to process audio' } });
    } finally {
      this.processingAudio = false;
    }
  }

  /**
   * Analyze candidate response and decide next action (AI_ONLY mode)
   */
  private async analyzeResponseAndContinue(response: string): Promise<void> {
    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) {
      await this.endInterview();
      return;
    }

    // Check if we should ask a follow-up or move to next question
    const shouldFollowUp = await this.shouldAskFollowUp(response, currentQuestion);

    if (shouldFollowUp && this.state.currentFollowUpIndex < currentQuestion.followUps.length) {
      // Ask follow-up
      const followUp = currentQuestion.followUps[this.state.currentFollowUpIndex];
      this.state.currentFollowUpIndex++;
      await this.speak(followUp);
    } else {
      // Move to next question
      this.state.currentQuestionIndex++;
      this.state.currentFollowUpIndex = 0;

      if (this.state.currentQuestionIndex >= this.config.questions.length) {
        await this.endInterview();
      } else {
        await this.askCurrentQuestion();
      }
    }
  }

  /**
   * Determine if we should ask a follow-up question
   */
  private async shouldAskFollowUp(response: string, question: Question): Promise<boolean> {
    // Simple heuristic: ask follow-up if response is short
    if (response.split(' ').length < 20) {
      return true;
    }

    // Use GPT to decide if follow-up is needed
    try {
      const result = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an interview assistant. Decide if a follow-up question is needed.
                        Question: "${question.text}"
                        Evaluation criteria: "${question.evaluationCriteria || 'General assessment'}"
                        Respond with only "yes" or "no".`,
            },
            {
              role: 'user',
              content: `Candidate's response: "${response}"`,
            },
          ],
          max_tokens: 10,
          temperature: 0.3,
        }),
      });

      const data = await result.json();
      const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim();
      return answer === 'yes';
    } catch {
      // Default to no follow-up on error
      return false;
    }
  }

  /**
   * Ask the current question
   */
  private async askCurrentQuestion(): Promise<void> {
    const question = this.getCurrentQuestion();
    if (!question) return;

    this.emit({
      type: 'question_started',
      data: { questionId: question.id, questionText: question.text },
    });

    this.state.questionsAsked.push(question.id);
    await this.speak(question.text);

    this.emit({ type: 'ai_listening' });
  }

  /**
   * Generate and speak text
   */
  async speak(text: string): Promise<Buffer> {
    this.emit({ type: 'ai_speaking', data: { text } });

    this.state.transcript.push({
      speaker: 'ai',
      text,
      timestamp: new Date(),
      questionId: this.getCurrentQuestion()?.id,
    });

    this.emit({
      type: 'transcript_update',
      data: { speaker: 'ai', text },
    });

    const audioBuffer = await this.ttsClient.synthesize(text, {
      voice: this.config.voice,
    });

    return audioBuffer;
  }

  /**
   * End the interview
   */
  async endInterview(): Promise<void> {
    this.state.status = 'CLOSING';

    const closingText = this.generateClosing();
    await this.speak(closingText);

    this.state.status = 'COMPLETED';

    this.emit({
      type: 'interview_completed',
      data: {
        transcript: this.state.transcript,
        questionsAsked: this.state.questionsAsked,
        duration: this.state.startTime
          ? Math.round((Date.now() - this.state.startTime.getTime()) / 1000 / 60)
          : 0,
      },
    });

    logger.info(
      {
        candidateName: this.config.candidateName,
        questionsAsked: this.state.questionsAsked.length,
      },
      'Interview completed'
    );
  }

  /**
   * Get current question
   */
  getCurrentQuestion(): Question | null {
    if (this.state.currentQuestionIndex >= this.config.questions.length) {
      return null;
    }
    return this.config.questions[this.state.currentQuestionIndex];
  }

  /**
   * Get interview state
   */
  getState(): InterviewState {
    return { ...this.state };
  }

  /**
   * Get full transcript
   */
  getTranscript(): InterviewState['transcript'] {
    return [...this.state.transcript];
  }

  /**
   * Skip to next question (for HYBRID mode manager control)
   */
  async skipToNextQuestion(): Promise<void> {
    this.state.currentQuestionIndex++;
    this.state.currentFollowUpIndex = 0;

    if (this.state.currentQuestionIndex >= this.config.questions.length) {
      await this.endInterview();
    } else {
      await this.askCurrentQuestion();
    }
  }

  /**
   * Ask a specific follow-up (for HYBRID mode)
   */
  async askFollowUp(followUpText: string): Promise<Buffer> {
    return this.speak(followUpText);
  }

  /**
   * Generate introduction text
   */
  private generateIntroduction(): string {
    return `Hello ${this.config.candidateName}! Welcome to your interview for the ${this.config.jobRoleTitle} position at ${this.config.companyName}.

I'm an AI interview assistant, and I'll be guiding you through some questions today. Please take your time to answer each question thoroughly.

We have ${this.config.questions.length} questions prepared, and the interview should take about ${this.config.maxDurationMins} minutes.

Let's get started with the first question.`;
  }

  /**
   * Generate closing text
   */
  private generateClosing(): string {
    return `Thank you so much for your time today, ${this.config.candidateName}.

You've completed all the questions in this interview. Our team will review your responses and be in touch soon regarding next steps.

Do you have any questions about the role or the company before we wrap up? If not, thank you again and have a great day!`;
  }
}

/**
 * Create a new interview engine instance
 */
export function createInterviewEngine(config: InterviewConfig): InterviewEngine {
  return new InterviewEngine(config);
}
