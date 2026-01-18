// Interview WebSocket Handler - Real-time interview communication

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { createInterviewEngine, InterviewEngine } from '../services/ai/interviewEngine.js';
import { TTSVoice } from '../services/ai/ttsClient.js';

// Message types from client
interface ClientMessage {
  type: 'audio_chunk' | 'candidate_ready' | 'end_interview' | 'manager_command';
  data?: string; // base64 audio data or command data
  command?: string; // For manager commands
}

// Message types to client
interface ServerMessage {
  type:
    | 'ai_speaking'
    | 'ai_listening'
    | 'ai_thinking'
    | 'transcript_update'
    | 'interview_started'
    | 'interview_completed'
    | 'question_started'
    | 'question_completed'
    | 'error'
    | 'session_ready'
    | 'audio';
  data?: unknown;
  audio?: string; // base64 audio data
}

// Active interview sessions
const activeSessions = new Map<string, {
  ws: WebSocket;
  engine: InterviewEngine;
  sessionId: string;
  interviewId: string;
  role: 'candidate' | 'manager';
}>();

// Manager connections watching a session
const managerConnections = new Map<string, Set<WebSocket>>();

/**
 * Handle new WebSocket connection for interview
 */
export async function handleInterviewConnection(
  ws: WebSocket,
  request: IncomingMessage,
  token: string,
  role: 'candidate' | 'manager'
): Promise<void> {
  logger.info({ token, role }, 'New interview WebSocket connection');

  try {
    // Validate token and get session
    const session = await prisma.interviewSession.findUnique({
      where: { interviewToken: token },
      include: {
        interview: {
          include: {
            jobRole: {
              include: {
                categories: {
                  orderBy: { order: 'asc' },
                  include: {
                    questions: {
                      where: { isActive: true },
                      orderBy: { order: 'asc' },
                    },
                  },
                },
              },
            },
            company: true,
          },
        },
      },
    });

    if (!session) {
      sendError(ws, 'Invalid interview token');
      ws.close();
      return;
    }

    // Check if token is expired
    if (session.tokenExpiresAt && new Date() > session.tokenExpiresAt) {
      sendError(ws, 'Interview link has expired');
      ws.close();
      return;
    }

    // Check if interview is already completed
    if (session.webSessionState === 'COMPLETED') {
      sendError(ws, 'This interview has already been completed');
      ws.close();
      return;
    }

    const interview = session.interview;
    const sessionId = session.id;

    // Flatten questions from categories
    const questions = interview.jobRole.categories.flatMap(cat =>
      cat.questions.map(q => ({
        id: q.id,
        text: q.text,
        followUps: JSON.parse(q.followUps) as string[],
        evaluationCriteria: q.evaluationCriteria || undefined,
        timeAllocation: q.timeAllocation,
        isRequired: q.isRequired,
        categoryName: cat.name,
      }))
    );

    // Get app config for voice
    const appConfig = await prisma.appConfig.findFirst();
    const voice = (appConfig?.selectedVoice || 'alloy') as TTSVoice;

    if (role === 'candidate') {
      // Create interview engine for candidate
      const engine = createInterviewEngine({
        candidateName: interview.candidateName,
        jobRoleTitle: interview.jobRole.title,
        companyName: interview.company.name,
        mode: interview.mode as 'AI_ONLY' | 'HYBRID',
        voice,
        questions,
        maxDurationMins: interview.duration,
      });

      // Store session
      activeSessions.set(token, {
        ws,
        engine,
        sessionId,
        interviewId: interview.id,
        role: 'candidate',
      });

      // Subscribe to engine events
      engine.onEvent(async (event) => {
        // Send to candidate
        if (event.type === 'ai_speaking') {
          const eventData = event.data as { text: string };
          // Generate audio and send
          try {
            const audioBuffer = await engine.speak(eventData.text);
            sendMessage(ws, {
              type: 'audio',
              audio: audioBuffer.toString('base64'),
              data: { text: eventData.text },
            });
          } catch (err) {
            logger.error({ err }, 'Error generating TTS');
          }
        } else {
          sendMessage(ws, { type: event.type, data: event.data });
        }

        // Forward to managers
        const managers = managerConnections.get(token);
        if (managers) {
          managers.forEach(managerWs => {
            if (managerWs.readyState === WebSocket.OPEN) {
              sendMessage(managerWs, { type: event.type, data: event.data });
            }
          });
        }

        // Save transcript segments to database
        if (event.type === 'transcript_update') {
          const data = event.data as { speaker: string; text: string; questionId?: string };
          await prisma.transcriptSegment.create({
            data: {
              sessionId,
              speaker: data.speaker,
              text: data.text,
              questionId: data.questionId,
            },
          });
        }

        // Update session state on completion
        if (event.type === 'interview_completed') {
          await prisma.interviewSession.update({
            where: { id: sessionId },
            data: {
              webSessionState: 'COMPLETED',
              endedAt: new Date(),
            },
          });

          await prisma.interview.update({
            where: { id: interview.id },
            data: { status: 'COMPLETED' },
          });

          // Compile full transcript
          const fullTranscript = engine.getTranscript()
            .map(t => `${t.speaker.toUpperCase()}: ${t.text}`)
            .join('\n\n');

          await prisma.interviewResult.upsert({
            where: { interviewId: interview.id },
            create: {
              interviewId: interview.id,
              transcript: fullTranscript,
            },
            update: {
              transcript: fullTranscript,
            },
          });
        }
      });

      // Send ready message
      sendMessage(ws, {
        type: 'session_ready',
        data: {
          candidateName: interview.candidateName,
          jobRole: interview.jobRole.title,
          company: interview.company.name,
          mode: interview.mode,
          questionCount: questions.length,
          duration: interview.duration,
        },
      });

      // Handle messages from candidate
      ws.on('message', async (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          await handleCandidateMessage(token, message);
        } catch (err) {
          logger.error({ err }, 'Error handling candidate message');
          sendError(ws, 'Invalid message format');
        }
      });

    } else {
      // Manager connection - just observe
      if (!managerConnections.has(token)) {
        managerConnections.set(token, new Set());
      }
      managerConnections.get(token)!.add(ws);

      // Send current state
      const activeSession = activeSessions.get(token);
      if (activeSession) {
        sendMessage(ws, {
          type: 'session_ready',
          data: {
            candidateName: interview.candidateName,
            jobRole: interview.jobRole.title,
            company: interview.company.name,
            mode: interview.mode,
            state: activeSession.engine.getState(),
            transcript: activeSession.engine.getTranscript(),
          },
        });
      }

      // Handle manager commands
      ws.on('message', async (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          if (message.type === 'manager_command') {
            await handleManagerCommand(token, message.command!);
          }
        } catch (err) {
          logger.error({ err }, 'Error handling manager message');
        }
      });
    }

    // Handle disconnect
    ws.on('close', () => {
      logger.info({ token, role }, 'Interview WebSocket disconnected');

      if (role === 'candidate') {
        // Don't remove immediately - allow reconnection
        setTimeout(() => {
          const session = activeSessions.get(token);
          if (session && session.ws === ws) {
            activeSessions.delete(token);
          }
        }, 60000); // 1 minute grace period
      } else {
        const managers = managerConnections.get(token);
        if (managers) {
          managers.delete(ws);
          if (managers.size === 0) {
            managerConnections.delete(token);
          }
        }
      }
    });

    ws.on('error', (err) => {
      logger.error({ err, token }, 'WebSocket error');
    });

  } catch (err) {
    logger.error({ err }, 'Error setting up interview connection');
    sendError(ws, 'Failed to initialize interview session');
    ws.close();
  }
}

