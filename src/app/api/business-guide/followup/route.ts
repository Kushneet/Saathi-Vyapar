/**
 * src/app/api/business-guide/followup/route.ts
 * POST /api/business-guide/followup
 *
 * Handles follow-up conversational questions about the generated 5-stage transformation roadmap.
 * Calls Google Gemini Flash using the roadmap context and the user's question,
 * returning a concise, spoken-friendly answer (strictly 2-4 sentences).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText, resolveLlmConfig } from '@/lib/llm/provider';
import { RoadmapStageItem } from '@/app/api/business-guide/generate/route';

const FollowupSchema = z.object({
  user_id: z.string().optional(),
  roadmap: z.array(z.any()).min(1, 'Roadmap context is required'),
  question: z.string().min(2, 'Question must be at least 2 characters'),
  /** The answer is written — and read aloud — in this language only. */
  language: z.enum(['hi', 'en']).default('hi'),
});

function generateFallbackAnswer(question: string, roadmap: RoadmapStageItem[], lang: 'hi' | 'en'): string {
  const qLower = question.toLowerCase();
  if (lang === 'en') {
    if (/register|udyam|loan|पंजीकरण|उद्यम|लोन/.test(qLower)) {
      return 'For registration, apply on the free Udyam portal first. After that you can approach your bank branch or the Jan Samarth portal for a Mudra or PMEGP loan. This gives the business a formal identity and access to cheaper credit.';
    }
    if (/cost|raw material|cheap|कच्चा माल|लागत|सस्ता/.test(qLower)) {
      return 'To cut costs, buy raw material in bulk together with your SHG or other shopkeepers. Take at least two quotes directly from suppliers and note wastage every evening. Your monthly saving goes up straight away.';
    }
    if (/sales|customer|market|whatsapp|बिक्री|ग्राहक|मार्केट/.test(qLower)) {
      return 'To grow sales, make a WhatsApp catalogue group for regular customers and send them new offers. Spend one or two days a week at the nearest haat or a busy market. Reaching customers without a middleman can lift profit by around 20 percent.';
    }
    const s1 = roadmap[0]?.title_hi || 'Cut costs';
    const s4 = roadmap[3]?.title_hi || 'Register the business';
    return `For this question the first step, '${s1}', and the fourth, '${s4}', matter most. Make small changes to grow savings first, then use the government schemes. Ask any time you want more on a particular stage.`;
  }
  if (qLower.includes('पंजीकरण') || qLower.includes('उद्यम') || qLower.includes('रजिस्ट्रेशन') || qLower.includes('loan') || qLower.includes('लोन')) {
    return 'पंजीकरण के लिए आप मुफ्त उद्यम आधार (Udyam Registration) पोर्टल पर आवेदन कर सकते हैं। इसके बाद आप मुद्रा या PMEGP लोन के लिए सीधे बैंक शाखा या जन समर्थ पोर्टल से संपर्क कर सकते हैं। यह आपके व्यापार को औपचारिक पहचान और कम ब्याज पर ऋण दिलाएगा।';
  }
  if (qLower.includes('कच्चा माल') || qLower.includes('लागत') || qLower.includes('सस्ता') || qLower.includes('cost')) {
    return 'लागत कम करने के लिए स्थानीय स्वयं सहायता समूह या अन्य दुकानदारों के साथ मिलकर थोक में कच्चा माल खरीदें। सीधे सप्लायर्स से कम से कम दो कोटेशन लें और हर शाम बेकार होने वाले सामान का हिसाब रखें। इससे आपकी मासिक बचत तुरंत बढ़ जाएगी।';
  }
  if (qLower.includes('बिक्री') || qLower.includes('ग्राहक') || qLower.includes('मार्केट') || qLower.includes('whatsapp')) {
    return 'बिक्री बढ़ाने के लिए अपने नियमित ग्राहकों का एक WhatsApp कैटलॉग ग्रुप बनाएं और नए ऑफर्स भेजें। सप्ताह में एक या दो दिन नजदीकी हाट या भीड़ वाले बाजार में भी संपर्क बढ़ाएं। बिचौलियों के बिना सीधे ग्राहक तक पहुंचने से आपका मुनाफा 20 प्रतिशत तक बढ़ सकता है।';
  }

  const stage1 = roadmap[0]?.title_hi || 'लागत में कमी';
  const stage4 = roadmap[3]?.title_hi || 'औपचारिक पंजीकरण';
  return `आपके इस सवाल के लिए रोडमैप का पहला कदम '${stage1}' और चौथा कदम '${stage4}' सबसे महत्वपूर्ण हैं। छोटे-छोटे बदलाव करके पहले बचत बढ़ाएं, फिर सरकारी योजनाओं का लाभ उठाएं। यदि आपको किसी विशेष चरण पर अधिक जानकारी चाहिए तो निसंकोच पूछें।`;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = FollowupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { roadmap, question, language } = parsed.data;
    const typedRoadmap = roadmap as RoadmapStageItem[];

    const fallbackAnswer = () => generateFallbackAnswer(question, typedRoadmap, language);

    if (!resolveLlmConfig()) {
      const fallback = fallbackAnswer();
      return NextResponse.json({
        success: true,
        answer: fallback,
        source: 'fallback',
      });
    }

    const roadmapContext = typedRoadmap
      .map(
        (item, idx) =>
          `Stage ${idx + 1} (${item.stage} / ${item.title_hi}): ${item.description}. Key actions: ${item.action_items?.join(', ')}. Milestone: ${item.impact_milestone}`
      )
      .join('\n');

    const systemInstruction = `You are Saathi Vyapar's voice-first AI business mentor for Indian rural micro-entrepreneurs.
The entrepreneur is viewing their 5-stage transformation roadmap and has asked a follow-up question.
Provide a clear, practical, warm, and spoken-friendly answer.

STRICT GUIDELINES:
1. Length: Exactly 2 to 4 sentences. Keep it short and concise.
2. Tone: Encouraging, respectful, practical rural business guidance in ${language === 'hi' ? 'simple conversational Hindi (Devanagari script)' : 'plain, simple English'} with commonly understood terms. One language only — no bracketed translations.
3. Spoken-friendly: DO NOT use bullet points, asterisks, numbered lists, emojis, or markdown tables. It will be read aloud immediately via text-to-speech.
4. Base your advice firmly on their 5-stage roadmap context.`;

    const prompt = `Enterprise 5-Stage Roadmap Context:
${roadmapContext}

Entrepreneur's Follow-up Question:
"${question}"

Provide a 2 to 4 sentence spoken-friendly answer in ${language === 'hi' ? 'simple Hindi' : 'simple English'}:`;

    try {
      const answer = (await generateText({ prompt, systemInstruction, temperature: 0.3 }))?.trim();

      if (!answer) {
        throw new Error('Empty response from the model');
      }

      // Strip any accidental markdown formatting (bullet points, bolding) so speech is smooth
      const cleanAnswer = answer
        .replace(/[*#_~`]/g, '')
        .replace(/^\s*[-•]\s*/gm, '')
        .trim();

      return NextResponse.json({
        success: true,
        answer: cleanAnswer,
        source: 'gemini',
      });
    } catch (err) {
      console.warn('Follow-up generation failed, using fallback:', err);
      const fallback = fallbackAnswer();
      return NextResponse.json({
        success: true,
        answer: fallback,
        source: 'fallback',
      });
    }
  } catch (err: unknown) {
    console.error('Followup route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
