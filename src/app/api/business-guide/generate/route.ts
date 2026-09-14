/**
 * src/app/api/business-guide/generate/route.ts
 * POST /api/business-guide/generate
 *
 * Generates a structured 5-stage transformation roadmap for micro-entrepreneurs
 * based on their business profile and self-described challenges using Google Gemini Flash.
 *
 * Fixed 5 Stages (names are strictly enforced):
 * 1. Cost Optimization
 * 2. Value Addition
 * 3. Direct Market Access
 * 4. Formal Registration
 * 5. Scale
 *
 * Saves generated roadmap to business_guides table in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText, resolveLlmConfig } from '@/lib/llm/provider';
import { supabaseServer } from '@/lib/supabase/server';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';

const FIXED_STAGES = [
  'Cost Optimization',
  'Value Addition',
  'Direct Market Access',
  'Formal Registration',
  'Scale',
] as const;

export interface RoadmapStageItem {
  stage: typeof FIXED_STAGES[number];
  title_hi: string;
  description: string;
  action_items: string[];
  impact_milestone: string;
}

// `user_id` is optional and not authoritative — identity comes from the
// session cookie; passing an id is a request to act for that entrepreneur,
// honoured only for a linked facilitator.
const GenerateGuideSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID').optional(),
  challenge_text: z.string().min(3, 'Please describe your business challenge'),
  /** Every sentence of the roadmap is written in this language — not both. */
  language: z.enum(['hi', 'en']).default('hi'),
});

type Lang = 'hi' | 'en';

