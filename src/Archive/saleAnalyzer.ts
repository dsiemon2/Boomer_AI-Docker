import OpenAI from 'openai';
import pino from 'pino';

const logger = pino();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type SaleOutcome = 'SALE_CONFIRMED' | 'SALE_DENIED' | 'UNDECIDED';

export interface AnalysisResult {
  outcome: SaleOutcome;
  confidence: number;  // 0-100
  reasoning: string;
  keyPhrase?: string;
  // Localized popup messages (in user's language)
  popupHeadline?: string;
  popupMessage?: string;
}

/**
 * AI-powered analysis for nuanced/ambiguous cases
 */
async function analyzeWithAI(
  messages: Array<{ role: string; content: string }>
): Promise<AnalysisResult> {

  const systemPrompt = `You are a sales conversation analyzer. Your job is to determine if a customer has COMPLETED a purchase commitment.

CRITICAL: Distinguish between INTERMEDIATE steps and FINAL commitment!

INTERMEDIATE (return UNDECIDED):
- Customer agrees to reserve/hold → but salesperson asks follow-up questions
- Customer picks a color/variant → salesperson still confirming details
- Customer says "yes" to one question → but more questions follow
- Salesperson asks "would you like to complete the purchase?" → WAITING for answer

FINAL COMMITMENT (return SALE_CONFIRMED):
- Customer confirms COMPLETING the purchase/order/transaction
- Customer says "yes" to "complete the purchase?" or "finalize the order?"
- No more questions from salesperson - just confirmation/thank you
- Customer has answered ALL closing questions affirmatively

SALE_CONFIRMED criteria (ALL must be true):
1. The salesperson has asked the FINAL closing question (complete purchase, finalize order)
2. Customer clearly agreed to that FINAL question
3. The conversation shows the transaction is DONE, not still in progress
4. If salesperson asks another question after customer's response → NOT confirmed yet

SALE_DENIED criteria:
1. Customer explicitly declined to purchase (no thanks, not interested, I'll pass)
2. Customer said they don't want the product
3. Clear rejection, not just hesitation
4. Customer ends the conversation without buying (bye, goodbye, I'm done, end session, I have to go)
5. Customer walks away or disengages from the sale

UNDECIDED criteria:
- Salesperson is still asking questions (color, quantity, details)
- Customer agreed to intermediate step but sale isn't finalized
- Conversation is still in progress
- Customer hasn't answered the FINAL "complete the purchase" question

LANGUAGE DETECTION & LOCALIZATION:
- Detect which language the customer is speaking (from the conversation)
- For SALE_CONFIRMED: provide "popupHeadline" and "popupMessage" in the CUSTOMER'S LANGUAGE
  - Examples: "SALE MADE!" / "Congratulations! You closed the deal!"
  - Spanish: "¡VENTA REALIZADA!" / "¡Felicidades! ¡Cerraste el trato!"
  - French: "VENTE CONCLUE!" / "Félicitations! Vous avez conclu la vente!"
  - German: "VERKAUF ABGESCHLOSSEN!" / "Herzlichen Glückwunsch! Sie haben den Deal abgeschlossen!"
- For SALE_DENIED: provide localized headline and message
  - Examples: "SALE DENIED" / "The customer declined. Better luck next time!"
  - Spanish: "VENTA RECHAZADA" / "El cliente declinó. ¡Mejor suerte la próxima vez!"

Return ONLY a JSON object:
{
  "outcome": "SALE_CONFIRMED" | "SALE_DENIED" | "UNDECIDED",
  "confidence": <0-100>,
  "reasoning": "<brief explanation>",
  "keyPhrase": "<the customer phrase that determined outcome>",
  "popupHeadline": "<localized headline in customer's language>",
  "popupMessage": "<localized message in customer's language>"
}

Be VERY conservative - a sale is only confirmed when the ENTIRE transaction is complete. If the salesperson asks another question after customer says yes, return UNDECIDED.`;

  const conversationText = messages
    .slice(-10) // Last 10 messages for context
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Fast and cost-effective
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this sales conversation:\n\n${conversationText}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,  // Low temperature for consistent analysis
      max_tokens: 200
    });

    const content = response.choices[0].message.content || '{}';
    const result = JSON.parse(content);

    return {
      outcome: result.outcome || 'UNDECIDED',
      confidence: result.confidence || 0,
      reasoning: result.reasoning || 'Unable to analyze',
      keyPhrase: result.keyPhrase,
      popupHeadline: result.popupHeadline,
      popupMessage: result.popupMessage
    };

  } catch (error) {
    logger.error({ error }, 'AI analysis failed');
    return {
      outcome: 'UNDECIDED',
      confidence: 0,
      reasoning: 'Analysis error - defaulting to undecided'
    };
  }
}