/**
 * Handle messages from candidate
 */
async function handleCandidateMessage(token: string, message: ClientMessage): Promise<void> {
  const session = activeSessions.get(token);
  if (!session) return;

  switch (message.type) {
    case 'candidate_ready':
      // Start the interview
      await prisma.interviewSession.update({
        where: { id: session.sessionId },
        data: {
          webSessionState: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      await prisma.interview.update({
        where: { id: session.interviewId },
        data: { status: 'IN_PROGRESS' },
      });

      await session.engine.start();
      break;

    case 'audio_chunk':
      if (message.data) {
        const audioBuffer = Buffer.from(message.data, 'base64');
        await session.engine.processAudio(audioBuffer);
      }
      break;

    case 'end_interview':
      await session.engine.flushAudio();
      await session.engine.endInterview();
      break;
  }
}

/**
 * Handle commands from manager (hybrid mode)
 */
async function handleManagerCommand(token: string, command: string): Promise<void> {
  const session = activeSessions.get(token);
  if (!session) return;

  switch (command) {
    case 'next_question':
      await session.engine.skipToNextQuestion();
      break;

    case 'end_interview':
      await session.engine.endInterview();
      break;
  }
}

/**
 * Send message to WebSocket
 */
function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send error message
 */
function sendError(ws: WebSocket, message: string): void {
  sendMessage(ws, { type: 'error', data: { message } });
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}
