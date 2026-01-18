// Boomer AI Voice WebSocket Handler
// Handles real-time voice communication with the AI assistant

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../utils/logger.js';
import { BoomerAIEngine, createBoomerEngine } from './boomerAIEngine.js';
import { TTSVoice } from '../services/ai/ttsClient.js';

// Message types from client
interface ClientMessage {
  type: 'init' | 'audio' | 'text' | 'start_listening' | 'stop_listening' | 'set_voice';
  audio?: string; // base64 audio data
  text?: string;
  voice?: TTSVoice;
}

// Message types to client
interface ServerMessage {
  type:
    | 'ready'
    | 'audio'
    | 'assistant_transcript'
    | 'user_transcript'
    | 'action_result'
    | 'error';
  audio?: string;
  text?: string;
  success?: boolean;
  action?: string;
  data?: unknown;
  message?: string;
}

// Active voice sessions
const activeSessions = new Map<WebSocket, {
  engine: BoomerAIEngine;
  isListening: boolean;
}>();

/**
 * Handle new WebSocket connection for voice assistant
 */
export async function handleVoiceConnection(
  ws: WebSocket,
  request: IncomingMessage
): Promise<void> {
  logger.info('New Boomer AI voice WebSocket connection');

  try {
    // Create AI engine for this session
    const engine = createBoomerEngine({
      voice: 'alloy',
      userName: 'Friend', // TODO: Get from user session
    });

    // Store session
    activeSessions.set(ws, {
      engine,
      isListening: false,
    });

    // Subscribe to engine events
    engine.onEvent(async (event) => {
      switch (event.type) {
        case 'speaking':
          // TTS audio ready - send to client
          if (event.audio) {
            sendMessage(ws, {
              type: 'audio',
              audio: event.audio.toString('base64'),
            });
          }
          if (event.text) {
            sendMessage(ws, {
              type: 'assistant_transcript',
              text: event.text,
            });
          }
          break;

        case 'action_completed':
          sendMessage(ws, {
            type: 'action_result',
            success: true,
            action: event.action,
            data: event.data,
          });
          break;

        case 'error':
          sendMessage(ws, {
            type: 'error',
            message: event.message || 'An error occurred',
          });
          break;
      }
    });

    // Handle messages from client
    ws.on('message', async (data: Buffer) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        await handleClientMessage(ws, message);
      } catch (err) {
        logger.error({ err }, 'Error handling client message');
        sendMessage(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      logger.info('Boomer AI voice WebSocket disconnected');
      const session = activeSessions.get(ws);
      if (session) {
        session.engine.cleanup();
        activeSessions.delete(ws);
      }
    });

    ws.on('error', (err) => {
      logger.error({ err }, 'WebSocket error');
    });

    // Send ready message
    sendMessage(ws, { type: 'ready' });

  } catch (err) {
    logger.error({ err }, 'Error setting up voice connection');
    sendMessage(ws, { type: 'error', message: 'Failed to initialize voice session' });
    ws.close();
  }
}

/**
 * Handle messages from client
 */
async function handleClientMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
  const session = activeSessions.get(ws);
  if (!session) return;

  switch (message.type) {
    case 'init':
      // Initialize with voice preference
      if (message.voice) {
        session.engine.setVoice(message.voice);
      }
      // Send greeting
      await session.engine.greet();
      break;

    case 'set_voice':
      if (message.voice) {
        session.engine.setVoice(message.voice);
      }
      break;

    case 'start_listening':
      session.isListening = true;
      break;

    case 'stop_listening':
      session.isListening = false;
      // Process accumulated audio
      await session.engine.flushAudio();
      break;

    case 'audio':
      if (message.audio && session.isListening) {
        const audioBuffer = Buffer.from(message.audio, 'base64');
        await session.engine.processAudio(audioBuffer);
      }
      break;

    case 'text':
      if (message.text) {
        // Show user's text in transcript
        sendMessage(ws, {
          type: 'user_transcript',
          text: message.text,
        });
        // Process text command
        await session.engine.processText(message.text);
      }
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
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}
