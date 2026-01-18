// Boomer AI Engine - Intent Recognition and Action Execution
// Handles voice commands for calendar, medications, contacts, and notes

import { logger } from '../utils/logger.js';
import { getTTSClient, TTSVoice } from '../services/ai/ttsClient.js';
import { getWhisperClient } from '../services/ai/whisperClient.js';
import { prisma } from '../db/prisma.js';

interface BoomerConfig {
  voice: TTSVoice;
  userName: string;
  userId?: string;
}

type EventType = 'speaking' | 'action_completed' | 'error';

interface BoomerEvent {
  type: EventType;
  text?: string;
  audio?: Buffer;
  action?: string;
  data?: unknown;
  message?: string;
}

type EventCallback = (event: BoomerEvent) => void;

// Intent types recognized by the AI
type IntentType =
  | 'schedule_query'
  | 'schedule_add'
  | 'schedule_cancel'
  | 'medication_query'
  | 'medication_taken'
  | 'medication_add'
  | 'contact_query'
  | 'contact_call'
  | 'contact_add'
  | 'note_query'
  | 'note_add'
  | 'note_read_pinned'
  | 'greeting'
  | 'help'
  | 'unknown';

interface ParsedIntent {
  intent: IntentType;
  entities: Record<string, string>;
  confidence: number;
}

export class BoomerAIEngine {
  private config: BoomerConfig;
  private ttsClient = getTTSClient();
  private whisperClient = getWhisperClient();
  private eventCallbacks: EventCallback[] = [];
  private audioBuffer: Buffer[] = [];
  private processingAudio = false;
  private openaiApiKey: string;

  constructor(config: BoomerConfig) {
    this.config = config;
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
  }

  /**
   * Subscribe to engine events
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  private emit(event: BoomerEvent): void {
    this.eventCallbacks.forEach(cb => {
      try {
        cb(event);
      } catch (err) {
        logger.error({ err }, 'Error in event callback');
      }
    });
  }

  /**
   * Set TTS voice
   */
  setVoice(voice: TTSVoice): void {
    this.config.voice = voice;
  }

  /**
   * Send greeting message
   */
  async greet(): Promise<void> {
    const hour = new Date().getHours();
    let greeting = 'Hello';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    else greeting = 'Good evening';

    const text = `${greeting}, ${this.config.userName}! I'm your Boomer AI assistant. How can I help you today?`;
    await this.speak(text);
  }

  /**
   * Process incoming audio chunk
   */
  async processAudio(audioChunk: Buffer): Promise<void> {
    this.audioBuffer.push(audioChunk);
  }

  /**
   * Process accumulated audio buffer
   */
  async flushAudio(): Promise<void> {
    if (this.audioBuffer.length === 0 || this.processingAudio) return;

    this.processingAudio = true;
    const audioData = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];