/**
 * Pure AI-powered sale detection (AI SELLS mode)
 *
 * Analyzes the full conversation context using GPT to determine
 * if the customer has committed to purchasing.
 *
 * NO keyword matching - true AI understanding of context and intent.
 *
 * @param conversationHistory - Full conversation for AI context
 * @returns Analysis result with outcome, confidence, and reasoning
 */
export async function detectSaleOutcome(
  conversationHistory: Array<{ role: string; content: string }>
): Promise<AnalysisResult> {

  logger.info({ messageCount: conversationHistory.length }, 'AI analyzing conversation for sale outcome');

  const aiResult = await analyzeWithAI(conversationHistory);

  logger.info({
    outcome: aiResult.outcome,
    confidence: aiResult.confidence,
    reasoning: aiResult.reasoning,
    keyPhrase: aiResult.keyPhrase
  }, 'AI sale analysis complete');

  return aiResult;
}

/**
 * AI-powered sale detection for USER SELLS mode
 *
 * In this mode, the AI is the CUSTOMER. We analyze the AI's responses
 * to determine if the AI customer has agreed to buy or definitively rejected.
 *
 * @param conversationHistory - Full conversation for AI context
 * @param difficulty - Customer difficulty level affects threshold
 * @returns Analysis result with outcome, confidence, and reasoning
 */
export async function detectUserSaleOutcome(
  conversationHistory: Array<{ role: string; content: string }>,
  difficulty: string = 'medium'
): Promise<AnalysisResult> {

  logger.info({ messageCount: conversationHistory.length, difficulty }, 'Analyzing USER SELLS mode conversation');

  const systemPrompt = `You are analyzing a "Sell Me a Pen" sales training conversation where the USER is the salesperson and the ASSISTANT is the potential customer.

DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
- Easy: Customer is friendly and buys easily
- Medium: Customer needs moderate convincing
- Hard: Customer is skeptical and requires excellent pitch
- Expert: Customer is extremely tough ("Wolf of Wall Street" level)

Your job is to determine if the ASSISTANT (customer) has made a FINAL decision to BUY or NOT BUY.

SALE_CONFIRMED - The customer (assistant) has clearly agreed to purchase:
- "Okay, I'll take it", "You convinced me", "I'll buy it", "Sign me up", "Deal"
- Clear, final agreement to make the purchase
- The assistant explicitly states they will buy

SALE_DENIED - The customer (assistant) has clearly rejected the sale:
- "No thanks", "I'm not interested", "I don't want it", "Sorry, no"
- Clear, final refusal after the user has made their pitch
- The assistant explicitly states they won't buy
- The salesperson (user) ends the conversation without making a sale (bye, goodbye, I'm done, I give up)
- The salesperson walks away or abandons the pitch

UNDECIDED - The conversation is still ongoing:
- Customer is asking questions, raising objections, or considering
- No final decision has been made yet
- Customer might still be convinced

IMPORTANT: Only return SALE_CONFIRMED or SALE_DENIED when the customer has made a CLEAR, FINAL statement. Objections and hesitation are NOT denials - they're opportunities for the salesperson to respond.

Return ONLY a JSON object:
{
  "outcome": "SALE_CONFIRMED" | "SALE_DENIED" | "UNDECIDED",
  "confidence": <0-100>,
  "reasoning": "<brief explanation>",
  "keyPhrase": "<the assistant's phrase that determined outcome>",
  "popupHeadline": "<headline for result popup in user's language>",
  "popupMessage": "<message for result popup in user's language>"
}`;

  const conversationText = conversationHistory
    .slice(-12)
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this sales conversation (USER is selling, ASSISTANT is customer):\n\n${conversationText}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 250
    });

    const content = response.choices[0].message.content || '{}';
    const result = JSON.parse(content);

    return {
      outcome: result.outcome || 'UNDECIDED',
      confidence: result.confidence || 0,
      reasoning: result.reasoning || 'Unable to analyze',
      keyPhrase: result.keyPhrase,
      popupHeadline: result.popupHeadline,
      popupMessage: result.popupMessage
    };

  } catch (error) {
    logger.error({ error }, 'User sells AI analysis failed');
    return {
      outcome: 'UNDECIDED',
      confidence: 0,
      reasoning: 'Analysis error - defaulting to undecided'
    };
  }
}
