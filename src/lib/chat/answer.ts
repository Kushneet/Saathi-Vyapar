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
import { localizeReason } from '@/lib/engines/localizeReason';

/** How many prior turns to carry. Enough for context, short enough to stay cheap. */
const MAX_HISTORY = 6;

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

type Lang = 'en' | 'hi';

interface Intent {
  id: string;
  /** Matched against the question; Devanagari, romanised Hindi and English. */
  patterns: RegExp;
  /** Returns null when the figures are not available yet. */
  answer: (c: ChatContext & { question: string }, lang: Lang) => string | null;
}

/**
 * Questions worth answering from data alone. Each returns null when the
 * figures are not available yet, so the caller can fall through to the model
 * rather than assert something false. Every reply exists in both languages:
 * a Hindi-mode user reads Devanagari, an English-mode user reads English —
 * the Hinglish these used to be was wrong for both.
 */
/** Documents stored as "हिंदी (English)" → the on-screen language. */
function docLabel(doc: string, lang: Lang): string {
  const m = doc.match(/^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$/);
  if (!m) return doc;
  return lang === 'hi' ? (/[ऀ-ॿ]/.test(m[1]) ? m[1].trim() : m[2].trim()) : m[2].trim();
}

/** The scheme as it should be named on screen. */
const nameOf = (s: { name: string; nameHi?: string | null }, lang: Lang) => (lang === 'hi' && s.nameHi) || s.name;
const benefitOf = (s: { benefit: string; benefitHi?: string | null }, lang: Lang) => (lang === 'hi' && s.benefitHi) || s.benefit;

/** Strip the ✓/✗ the matcher prefixes; the reply phrases it itself. */
const bare = (r: string) => r.replace(/^[✓✗⚠️]\s*/, '');

/**
 * Which scheme, if any, the question names. Matched on the words of the
 * scheme's name and id ("mudra", "pmegp", "svanidhi", "kisan"), so a
 * romanised or partial mention still lands. Short filler words are
 * ignored so "loan" alone does not pick the first loan.
 */