    try {
      // Skip if audio is too short (less than ~0.5 seconds)
      if (audioData.length < 12000) {
        this.processingAudio = false;
        return;
      }

      const result = await this.whisperClient.transcribe(audioData, {
        language: 'en',
        prompt: 'Boomer AI voice assistant for calendar, medications, contacts, and notes.',
      });

      if (result.text && result.text.trim().length > 0) {
        logger.info({ text: result.text }, 'User said');
        await this.processText(result.text);
      }
    } catch (error) {
      logger.error({ error }, 'Error processing audio');
      this.emit({ type: 'error', message: 'I had trouble hearing that. Could you try again?' });
    } finally {
      this.processingAudio = false;
    }
  }

  /**
   * Process text input (from voice or typed)
   */
  async processText(text: string): Promise<void> {
    try {
      // Parse intent using GPT
      const intent = await this.parseIntent(text);
      logger.info({ intent }, 'Parsed intent');

      // Execute action based on intent
      await this.executeIntent(intent, text);
    } catch (error) {
      logger.error({ error }, 'Error processing text');
      await this.speak("I'm sorry, I had trouble understanding that. Could you try saying it differently?");
    }
  }

  /**
   * Parse user intent using GPT
   */
  private async parseIntent(text: string): Promise<ParsedIntent> {
    const systemPrompt = `You are an intent parser for a voice assistant for older adults. Parse the user's request and return JSON.

Intents:
- schedule_query: Asking about schedule/appointments (e.g., "What's on my schedule?", "Do I have any appointments tomorrow?")
- schedule_add: Adding an appointment (e.g., "Add a doctor appointment on Friday at 3pm")
- schedule_cancel: Canceling an appointment (e.g., "Cancel my car inspection")
- medication_query: Asking about medications (e.g., "Did I take my meds?", "What medications do I take?")
- medication_taken: Marking medication as taken (e.g., "Mark my morning meds as taken")
- medication_add: Adding a medication (e.g., "Add Lisinopril 10mg every day at 8am")
- contact_query: Looking up contact info (e.g., "What's my daughter's phone number?", "How do I reach Dr. Smith?")
- contact_call: Wanting to call someone (e.g., "Call my son", "I need to call the pharmacy")
- contact_add: Adding a contact (e.g., "Add contact Mike the plumber, 555-1234")
- note_query: Finding a note (e.g., "Find my note about the garage code", "What was that note about...")
- note_add: Creating a note (e.g., "Take a note: the garage code is 4182")
- note_read_pinned: Reading pinned notes (e.g., "Read my pinned notes", "What are my important notes?")
- greeting: Simple greeting (e.g., "Hello", "Hi there")
- help: Asking for help (e.g., "What can you do?", "Help")
- unknown: Can't determine intent

Extract entities when relevant:
- date/time for appointments
- medication names, dosages, times
- contact names, relationships, phone numbers
- note content, search terms

Respond with JSON only:
{"intent": "intent_type", "entities": {"key": "value"}, "confidence": 0.0-1.0}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          max_tokens: 200,
          temperature: 0.3,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.error({ error }, 'Error parsing intent');
    }

    return { intent: 'unknown', entities: {}, confidence: 0 };
  }

  /**
   * Execute action based on parsed intent
   */
  private async executeIntent(intent: ParsedIntent, originalText: string): Promise<void> {
    switch (intent.intent) {
      case 'greeting':
        await this.speak("Hello! How can I help you today?");
        break;

      case 'help':
        await this.speak("I can help you with your schedule, medications, contacts, and notes. Try saying things like: What's on my schedule today? Did I take my medications? What's my daughter's phone number? Or, take a note.");
        break;

      case 'schedule_query':
        await this.handleScheduleQuery(intent.entities);
        break;

      case 'schedule_add':
        await this.handleScheduleAdd(intent.entities, originalText);
        break;

      case 'medication_query':
        await this.handleMedicationQuery(intent.entities);
        break;

      case 'medication_taken':
        await this.handleMedicationTaken(intent.entities);
        break;

      case 'contact_query':
      case 'contact_call':
        await this.handleContactQuery(intent.entities);
        break;

      case 'note_query':
        await this.handleNoteQuery(intent.entities);
        break;

      case 'note_add':
        await this.handleNoteAdd(intent.entities, originalText);
        break;

      case 'note_read_pinned':
        await this.handlePinnedNotes();
        break;

      default:
        await this.handleUnknown(originalText);
        break;
    }
  }

  /**
   * Handle schedule queries
   */
  private async handleScheduleQuery(entities: Record<string, string>): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Determine date range based on entities
      let startDate = today;
      let endDate = tomorrow;
      let dateLabel = 'today';

      if (entities.date?.toLowerCase().includes('tomorrow')) {
        startDate = tomorrow;
        endDate = new Date(tomorrow);
        endDate.setDate(endDate.getDate() + 1);
        dateLabel = 'tomorrow';
      } else if (entities.date?.toLowerCase().includes('week')) {
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 7);
        dateLabel = 'this week';
      }

      const appointments = await prisma.appointment.findMany({
        where: {
          startAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        orderBy: { startAt: 'asc' },
      });

      if (appointments.length === 0) {
        await this.speak(`You don't have any appointments ${dateLabel}.`);
      } else if (appointments.length === 1) {
        const apt = appointments[0];
        const time = apt.startAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        await this.speak(`You have one appointment ${dateLabel}: ${apt.title} at ${time}${apt.location ? ` at ${apt.location}` : ''}.`);
      } else {
        let response = `You have ${appointments.length} appointments ${dateLabel}. `;
        appointments.slice(0, 3).forEach((apt, i) => {
          const time = apt.startAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          response += `${i + 1}: ${apt.title} at ${time}. `;
        });
        if (appointments.length > 3) {
          response += `And ${appointments.length - 3} more.`;
        }
        await this.speak(response);
      }

      this.emit({ type: 'action_completed', action: 'schedule_query', data: { appointments } });
    } catch (error) {
      logger.error({ error }, 'Error querying schedule');
      await this.speak("I had trouble checking your schedule. Please try again.");
    }
  }

  /**
   * Handle adding appointments
   */
  private async handleScheduleAdd(entities: Record<string, string>, originalText: string): Promise<void> {
    try {
      // Use GPT to extract appointment details
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: `Extract appointment details from the user's request. Today is ${new Date().toDateString()}. Return JSON:
{"title": "appointment title", "date": "YYYY-MM-DD", "time": "HH:MM", "location": "optional location", "category": "MEDICAL|PERSONAL|SOCIAL|HOME|FINANCIAL|OTHER"}`
            },
            { role: 'user', content: originalText },
          ],
          max_tokens: 150,
          temperature: 0.2,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const details = JSON.parse(jsonMatch[0]);

        if (details.title && details.date && details.time) {
          const startAt = new Date(`${details.date}T${details.time}:00`);
          const endAt = new Date(startAt);
          endAt.setHours(endAt.getHours() + 1); // Default 1 hour

          const appointment = await prisma.appointment.create({
            data: {
              title: details.title,
              startAt,
              endAt,
              location: details.location || null,
              category: details.category || 'OTHER',
              userId: this.config.userId || 'demo-user',
            },
          });

          const dateStr = startAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          const timeStr = startAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

          await this.speak(`Done! I've added ${details.title} on ${dateStr} at ${timeStr}.`);
          this.emit({ type: 'action_completed', action: 'schedule_add', data: { appointment } });
          return;
        }
      }

      await this.speak("I need more details to add that appointment. Please tell me the title, date, and time.");
    } catch (error) {
      logger.error({ error }, 'Error adding appointment');
      await this.speak("I had trouble adding that appointment. Please try again.");
    }
  }

  /**
   * Handle medication queries
   */
  private async handleMedicationQuery(entities: Record<string, string>): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get active medications with today's logs
      const medications = await prisma.medication.findMany({
        where: { isActive: true },
        include: {
          logs: {
            where: {
              scheduledAt: {
                gte: today,
                lt: tomorrow,
              },
            },
          },
        },
      });

      if (medications.length === 0) {
        await this.speak("You don't have any medications tracked.");
        return;
      }

      // Check if asking about taken status
      const askingAboutTaken = entities.query?.toLowerCase().includes('take') ||
                               entities.query?.toLowerCase().includes('taken');

      if (askingAboutTaken) {
        const taken = medications.filter(m => m.logs.some(l => l.status === 'TAKEN'));
        const pending = medications.filter(m => !m.logs.some(l => l.status === 'TAKEN'));

        if (pending.length === 0) {
          await this.speak("Great job! You've taken all your medications for today.");
        } else if (taken.length === 0) {
          await this.speak(`You haven't taken any medications yet today. You still need to take: ${pending.map(m => m.name).join(', ')}.`);
        } else {
          await this.speak(`You've taken ${taken.map(m => m.name).join(', ')}. You still need to take: ${pending.map(m => m.name).join(', ')}.`);
        }
      } else {
        // General medication list
        const medList = medications.map(m => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`).join(', ');
        await this.speak(`You're taking ${medications.length} medications: ${medList}.`);
      }

      this.emit({ type: 'action_completed', action: 'medication_query', data: { medications } });
    } catch (error) {
      logger.error({ error }, 'Error querying medications');
      await this.speak("I had trouble checking your medications. Please try again.");
    }
  }

  /**
   * Handle marking medication as taken
   */
  private async handleMedicationTaken(entities: Record<string, string>): Promise<void> {
    try {
      const medications = await prisma.medication.findMany({
        where: { isActive: true },
      });

      if (medications.length === 0) {
        await this.speak("You don't have any medications to mark.");
        return;
      }

      // Mark all active medications as taken for now
      // TODO: Be smarter about which specific medication to mark
      const now = new Date();

      for (const med of medications) {
        await prisma.medicationLog.create({
          data: {
            medicationId: med.id,
            status: 'TAKEN',
            scheduledAt: now,
            takenAt: now,
          },
        });
      }

      await this.speak("Done! I've marked your medications as taken.");
      this.emit({ type: 'action_completed', action: 'medication_taken', data: { count: medications.length } });
    } catch (error) {
      logger.error({ error }, 'Error marking medication');
      await this.speak("I had trouble marking your medications. Please try again.");
    }
  }

  /**
   * Handle contact queries
   */
  private async handleContactQuery(entities: Record<string, string>): Promise<void> {
    try {
      const searchTerm = entities.name || entities.relationship || '';

      const contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm } },
            { relationship: { contains: searchTerm.toUpperCase() } },
            { notes: { contains: searchTerm } },
          ],
        },
        take: 5,
      });

      if (contacts.length === 0) {
        await this.speak(`I couldn't find a contact matching "${searchTerm}". Would you like me to add them?`);
        return;
      }

      const contact = contacts[0];
      let response = `${contact.name}`;

      if (contact.phone) {
        response += `'s phone number is ${contact.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}`;
      }
      if (contact.email) {
        response += contact.phone ? `, and their email is ${contact.email}` : `'s email is ${contact.email}`;
      }
      response += '.';

      await this.speak(response);
      this.emit({ type: 'action_completed', action: 'contact_query', data: { contact } });
    } catch (error) {
      logger.error({ error }, 'Error querying contacts');
      await this.speak("I had trouble looking up that contact. Please try again.");
    }
  }

  /**
   * Handle note queries
   */
  private async handleNoteQuery(entities: Record<string, string>): Promise<void> {
    try {
      const searchTerm = entities.search || entities.topic || '';

      const notes = await prisma.note.findMany({
        where: {
          OR: [
            { title: { contains: searchTerm } },
            { body: { contains: searchTerm } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      });

      if (notes.length === 0) {
        await this.speak(`I couldn't find any notes about "${searchTerm}".`);
        return;
      }

      const note = notes[0];
      const response = note.title
        ? `I found a note called "${note.title}": ${note.body}`
        : `I found this note: ${note.body}`;

      await this.speak(response);
      this.emit({ type: 'action_completed', action: 'note_query', data: { note } });
    } catch (error) {
      logger.error({ error }, 'Error querying notes');
      await this.speak("I had trouble finding that note. Please try again.");
    }
  }

  /**
   * Handle adding notes
   */
  private async handleNoteAdd(entities: Record<string, string>, originalText: string): Promise<void> {
    try {
      // Extract note content - everything after "take a note" or similar
      let noteContent = originalText
        .replace(/^(take a note|note|write down|remember|save)/i, '')
        .replace(/^[:\s]+/, '')
        .trim();

      if (!noteContent) {
        await this.speak("What would you like me to note down?");
        return;
      }

      const note = await prisma.note.create({
        data: {
          body: noteContent,
          category: 'GENERAL',
          userId: this.config.userId || 'demo-user',
        },
      });

      await this.speak(`Got it! I've saved that note: "${noteContent}"`);
      this.emit({ type: 'action_completed', action: 'note_add', data: { note } });
    } catch (error) {
      logger.error({ error }, 'Error adding note');
      await this.speak("I had trouble saving that note. Please try again.");
    }
  }

  /**
   * Handle reading pinned notes
   */
  private async handlePinnedNotes(): Promise<void> {
    try {
      const notes = await prisma.note.findMany({
        where: { isPinned: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });

      if (notes.length === 0) {
        await this.speak("You don't have any pinned notes.");
        return;
      }

      let response = `You have ${notes.length} pinned note${notes.length > 1 ? 's' : ''}. `;
      notes.forEach((note, i) => {
        const content = note.title || note.body.substring(0, 50);
        response += `${i + 1}: ${content}. `;
      });

      await this.speak(response);
      this.emit({ type: 'action_completed', action: 'note_read_pinned', data: { notes } });
    } catch (error) {
      logger.error({ error }, 'Error reading pinned notes');
      await this.speak("I had trouble reading your pinned notes. Please try again.");
    }
  }

  /**
   * Handle unknown intents
   */
  private async handleUnknown(originalText: string): Promise<void> {
    // Use GPT to generate a helpful response
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: `You are Boomer AI, a friendly voice assistant for older adults. You help with:
- Schedule and appointments
- Medication tracking
- Contacts and phone numbers
- Notes and reminders

The user said something you're not sure about. Give a brief, friendly response and gently guide them to something you can help with. Keep it under 2 sentences.`
            },
            { role: 'user', content: originalText },
          ],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "I'm not sure about that. I can help you with your schedule, medications, contacts, or notes.";

      await this.speak(reply);
    } catch (error) {
      await this.speak("I'm not sure about that. I can help you with your schedule, medications, contacts, or notes. What would you like to do?");
    }
  }

  /**
   * Generate TTS and emit speaking event
   */
  private async speak(text: string): Promise<void> {
    try {
      const audioBuffer = await this.ttsClient.synthesize(text, {
        voice: this.config.voice,
      });

      this.emit({
        type: 'speaking',
        text,
        audio: audioBuffer,
      });
    } catch (error) {
      logger.error({ error }, 'Error generating speech');
      // Still emit text even if TTS fails
      this.emit({
        type: 'speaking',
        text,
      });
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.eventCallbacks = [];
    this.audioBuffer = [];
  }
}

/**
 * Create a new Boomer AI engine instance
 */
export function createBoomerEngine(config: BoomerConfig): BoomerAIEngine {
  return new BoomerAIEngine(config);
}
