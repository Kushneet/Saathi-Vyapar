/**
 * src/app/api/khata-mitr/route.ts
 *
 * Khata Mitra — Voice/Text AI Bookkeeping Assistant
 * Adapted from the standalone Khata-Mitr retailer/customer ledger app into
 * Saathi Vyapar's single-entrepreneur data model. Talks to Gemini with
 * function-calling tools that read/write this project's own tables
 * (ledger_entries, business_profiles, schemes) instead of Khata Mitr's
 * original (profiles/relationships/transactions) schema.
 *
 * POST body: { userId, inputType: 'text' | 'audio', textPayload?, audioPayload?, history? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { matchSchemes, SchemeRecord } from '@/lib/engines/schemeMatcher';

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
}

// ── Tool Definitions ─────────────────────────────────────────────────────

const addLedgerEntryTool = {
  name: 'add_ledger_entry',
  description:
    'Records a new income (sale/payment received) or expense (purchase/bill paid) entry in the entrepreneur\'s daily cash book (khata). Use this whenever the user reports money coming in or going out, e.g. "आज 500 की बिक्री हुई" or "200 rupaye ka saman khareeda".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      entry_type: {
        type: Type.STRING,
        enum: ['income', 'expense'],
        description: '"income" if money was received/earned, "expense" if money was spent.',
      },
      amount: { type: Type.NUMBER, description: 'Amount in Indian Rupees (₹).' },
      description: {
        type: Type.STRING,
        description: 'Short description of the transaction, e.g. "Daily sales", "Sugar purchase".',
      },
      category: {
        type: Type.STRING,
        description: 'Optional category, e.g. "sales", "stock", "electricity", "rent", "transport".',
      },
    },
    required: ['entry_type', 'amount'],
  },
};

const getLedgerSummaryTool = {
  name: 'get_ledger_summary',
  description:
    'Retrieves total income, total expense, net profit and margin for the entrepreneur over a recent period. Use this when the user asks about their balance, profit, or overall cash flow.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      days: {
        type: Type.INTEGER,
        description: 'Number of trailing days to summarize. Defaults to 30 if not specified.',
      },
    },
  },
};

const getRecentEntriesTool = {
  name: 'get_recent_entries',
  description: 'Retrieves the most recent ledger (khata) entries for the entrepreneur, in reverse chronological order.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      limit: { type: Type.INTEGER, description: 'How many recent entries to return. Defaults to 5.' },
    },
  },
};

const checkSchemeEligibilityTool = {
  name: 'check_scheme_eligibility',
  description:
    'Checks which government schemes (loans, subsidies, credit) the entrepreneur is currently eligible for, based on their saved business profile. Use this when the user asks about sarkari yojana, loans, or subsidies. NEVER invent a scheme name or application link yourself — only report what this tool returns.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const calculateTool = {
  name: 'calculate',
  description: 'Evaluates a basic mathematical expression, e.g. "150 + 200 * 3".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      expression: { type: Type.STRING, description: 'The mathematical expression to evaluate.' },
    },
    required: ['expression'],
  },
};

const khataMitraTools = [
  addLedgerEntryTool,
  getLedgerSummaryTool,
  getRecentEntriesTool,
  checkSchemeEligibilityTool,
  calculateTool,
];

// ── Request validation ───────────────────────────────────────────────────

const requestSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  inputType: z.enum(['text', 'audio']),
  textPayload: z.string().optional(),
  audioPayload: z
    .object({
      mimeType: z.string(),
      base64Data: z.string(),
    })
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

function pruneHistory(history: { role: 'user' | 'assistant'; content: string }[]) {
  return history.slice(-6).map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

const FALLBACK_SCHEMES: SchemeRecord[] = [
  {
    id: 'pmegp',
    name: "PMEGP - Prime Minister's Employment Generation Programme",
    description: 'Credit-linked subsidy programme for micro-enterprises in non-farm sector.',
    benefit_summary: '15% to 35% project cost subsidy (up to ₹25 Lakh loan) via KVIC & partner banks.',
    application_link: 'https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp',
    eligibility_rules: { income_max: 10000000, sector: ['manufacturing', 'services', 'retail', 'food_processing'], loan_amount_min: 100000, loan_amount_max: 2500000 },
  },
  {
    id: 'mudra-shishu',
    name: 'Mudra Shishu Loan (PMMY)',
    description: 'Collateral-free micro-loans for starting or running small village shops.',
    benefit_summary: 'Zero collateral, loans up to ₹50,000 with nominal interest rates.',
    application_link: 'https://www.mudra.org.in/',
    eligibility_rules: { income_max: 2500000, loan_amount_min: 1000, loan_amount_max: 50000 },
  },
  {
    id: 'pm-svanidhi',
    name: 'PM SVANidhi (Street Vendors Scheme)',
    description: 'Affordable working capital credit to formalize and grow small local trade.',
    benefit_summary: 'Staged loans from ₹10,000 to ₹50,000 with 7% interest subsidy cashback.',
    application_link: 'https://pmsvanidhi.mohua.gov.in/',
    eligibility_rules: { income_max: 1200000, sector: ['retail', 'services'], loan_amount_min: 10000, loan_amount_max: 50000 },
  },
];

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 });
    }

    const { userId, inputType, textPayload, audioPayload, history = [] } = parseResult.data;

    // 1. Resolve user + business profile context
    const { data: user } = await supabaseServer
      .from('users')
      .select('id, name, phone, language')
      .eq('id', userId)
      .maybeSingle();

    const { data: profile } = await supabaseServer
      .from('business_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lang = user?.language || 'hi';

    let contextInfo = `User ID: ${userId}\n`;
    contextInfo += `User Name: ${user?.name || 'Entrepreneur'}\n`;
    if (profile) {
      contextInfo += `Business Name: ${profile.business_name || 'N/A'}\n`;
      contextInfo += `Sector: ${profile.sector || 'general'}\n`;
      contextInfo += `Monthly Revenue Estimate: ₹${profile.monthly_revenue_est || 0}\n`;
      contextInfo += `Monthly Expense Estimate: ₹${profile.monthly_expense_est || 0}\n`;
    } else {
      contextInfo += `(No business profile saved yet.)\n`;
    }

    const systemInstruction = `You are Khata Mitra — a friendly, fully autonomous, action-first AI bookkeeping assistant for an Indian micro-entrepreneur using the Saathi Vyapar (साथी व्यापार) app. You help them log daily income/expenses, check their cash flow, and find matching government schemes — all through voice or text, in Hindi, English, or Hinglish.

CRITICAL OPERATIONAL RULES:
1. BE AN AGENT, NOT A CHATBOT: When the user reports a transaction (sale, purchase, payment, bill), immediately call add_ledger_entry. Do not ask for confirmation first — log it, then confirm what you did.
2. LANGUAGE MATCHING: Always reply in the same language/script/style the user used (Hindi → Hindi, Hinglish → Hinglish, English → English).
3. SCHEMES: Only mention government scheme names, benefits, or links returned by check_scheme_eligibility. Never invent a scheme or a URL.
4. SUCCESS CONFIRMATION: After logging an entry, confirm briefly with the amount and type, e.g. "₹500 ki bikri add kar di gayi! ✅"
5. Be concise — this is a voice-first interface, so keep spoken replies short and clear.

CURRENT USER CONTEXT:
${contextInfo}
Current Time: ${new Date().toISOString()}`;

    let userPart: { text: string } | { inlineData: { mimeType: string; data: string } };
    let loggedUserMessage = '';

    if (inputType === 'text') {
      if (!textPayload) {
        return NextResponse.json({ error: 'textPayload is required when inputType is "text"' }, { status: 400 });
      }
      userPart = { text: textPayload };
      loggedUserMessage = textPayload;
    } else {
      if (!audioPayload) {
        return NextResponse.json({ error: 'audioPayload is required when inputType is "audio"' }, { status: 400 });
      }
      userPart = { inlineData: { mimeType: audioPayload.mimeType, data: audioPayload.base64Data } };
      loggedUserMessage = lang === 'hi' ? '[आवाज़ संदेश]' : '[Voice Message]';
    }

    const userContentPart = { role: 'user', parts: [userPart] };
    const model = 'gemini-3.6-flash';
    const ai = getAI();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentContents: any[] = [...pruneHistory(history), userContentPart];
    let finalAnswer = '';
    let iterations = 0;
    const MAX_ITERATIONS = 5;
    const executedTools: string[] = [];

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await ai.models.generateContent({
        model,
        contents: currentContents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: khataMitraTools }],
        },
      });

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        finalAnswer = response.text || '';
        break;
      }

      // Preserve the model's actual response content (including any thoughtSignature
      // Gemini 3.x attaches to function-call parts) rather than reconstructing a bare
      // functionCall — replaying without it is rejected with an INVALID_ARGUMENT error.
      const modelTurn = response.candidates?.[0]?.content ?? {
        role: 'model',
        parts: functionCalls.map((fc) => ({ functionCall: fc })),
      };

      const call = functionCalls[0];
      const name = call.name ?? '';
      const args = (call.args as Record<string, unknown>) || {};
      let toolResponse: Record<string, unknown> = { success: false, message: 'Tool not recognised' };

      try {
        if (name === 'add_ledger_entry') {
          const { entry_type, amount, description, category } = args as {
            entry_type: 'income' | 'expense';
            amount: number;
            description?: string;
            category?: string;
          };

          const { error } = await supabaseServer.from('ledger_entries').insert({
            user_id: userId,
            amount: Number(amount),
            entry_type,
            description: description || (entry_type === 'income' ? 'Sales' : 'Expense'),
            category: category || 'general',
            source: 'voice',
            confirmed: true,
          });

          if (error) throw error;
          toolResponse = {
            success: true,
            message: `Logged ${entry_type} of ₹${amount}.`,
          };
          executedTools.push(name);
        } else if (name === 'get_ledger_summary') {
          const { days } = args as { days?: number };
          const sinceDate = new Date();
          sinceDate.setDate(sinceDate.getDate() - (days || 30));

          const { data: entries, error } = await supabaseServer
            .from('ledger_entries')
            .select('amount, entry_type')
            .eq('user_id', userId)
            .gte('created_at', sinceDate.toISOString());

          if (error) throw error;

          const totalIncome = (entries || [])
            .filter((e) => e.entry_type === 'income')
            .reduce((sum, e) => sum + Number(e.amount), 0);
          const totalExpense = (entries || [])
            .filter((e) => e.entry_type === 'expense')
            .reduce((sum, e) => sum + Number(e.amount), 0);

          toolResponse = {
            success: true,
            total_income: totalIncome,
            total_expense: totalExpense,
            net_profit: totalIncome - totalExpense,
            entry_count: entries?.length || 0,
            period_days: days || 30,
          };
        } else if (name === 'get_recent_entries') {
          const { limit } = args as { limit?: number };
          const { data: entries, error } = await supabaseServer
            .from('ledger_entries')
            .select('amount, entry_type, description, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit || 5);

          if (error) throw error;
          toolResponse = { success: true, entries: entries || [] };
        } else if (name === 'check_scheme_eligibility') {
          let dbSchemes: SchemeRecord[] | null = null;
          try {
            const { data } = await supabaseServer.from('schemes').select('*');
            dbSchemes = data as SchemeRecord[] | null;
          } catch {
            /* fallback below */
          }

          const schemesToMatch = dbSchemes && dbSchemes.length > 0 ? dbSchemes : FALLBACK_SCHEMES;
          const matched = matchSchemes(
            {
              monthly_revenue_est: Number(profile?.monthly_revenue_est) || 25000,
              monthly_expense_est: Number(profile?.monthly_expense_est) || 15000,
              existing_loans: Boolean(profile?.existing_loans),
              sector: profile?.sector || 'retail',
              category: profile?.category || 'general',
              gender: profile?.gender || 'male',
              state: profile?.state || 'Uttar Pradesh',
            },
            schemesToMatch
          );

          const eligible = matched
            .filter((m) => m.eligible)
            .slice(0, 5)
            .map((m) => ({
              name: m.scheme.name,
              benefit: m.scheme.benefit_summary,
              application_link: m.scheme.application_link,
            }));

          toolResponse = { success: true, eligible_schemes: eligible, count: eligible.length };
        } else if (name === 'calculate') {
          const { expression } = args as { expression: string };
          try {
            const cleanExpr = expression.replace(/[^0-9+\-*/().\s]/g, '');
            const result = Function(`"use strict"; return (${cleanExpr})`)();
            toolResponse = { success: true, expression, result };
          } catch {
            toolResponse = { success: false, error: 'Invalid mathematical expression' };
          }
        }
      } catch (err) {
        toolResponse = { success: false, error: err instanceof Error ? err.message : 'Unknown tool error' };
      }

      currentContents = [
        ...currentContents,
        modelTurn,
        { role: 'user', parts: [{ functionResponse: { name, response: toolResponse } }] },
      ];
    }

    if (!finalAnswer) {
      finalAnswer = lang === 'hi' ? 'काम हो गया है।' : 'Done.';
    }

    const dataChangingTools = ['add_ledger_entry'];
    const toolExecuted = executedTools.some((t) => dataChangingTools.includes(t));

    return NextResponse.json({ response: finalAnswer, toolExecuted, loggedUserMessage });
  } catch (error) {
    console.error('Error in Khata Mitra Assistant API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