function findScheme(question: string, schemes: ChatContext['schemes']['all']) {
  const q = question.toLowerCase();
  const STOP = new Set(['loan', 'scheme', 'yojana', 'pm', 'pradhan', 'mantri', 'the', 'and', 'for', 'of', 'india', 'programme', 'program', 'national', 'mission', 'card']);
  let best: { scheme: ChatContext['schemes']['all'][number]; score: number } | null = null;
  for (const scheme of schemes) {
    const words = `${scheme.name} ${scheme.id.replace(/-/g, ' ')}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w));
    const score = words.filter((w) => q.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { scheme, score };
  }
  return best?.scheme ?? null;
}

const KIND_WORDS: Record<string, RegExp> = {
  loan: /loan|karz|karza|udhaar|कर्ज़|लोन|ऋण/i,
  subsidy: /subsidy|grant|anudaan|सब्सिडी|अनुदान/i,
  training: /training|skill|seekh|सीख|ट्रेनिंग|प्रशिक्षण|कौशल/i,
  registration: /register|registration|udyam|पंजीकरण|रजिस्ट्रेशन/i,
};

const INTENTS: Intent[] = [
  {
    id: 'help',
    patterns:
      /how (do i|to) use|what can you|what (do|can) (you|i) do|help me|kaise (use|chalu|istemal)|kya kar sakt|madad|कैसे (इस्तेमाल|चलाएँ|चलाये|उपयोग)|क्या कर सकत|मदद|website|वेबसाइट|साइट|app kaise/i,
    answer: (_c, lang) =>
      lang === 'hi'
        ? 'साथी व्यापार में चार काम होते हैं। डैशबोर्ड पर दिखता है इस महीने कितना बचा और कितना बेचना ज़रूरी है। "अपनी कॉपी से जोड़ें" में बही-खाते की फोटो लेते ही एंट्री बन जाती हैं। खाता मित्र में बोलकर बिक्री-खर्च लिखवा सकते हैं। योजना केंद्र बताता है कौन सी सरकारी योजना आपको मिल सकती है और कौन से कागज़ लगेंगे। मुझसे अपने आँकड़ों के बारे में कुछ भी पूछ सकते हैं।'
        : 'Saathi Vyapar does four things. The dashboard shows what you kept this month and how much you need to sell. "Add from your notebook" turns a photo of your ledger into entries. Khata Mitra lets you speak a sale or expense and it is written down. Yojana Kendra tells you which government schemes you can get and what papers they need. Ask me anything about your own figures.',
  },
  {
    id: 'profit',
    patterns: /profit|munaf|kamai|kitna bacha|kitna kamaya|मुनाफ़|मुनाफा|कमाई|कितना बचा|बचत/i,
    answer: (c, lang) => {
      if (!c.finance) return null;
      const { netProfit, marginPercent } = c.finance;
      if (lang === 'hi') {
        return netProfit >= 0
          ? `इस महीने आपके पास ${rupees(netProfit)} बचे — हर ₹100 में से ₹${marginPercent.toFixed(0)}।`
          : `इस महीने ${rupees(Math.abs(netProfit))} का नुकसान हुआ। खर्च कमाई से ज़्यादा हो रहा है।`;
      }
      return netProfit >= 0
        ? `You kept ${rupees(netProfit)} this month — ₹${marginPercent.toFixed(0)} out of every ₹100.`
        : `You lost ${rupees(Math.abs(netProfit))} this month. Costs are running ahead of sales.`;
    },
  },
  {
    id: 'break_even',
    patterns: /break.?even|need to sell|much (do i|to) sell|kitna bechna|kitni bikri|ब्रेक|कितना बेचना|कितनी बिक्री|कितना बेचूँ/i,
    answer: (c, lang) => {
      if (!c.finance) return null;
      const be = rupees(c.finance.breakEvenRevenue);
      return lang === 'hi'
        ? `हर महीने कम से कम ${be} की बिक्री चाहिए — उतने में खर्च निकल जाता है। उससे ऊपर जो भी है, वही आपका मुनाफा है।`
        : `You need at least ${be} in sales every month — that covers your costs. Everything above it is profit.`;
    },
  },
  {
    id: 'scheme_detail',
    // Any question that names a scheme, whatever else it asks.
    patterns: /./,
    answer: (c, lang) => {
      const s = findScheme(c.question, c.schemes.all);
      if (!s) return null;
      const docs = s.documents.slice(0, 4).map((d) => docLabel(d, lang));
      const why = s.reasons[0] ? bare(s.reasons[0]) : '';
      if (lang === 'hi') {
        const verdict = s.eligible
          ? `आपको यह मिल सकती है${why ? ` — ${localizeReason(s.reasons[0], 'hi')}` : ''}।`
          : `अभी यह आपके लिए नहीं है${why ? ` — ${localizeReason(s.reasons[0], 'hi')}` : ''}।`;
        const papers = docs.length ? ` कागज़: ${docs.join(', ')}।` : '';
        return `${nameOf(s, 'hi')}: ${benefitOf(s, 'hi')} ${verdict}${papers} योजना केंद्र में "आवेदन करें" से सीधे फ़ॉर्म खुलता है।`;
      }
      const verdict = s.eligible
        ? `You qualify — you can get it${why ? `: ${localizeReason(s.reasons[0], 'en')}` : ''}.`
        : `It is not for you right now${why ? `: ${localizeReason(s.reasons[0], 'en')}` : ''}.`;
      const papers = docs.length ? ` Papers: ${docs.join(', ')}.` : '';
      return `${s.name}: ${s.benefit} ${verdict}${papers} Tap Apply on Yojana Kendra to open the form.`;
    },
  },
  {
    id: 'schemes_by_kind',
    patterns: /loan|karz|udhaar|कर्ज़|लोन|ऋण|subsidy|grant|anudaan|सब्सिडी|अनुदान|training|skill|seekh|ट्रेनिंग|प्रशिक्षण|कौशल|register|udyam|पंजीकरण|रजिस्ट्रेशन/i,
    answer: (c, lang) => {
      const kind = Object.keys(KIND_WORDS).find((k) => KIND_WORDS[k].test(c.question));
      if (!kind) return null;
      const ofKind = c.schemes.all.filter((s) => s.kind === kind);
      if (ofKind.length === 0) return null;
      const label = { loan: ['लोन', 'loans'], subsidy: ['सब्सिडी / अनुदान', 'grants and subsidies'], training: ['ट्रेनिंग', 'training schemes'], registration: ['पंजीकरण', 'registrations'] }[kind]!;
      const list = ofKind.filter((s) => s.eligible).slice(0, 5);
      if (list.length === 0) {
        // Nothing of this kind is open: say so, and say what stands in the
        // way of the nearest one, rather than falling silent.
        const nearest = ofKind[0];
        const why = nearest.reasons.find((r) => r.startsWith('✗'));
        return lang === 'hi'
          ? `अभी कोई ${label[0]} आपके लिए खुली नहीं है।${why ? ` जैसे ${nameOf(nearest, 'hi')}: ${localizeReason(why, 'hi')}।` : ''} योजना केंद्र में "जानकारी बदलें" से अपने आँकड़े ठीक कर के दोबारा देखें।`
          : `None of the ${label[1]} are open to you right now.${why ? ` For example ${nearest.name}: ${localizeReason(why, 'en')}.` : ''} Check your details under "Change details" on Yojana Kendra and look again.`;
      }
      const items = list.map((s) => `${nameOf(s, lang)} (${benefitOf(s, lang).split(/[.।]/)[0]})`).join('; ');
      return lang === 'hi'
        ? `आपको ये ${label[0]} मिल सकते हैं: ${items}। किसी एक का नाम लेकर पूछें तो कागज़ और शर्तें बता दूँगा।`
        : `These ${label[1]} are open to you: ${items}. Ask about any one by name and I will tell you the papers and conditions.`;
    },
  },
  {
    id: 'schemes',
    patterns: /scheme|yojana|loan|subsidy|sarkari|योजना|सरकारी|लोन|सब्सिडी|कर्ज़/i,
    answer: (c, lang) => {
      if (c.schemes.eligibleCount === 0) return null;
      const names = c.schemes.topMatches.map((s) => nameOf(s, lang)).join(', ');
      return lang === 'hi'
        ? `आप ${c.schemes.eligibleCount} योजनाओं के लिए पात्र हैं। सबसे ऊपर: ${names}। योजना केंद्र में देख सकते हैं कि क्यों पात्र हैं और कौन से कागज़ लगेंगे।`
        : `You qualify for ${c.schemes.eligibleCount} schemes. Top matches: ${names}. Open Yojana Kendra to see why you qualify and which papers you need.`;
    },
  },
  {
    id: 'ledger',
    patterns: /kharch|kitna gaya|hisaab|ledger|khata|entries|spen[dt]|expense|खर्च|हिसाब|खाता/i,
    answer: (c, lang) => {
      if (c.ledger.entryCount === 0) return null;
      const { last30DaysIncome, last30DaysExpense, entryCount } = c.ledger;
      return lang === 'hi'
        ? `पिछले 30 दिन में ${rupees(last30DaysIncome)} आए और ${rupees(last30DaysExpense)} गए — ${entryCount} एंट्री दर्ज हैं।`
        : `In the last 30 days ${rupees(last30DaysIncome)} came in and ${rupees(last30DaysExpense)} went out — ${entryCount} entries recorded.`;
    },
  },
];

/** What the site does, so questions about it are answered, not deflected. */
const ABOUT = `Saathi Vyapar is a free app for small shopkeepers, tailors, dairy farmers and other rural micro-entrepreneurs in India.
- Dashboard: shows what the user kept this month (profit), the sales needed to cover costs (break-even), and how safe their money is.
- Add from your notebook: photograph a page of the bahi-khata; the app reads the entries (OCR) and stages them for review before saving.
- Khata Mitra: speak or type a sale, expense or customer credit (udhaar) and it is written to the ledger.
- Yojana Kendra: matches the user's profile against 60+ government schemes, explains why they qualify, and lists the documents needed.
- How to grow: builds a 5-step growth plan from the user's own figures and stated problem.
- Works in Hindi and English (toggle at the top), on WhatsApp and SMS as well as the web.`;

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
  const eligible = c.schemes.all.filter((s) => s.eligible).slice(0, 20);
  if (eligible.length) {
    lines.push('ELIGIBLE SCHEMES (name — what it gives):');
    for (const s of eligible) lines.push(`- ${s.name} — ${s.benefit}`);
  }
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

  const lang: Lang = context.language === 'hi' ? 'hi' : 'en';
  const ctx: ChatContext & { question: string } = { ...context, question: asked };

  for (const intent of INTENTS) {
    if (intent.patterns.test(asked)) {
      const reply = intent.answer(ctx, lang);
      if (reply) return { reply, source: 'data' };
    }
  }

  const language = lang === 'hi' ? 'Hindi (Devanagari script)' : 'simple English';
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
      `- Questions about what the app does or how to use it are answered from ABOUT.\n` +
      `- If the answer is in neither FIGURES nor ABOUT, say you do not have that yet and ` +
      `suggest adding a notebook photo or completing the profile.\n` +
      `- Never give legal, tax or medical advice, and never promise a loan will be approved.\n` +
      `- No markdown, no bullet points, no preamble.`,
    prompt: `ABOUT:\n${ABOUT}\n\nFIGURES:\n${factSheet(context)}\n\n${prior ? `EARLIER:\n${prior}\n\n` : ''}QUESTION: ${asked}`,
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