// Deterministic fallback generator if no model is available.
// One language per call — the titles used to carry Hindi with the English
// stage name in brackets, which read as a mix whichever mode was chosen.
function generateFallbackRoadmap(
  sector: string,
  revenue: number,
  expense: number,
  challengeText: string | undefined,
  lang: Lang
): RoadmapStageItem[] {
  const monthlySavingsTarget = Math.max(2000, Math.round(revenue * 0.15));
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  if (lang === 'en') {
    const challengeNote = challengeText ? ` (Your concern: ${challengeText})` : '';
    return [
      {
        stage: 'Cost Optimization',
        title_hi: 'Cut costs and buy smarter',
        description: `Bring raw-material and daily costs in your ${sector || 'business'} down by 10–15% through group buying and dealing directly with wholesalers.${challengeNote}`,
        action_items: [
          'Buy raw material in bulk together with nearby traders or your SHG.',
          'Note the day\'s wastage every evening.',
          'Get quotes from at least two new suppliers.',
        ],
        impact_milestone: `Save ${inr(Math.round(expense * 0.1))} a month on costs`,
      },
      {
        stage: 'Value Addition',
        title_hi: 'Make the same product worth more',
        description: 'Sell what you already make at a 15–25% better margin through cleaner packaging, grading, or bundles.',
        action_items: [
          'Start clean packaging with a simple label.',
          'Offer a small pack and a large pack so customers choose what suits them.',
          'Give regular customers a combo offer or a loyalty discount.',
        ],
        impact_milestone: '20% more profit on every unit',
      },
      {
        stage: 'Direct Market Access',
        title_hi: 'Sell directly, skip the middleman',
        description: 'Reach customers yourself — the weekly haat, nearby households, and a WhatsApp catalogue — instead of paying a middleman.',
        action_items: [
          'Make a WhatsApp broadcast group and catalogue for local customers.',
          'Put up a stall at the nearest big haat or market one or two days a week.',
          'Reach out directly to 50 new households or institutions nearby.',
        ],
        impact_milestone: '25% more sales by keeping the middleman\'s commission',
      },
      {
        stage: 'Formal Registration',
        title_hi: 'Register the business',
        description: 'Get the free Udyam registration so you qualify for government subsidies and low-interest bank loans.',
        action_items: [
          'Complete free MSME Udyam registration at udyamregistration.gov.in.',
          'If you sell food, get the ₹100 FSSAI basic registration.',
          'Open a current account in the business name, or link a Jan Dhan account.',
        ],
        impact_milestone: 'Formally eligible for PMEGP and PM Mudra',
      },
      {
        stage: 'Scale',
        title_hi: 'Grow with savings, not debt',
        description: 'Build working capital over the next 6 months by saving a fixed amount, before taking on heavy credit.',
        action_items: [
          `Set aside at least ${inr(monthlySavingsTarget)} every month in a business emergency fund.`,
          'Apply for PM Mudra (Shishu/Kishor) only after 6 months of regular saving.',
          'Reinvest 40% of profit in tools or stock that help the business.',
        ],
        impact_milestone: `${inr(monthlySavingsTarget * 6)} working fund in 6 months`,
      },
    ];
  }

  const challengeNote = challengeText ? ` (विशेष ध्यान: ${challengeText})` : '';
  return [
    {
      stage: 'Cost Optimization',
      title_hi: 'लागत घटाएँ, समझदारी से खरीदें',
      description: `अपने ${sector || 'व्यवसाय'} में कच्चे माल और दैनिक खर्चों को 10-15% तक कम करने के लिए समूह खरीद और सीधे थोक व्यापारियों से संपर्क करें।${challengeNote}`,
      action_items: [
        'स्थानीय व्यापारियों या स्वयं सहायता समूह के साथ मिलकर थोक में कच्चा माल खरीदें।',
        'दुकान/काम में होने वाली रोज़ की बर्बादी का हर शाम हिसाब रखें।',
        'कच्चे माल के लिए कम से कम 2 नए सप्लायर से भाव लें।',
      ],
      impact_milestone: `मासिक खर्च में ${inr(Math.round(expense * 0.1))} की बचत`,
    },
    {
      stage: 'Value Addition',
      title_hi: 'उसी माल की कीमत बढ़ाएँ',
      description: 'समान उत्पाद को बेहतर पैकेजिंग, ग्रेडिंग या बंडल बनाकर 15-25% अधिक मुनाफे पर बेचें।',
      action_items: [
        'उत्पाद की साफ-सुथरी पैकेजिंग और सरल लेबलिंग शुरू करें।',
        'छोटे और बड़े पैक का विकल्प दें ताकि ग्राहक अपनी सुविधा से खरीद सकें।',
        'नियमित ग्राहकों को कॉम्बो ऑफर या वफ़ादारी छूट दें।',
      ],
      impact_milestone: 'हर इकाई पर 20% ज़्यादा मुनाफा',
    },
    {
      stage: 'Direct Market Access',
      title_hi: 'सीधे बेचें, बिचौलिया हटाएँ',
      description: 'बिचौलियों को बीच से हटाकर सीधे ग्राहकों, स्थानीय साप्ताहिक हाटों और WhatsApp कैटलॉग से बिक्री करें।',
      action_items: [
        'अपने स्थानीय ग्राहकों का WhatsApp ब्रॉडकास्ट ग्रुप और कैटलॉग बनाएँ।',
        'सप्ताह में 1-2 दिन नज़दीकी बड़े हाट या बाज़ार में स्टॉल लगाएँ।',
        'आस-पास के 50 नए परिवारों या संस्थानों से सीधा संपर्क बनाएँ।',
      ],
      impact_milestone: 'बिचौलियों का कमीशन बचाकर 25% अतिरिक्त बिक्री',
    },
    {
      stage: 'Formal Registration',
      title_hi: 'व्यापार का पंजीकरण कराएँ',
      description: 'मुफ़्त उद्यम पंजीकरण कराएँ जिससे आप सरकारी सब्सिडी और कम ब्याज वाले बैंक लोन के पात्र बन सकें।',
      action_items: [
        'udyamregistration.gov.in पर मुफ़्त MSME उद्यम पंजीकरण पूरा करें।',
        'खाद्य व्यवसाय होने पर ₹100 में FSSAI बेसिक रजिस्ट्रेशन लें।',
        'व्यापार के नाम से अलग चालू खाता खोलें या जन-धन खाता जोड़ें।',
      ],
      impact_milestone: 'PMEGP और PM मुद्रा योजना के लिए औपचारिक पात्रता',
    },
    {
      stage: 'Scale',
      title_hi: 'कर्ज़ नहीं, बचत से बढ़ें',
      description: 'बिना भारी कर्ज़ के, अगले 6 महीनों में तय बचत जमा करके कार्यशील पूँजी तैयार करें।',
      action_items: [
        `हर महीने कम से कम ${inr(monthlySavingsTarget)} आपातकालीन व्यापारिक फंड में अलग रखें।`,
        '6 महीने की नियमित बचत के बाद ही PM मुद्रा योजना (शिशु/किशोर) के लिए आवेदन करें।',
        'व्यापार में नए उपकरण या स्टॉक के लिए लाभ का 40% वापस लगाएँ।',
      ],
      impact_milestone: `6 माह में ${inr(monthlySavingsTarget * 6)} का सुरक्षित कार्यशील फंड`,
    },
  ];
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = GenerateGuideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { challenge_text, language } = parsed.data;

    const user_id = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!user_id) return forbidden();

    // 1. Fetch user & business profile from Supabase
    const { data: profile } = await supabaseServer
      .from('business_profiles')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // The roadmap quotes rupee savings targets derived from these numbers, so
    // inventing ₹20,000/₹12,000 for a user with no profile produced concrete
    // financial advice about a business nobody runs.
    if (!profile) {
      return NextResponse.json(
        { error: 'Business profile not found. Please complete onboarding first.' },
        { status: 404 }
      );
    }

    const sector = profile.sector || 'General Micro-Enterprise';
    const district = profile.district || 'Rural India';
    const revenue = Number(profile.monthly_revenue_est) || 0;
    const expense = Number(profile.monthly_expense_est) || 0;

    let roadmap: RoadmapStageItem[];

    // No model configured — Gemini or self-hosted — so use the written roadmap.
    if (!resolveLlmConfig()) {
      roadmap = generateFallbackRoadmap(sector, revenue, expense, challenge_text, language);
    } else {
      const systemInstruction = `You are an expert rural enterprise growth strategist for Saathi Vyapar in India.
Your goal is to provide actionable, realistic, jargon-free business transformation roadmaps for micro-entrepreneurs (e.g. kirana shops, tailors, dairy farmers, artisans).

STRICT RULES:
1. You MUST output a 5-stage transformation roadmap using PRECISELY these 5 stage names in this exact order:
   Stage 1: "Cost Optimization"
   Stage 2: "Value Addition"
   Stage 3: "Direct Market Access"
   Stage 4: "Formal Registration"
   Stage 5: "Scale"
2. Do NOT invent, rename, or reorder the stage names.
3. Tailor every action item and milestone to the user's specific business sector, location, financials, and stated challenges.
4. Keep the language simple, respectful, and culturally grounded in Indian vernacular business realities.
   Write EVERY string — title_hi, description, action_items, impact_milestone — in ${language === 'hi' ? 'Hindi (Devanagari script)' : 'plain English'}.
   One language only: no bracketed translations, no English stage names inside a Hindi title, no Hindi inside an English one. Keep proper nouns (Udyam, FSSAI, WhatsApp, PMEGP) as they are.
5. In "Formal Registration", mention real Indian portals (e.g., Udyam Registration, FSSAI, PMFME, PM SVANidhi, Mudra).
6. In "Scale", calculate a concrete, achievable numeric savings milestone in ₹ before seeking formal credit.
7. Return strictly a JSON array matching the RoadmapStageItem schema.`;

      const prompt = `User Business Profile:
- Sector / Trade: ${sector}
- Business Name: ${profile?.business_name || sector}
- Location (District/State): ${district}, ${profile?.state || 'India'}
- Monthly Revenue: ₹${revenue.toLocaleString('en-IN')}
- Monthly Expenses: ₹${expense.toLocaleString('en-IN')}
- Existing Loans: ${profile?.existing_loans ? 'Yes' : 'No'}

User's Described Challenge:
"${challenge_text}"

Generate the 5-stage transformation roadmap in JSON format matching this schema:
[
  {
    "stage": "Cost Optimization",
    "title_hi": "${language === 'hi' ? 'लागत घटाएँ, समझदारी से खरीदें' : 'Cut costs and buy smarter'}",
    "description": "Clear explanation of how to optimize costs...",
    "action_items": ["Specific action 1", "Specific action 2", "Specific action 3"],
    "impact_milestone": "e.g. ₹2,000 monthly cost reduction"
  },
  {
    "stage": "Value Addition",
    "title_hi": "${language === 'hi' ? 'उसी माल की कीमत बढ़ाएँ' : 'Make the same product worth more'}",
    "description": "...",
    "action_items": ["..."],
    "impact_milestone": "..."
  },
  {
    "stage": "Direct Market Access",
    "title_hi": "${language === 'hi' ? 'सीधे बेचें, बिचौलिया हटाएँ' : 'Sell directly, skip the middleman'}",
    "description": "...",
    "action_items": ["..."],
    "impact_milestone": "..."
  },
  {
    "stage": "Formal Registration",
    "title_hi": "${language === 'hi' ? 'व्यापार का पंजीकरण कराएँ' : 'Register the business'}",
    "description": "...",
    "action_items": ["..."],
    "impact_milestone": "..."
  },
  {
    "stage": "Scale",
    "title_hi": "${language === 'hi' ? 'कर्ज़ नहीं, बचत से बढ़ें' : 'Grow with savings, not debt'}",
    "description": "...",
    "action_items": ["..."],
    "impact_milestone": "..."
  }
]`;

      try {
        const rawJson =
          (await generateText({
            prompt,
            systemInstruction,
            temperature: 0.2,
            json: true,
          })) || '[]';
        const parsedRoadmap: RoadmapStageItem[] = JSON.parse(rawJson);

        // Ensure 5 fixed stages are present and validated
        if (Array.isArray(parsedRoadmap) && parsedRoadmap.length === 5) {
          roadmap = parsedRoadmap.map((item, idx) => ({
            stage: FIXED_STAGES[idx],
            title_hi: item.title_hi || `${FIXED_STAGES[idx]}`,
            description: item.description || '',
            action_items: Array.isArray(item.action_items) ? item.action_items : [],
            impact_milestone: item.impact_milestone || '',
          }));
        } else {
          roadmap = generateFallbackRoadmap(sector, revenue, expense, challenge_text, language);
        }
      } catch (llmErr) {
        console.warn('Gemini roadmap generation error, using fallback:', llmErr);
        roadmap = generateFallbackRoadmap(sector, revenue, expense, challenge_text, language);
      }
    }

    // 2. Save roadmap into business_guides table
    const { data: savedGuide, error: guideError } = await supabaseServer
      .from('business_guides')
      .insert({
        user_id,
        input_text: challenge_text,
        roadmap_json: roadmap,
      })
      .select('id, created_at')
      .single();

    if (guideError) {
      console.error('Failed to save business guide:', guideError);
      // Still return the generated roadmap even if db insert has an issue
    }

    return NextResponse.json({
      success: true,
      guideId: savedGuide?.id || null,
      roadmap,
      createdAt: savedGuide?.created_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error('Business guide generate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
