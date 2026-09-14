/**
 * src/lib/chat/answer.ts
 *
 * Turns a question into an answer, figures first.
 *
 * The order matters. Known questions ("how much did I keep?", "which schemes
 * do I get?") are answered by reading ChatContext and formatting it — no model
 * involved, so the number cannot drift. Anything else is passed to the model
 * with the same figures attached and a standing instruction not to invent or
 * alter any of them. If no model is configured, or the call fails, the user
 * still gets a useful deterministic reply.
 */

import { generateText } from '@/lib/llm/provider';
import type { ChatContext, ChatMessage, ChatResponse } from './types';

/** How many prior turns to carry. Enough for context, short enough to stay cheap. */
const MAX_HISTORY = 6;

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface Intent {
  id: string;
  /** Matched against the lowercased question; Devanagari and roman both. */
  patterns: RegExp;
  answer: (c: ChatContext) => string | null;
}

/**
 * Questions worth answering from data alone. Each returns null when the
 * figures are not available yet, so the caller can fall through to the model
 * rather than assert something false.
 */
const INTENTS: Intent[] = [
  {
    id: 'profit',
    patterns: /profit|kamai|kitna bacha|kitna kamaya|मुनाफ़|मुनाफा|कमाई|कितना बचा/i,
    answer: (c) => {
      if (!c.finance) return null;
      const { netProfit, marginPercent } = c.finance;
      return netProfit >= 0
        ? `Is mahine aapke paas ${rupees(netProfit)} bache — har ₹100 mein se ₹${marginPercent.toFixed(0)}.`
        : `Is mahine ${rupees(Math.abs(netProfit))} ka nuksan hua. Kharch kamai se zyada ho raha hai.`;
    },
  },
  {
    id: 'break_even',
    patterns: /break.?even|kitna bechna|kitni bikri|ब्रेक|कितना बेचना|कितनी बिक्री/i,
    answer: (c) =>
      c.finance
        ? `Har mahine kam se kam ${rupees(c.finance.breakEvenRevenue)} ki bikri chahiye — utne mein kharcha nikal jata hai. Usse upar jo bhi hai, wahi aapka munafa hai.`
        : null,
  },
  {
    id: 'schemes',
    patterns: /scheme|yojana|loan|subsidy|sarkari|योजना|सरकारी|लोन|सब्सिडी/i,
    answer: (c) => {
      if (c.schemes.eligibleCount === 0) return null;
      const names = c.schemes.topMatches.map((s) => s.name).join(', ');
      return `Aap ${c.schemes.eligibleCount} yojanaon ke liye paatra hain. Sabse upar: ${names}. Yojana Kendra kholkar dekh sakte hain ki kyun paatra hain aur kaun se kagaz lagenge.`;
    },
  },
  {
    id: 'ledger',
    patterns: /kharch|kitna gaya|hisaab|ledger|khata|entries|खर्च|हिसाब|खाता/i,
    answer: (c) => {
      if (c.ledger.entryCount === 0) return null;
      const { last30DaysIncome, last30DaysExpense } = c.ledger;
      return `Pichhle 30 din mein ${rupees(last30DaysIncome)} aaye aur ${rupees(last30DaysExpense)} gaye — ${c.ledger.entryCount} entries darj hain.`;
    },
  },
];

/** Facts the model may repeat, and nothing beyond them. */
function factSheet(c: ChatContext): string {
  const lines: string[] = [];
  if (c.profile) {
    lines.push(`Monthly sales: ${rupees(c.profile.monthlyRevenue)}`);
    lines.push(`Monthly costs: ${rupees(c.profile.monthlyExpense)}`);
    if (c.profile.sector) lines.push(`Trade: ${c.profile.sector}`);
    lines.push(`Loan running: ${c.profile.existingLoans ? 'yes' : 'no'}`);
  }
  if (c.finance) {
    lines.push(`Kept this month: ${rupees(c.finance.netProfit)}`);
    lines.push(`Margin: ${c.finance.marginPercent.toFixed(1)}%`);
    lines.push(`Sales needed to cover costs: ${rupees(c.finance.breakEvenRevenue)}`);
  }
  lines.push(`Schemes the user qualifies for: ${c.schemes.eligibleCount}`);
  if (c.ledger.entryCount > 0) {
    lines.push(`Last 30 days in: ${rupees(c.ledger.last30DaysIncome)}`);
    lines.push(`Last 30 days out: ${rupees(c.ledger.last30DaysExpense)}`);
  }
  return lines.join('\n');
}

export async function answerQuestion(
  question: string,
  context: ChatContext,
  history: ChatMessage[] = []
): Promise<ChatResponse> {
  const asked = question.trim();

  for (const intent of INTENTS) {
    if (intent.patterns.test(asked)) {
      const reply = intent.answer(context);
      if (reply) return { reply, source: 'data' };
    }
  }

  const language = context.language === 'hi' ? 'Hindi' : 'simple English';
  const prior = history
    .slice(-MAX_HISTORY)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const reply = await generateText({
    temperature: 0.2,
    systemInstruction:
      `You help a rural Indian micro-entrepreneur understand their own business figures. ` +
      `Reply in ${language}, in at most three short sentences, using everyday words.\n` +
      `RULES:\n` +
      `- Only state numbers that appear in the FIGURES block. Never calculate a new one, ` +
      `never estimate, never round differently.\n` +
      `- If the answer is not in FIGURES, say you do not have that yet and suggest adding ` +
      `a notebook photo or completing the profile.\n` +
      `- Never give legal, tax or medical advice, and never promise a loan will be approved.\n` +
      `- No markdown, no bullet points, no preamble.`,
    prompt: `FIGURES:\n${factSheet(context)}\n\n${prior ? `EARLIER:\n${prior}\n\n` : ''}QUESTION: ${asked}`,
  });

  if (reply) return { reply, source: 'llm' };

  return {
    reply:
      context.language === 'hi'
        ? 'अभी मैं इसका जवाब नहीं दे पा रहा। आप डैशबोर्ड पर अपना मुनाफ़ा, ज़रूरी बिक्री और योजनाएँ देख सकते हैं।'
        : 'I cannot answer that right now. Your dashboard shows what you kept, the sales you need, and the schemes you qualify for.',
    source: 'fallback',
  };
}
