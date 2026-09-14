/**
 * src/app/api/khata-mitr/route.ts
 *
 * Khata Mitra — Voice/Text AI Bookkeeping Assistant
 * Adapted from the standalone Khata-Mitr retailer/customer ledger app into
 * Saathi Vyapar's single-entrepreneur data model. Drives the configured
 * language model (src/lib/llm/provider.ts — Gemini or any OpenAI-compatible
 * endpoint) with function-calling tools that read/write this project's own
 * tables (ledger_entries, khata_customers, schemes).
 *
 * Voice notes go to the model as audio only on Gemini. On other providers
 * they are transcribed first, which itself needs GEMINI_API_KEY; without it
 * the route answers 422 and the client tells the user to type.
 *
 * POST body: { userId?, inputType: 'text' | 'audio', textPayload?, audioPayload?, history? }
 *
 * Who the entries are written for comes from the session cookie, not from
 * the body. `userId` only means "act on this entrepreneur's behalf" and is
 * honoured for a linked facilitator or an admin — the same rule every other
 * route follows. Without this, any caller could add entries (or customers
 * and udhaar) to any user's khata just by guessing an id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import {
  generateWithTools,
  llmAcceptsAudio,
  resolveLlmConfig,
  type ChatMessage,
  type ToolDefinition,
} from '@/lib/llm/provider';
import { transcribeAudio } from '@/lib/voice/transcribeAudio';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { matchSchemes, SchemeRecord } from '@/lib/engines/schemeMatcher';

// ── Tool Definitions ─────────────────────────────────────────────────────

const addLedgerEntryTool = {
  name: 'add_ledger_entry',
  description:
    'Records a new income (sale/payment received) or expense (purchase/bill paid) entry in the entrepreneur\'s daily cash book (khata). Use this whenever the user reports money coming in or going out, e.g. "आज 500 की बिक्री हुई" or "200 rupaye ka saman khareeda".',
  parameters: {
    type: 'object',
    properties: {
      entry_type: {
        type: 'string',
        enum: ['income', 'expense'],
        description: '"income" if money was received/earned, "expense" if money was spent.',
      },
      amount: { type: 'number', description: 'Amount in Indian Rupees (₹).' },
      description: {
        type: 'string',
        description: 'Short description of the transaction, e.g. "Daily sales", "Sugar purchase".',
      },
      category: {
        type: 'string',
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
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        description: 'Number of trailing days to summarize. Defaults to 30 if not specified.',
      },
    },
  },
};

const getRecentEntriesTool = {
  name: 'get_recent_entries',
  description: 'Retrieves the most recent ledger (khata) entries for the entrepreneur, in reverse chronological order.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'How many recent entries to return. Defaults to 5.' },
    },
  },
};

const checkSchemeEligibilityTool = {
  name: 'check_scheme_eligibility',
  description:
    'Checks which government schemes (loans, subsidies, credit) the entrepreneur is currently eligible for, based on their saved business profile. Use this when the user asks about sarkari yojana, loans, or subsidies. NEVER invent a scheme name or application link yourself — only report what this tool returns.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

const calculateTool = {
  name: 'calculate',
  description: 'Evaluates a basic mathematical expression, e.g. "150 + 200 * 3".',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'The mathematical expression to evaluate.' },
    },
    required: ['expression'],
  },
};

const findCustomerTool = {
  name: 'find_customer',
  description:
    'Searches for an existing named customer account (khata) belonging to this entrepreneur, by name. ALWAYS call this FIRST whenever the user mentions a customer/person\'s name for a credit or debit, e.g. "raaj ke khata me 500 dalo", "Ramesh ka balance kya hai". Returns customer_id if found, or not_found: true if no such account exists yet.',
  parameters: {
    type: 'object',
    properties: {
      customer_name: { type: 'string', description: 'The name (or partial name) of the customer to search for.' },
    },
    required: ['customer_name'],
  },
};

const createCustomerTool = {
  name: 'create_customer',
  description:
    'Creates a brand-new customer account (khata profile) for this entrepreneur. Only call this AFTER find_customer has returned not_found: true for that name — never create a duplicate for a name that already exists.',
  parameters: {
    type: 'object',
    properties: {
      customer_name: { type: 'string', description: 'Full name of the new customer, e.g. "Raaj".' },
      phone: { type: 'string', description: 'Optional phone number of the customer.' },
    },
    required: ['customer_name'],
  },
};

const addCustomerTransactionTool = {
  name: 'add_customer_transaction',
  description:
    'Records a credit or debit against an existing customer account. "credit" = the entrepreneur gave goods/money on udhaar, so the customer now owes MORE (balance increases). "debit" = the customer paid/settled money, so what they owe DECREASES. A plain instruction like "raaj ke khata me 500 dalo" / "add 500 in raaj account" means udhaar given — use type "credit" unless the user explicitly says the customer paid/returned/settled money (जमा/वापस/चुकाया), in which case use "debit". Requires a customer_id from find_customer or create_customer — never guess an ID.',
  parameters: {
    type: 'object',
    properties: {
      customer_id: { type: 'string', description: 'The UUID of the customer account, from find_customer/create_customer.' },
      type: { type: 'string', enum: ['credit', 'debit'], description: '"credit" = customer now owes more, "debit" = customer paid/owes less.' },
      amount: { type: 'number', description: 'Amount in Indian Rupees (₹).' },
      note: { type: 'string', description: 'Optional short note, e.g. "sugar, milk", "part payment".' },
    },
    required: ['customer_id', 'type', 'amount'],
  },
};

const getCustomerHistoryTool = {
  name: 'get_customer_history',
  description: 'Retrieves the current balance and recent transaction history for one customer account.',
  parameters: {
    type: 'object',
    properties: {
      customer_id: { type: 'string', description: 'The UUID of the customer account.' },
      limit: { type: 'integer', description: 'How many recent transactions to include. Defaults to 5.' },
    },
    required: ['customer_id'],
  },
};

const listCustomersTool = {
  name: 'list_customers',
  description: 'Lists all customer accounts (khata) this entrepreneur has, with their current balances. Use when the user asks "sab customers dikhao" / "who owes me money".',
  parameters: {
    type: 'object',
    properties: {},
  },
};

const khataMitraTools: ToolDefinition[] = [
  addLedgerEntryTool,
  getLedgerSummaryTool,
  getRecentEntriesTool,
  checkSchemeEligibilityTool,
  calculateTool,
  findCustomerTool,
  createCustomerTool,
  addCustomerTransactionTool,
  getCustomerHistoryTool,
  listCustomersTool,
];

// ── Request validation ───────────────────────────────────────────────────

const requestSchema = z.object({
  userId: z.string().uuid('Invalid user ID').optional(),
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
  try {
    // Identity first: an anonymous caller gets 401 whether or not the
    // model is configured, and learns nothing about the server's setup.
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
    }

    const body = await req.json();
    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 });
    }

    const { inputType, textPayload, audioPayload, history = [] } = parseResult.data;

    const userId = await resolveTargetUserId(auth.user, parseResult.data.userId);
    if (!userId) return forbidden();

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

    const systemInstruction = `You are Khata Mitra — a friendly, fully autonomous, action-first AI bookkeeping assistant for an Indian micro-entrepreneur using the Saathi Vyapar (साथी व्यापार) app. You help them log daily income/expenses, track credit/debit accounts with named customers, check their cash flow, and find matching government schemes — all through voice or text, in Hindi, English, or Hinglish.

CRITICAL OPERATIONAL RULES:
1. BE AN AGENT, NOT A CHATBOT: When the user reports a general sale/purchase (no customer name involved), immediately call add_ledger_entry. Do not ask for confirmation first — log it, then confirm what you did.
2. CUSTOMER ACCOUNTS — FIND THEN CREATE THEN TRANSACT: Whenever the user names a specific person for a credit/debit (e.g. "raaj ke khata me 500 dalo", "add 500 in raaj account", "Ramesh ne 200 diye"), you MUST chain tool calls automatically, with NO confirmation in between:
   a. Call find_customer with that name FIRST.
   b. If find_customer returns not_found: true, immediately call create_customer with that name — the account does not need to pre-exist, you create it on the spot.
   c. Then immediately call add_customer_transaction with the resulting customer_id.
   Never ask the user "should I create this account?" — just do it, then confirm what happened.
3. CREDIT VS DEBIT DEFAULT: A plain "add ₹X in <name>'s account" or "<name> ke khata me X dalo" means udhaar given — use type "credit" (customer now owes more). Only use "debit" when the user explicitly says the customer paid, returned, or settled money (जमा किया, वापस दिया, pay kiya).
4. LANGUAGE MATCHING: Always reply in the same language/script/style the user used (Hindi → Hindi, Hinglish → Hinglish, English → English).
5. SCHEMES: Only mention government scheme names, benefits, or links returned by check_scheme_eligibility. Never invent a scheme or a URL.
6. SUCCESS CONFIRMATION: After logging anything, confirm briefly with the name/amount/type, e.g. "Raaj ka account bana diya aur ₹500 udhaar (credit) jod diya gaya! Ab Raaj par ₹500 baaki hai. ✅"
7. Be concise — this is a voice-first interface, so keep spoken replies short and clear.

CURRENT USER CONTEXT:
${contextInfo}
Current Time: ${new Date().toISOString()}`;

    if (!resolveLlmConfig()) {
      return NextResponse.json(
        { error: 'No language model is configured (set GEMINI_API_KEY or LLM_BASE_URL).' },
        { status: 500 }
      );
    }

    let userMessage: Extract<ChatMessage, { role: 'user' }>;
    let loggedUserMessage = '';

    if (inputType === 'text') {
      if (!textPayload) {
        return NextResponse.json({ error: 'textPayload is required when inputType is "text"' }, { status: 400 });
      }
      userMessage = { role: 'user', content: textPayload };
      loggedUserMessage = textPayload;
    } else {
      if (!audioPayload) {
        return NextResponse.json({ error: 'audioPayload is required when inputType is "audio"' }, { status: 400 });
      }
      loggedUserMessage = lang === 'hi' ? '[आवाज़ संदेश]' : '[Voice Message]';

      if (llmAcceptsAudio()) {
        userMessage = {
          role: 'user',
          content: loggedUserMessage,
          audio: { mimeType: audioPayload.mimeType, base64: audioPayload.base64Data },
        };
      } else {
        // The configured model is text-only. Turn the recording into words
        // first; if that is not possible either, say so instead of guessing.
        const transcript = await transcribeAudio(
          Buffer.from(audioPayload.base64Data, 'base64'),
          audioPayload.mimeType
        );
        if (!transcript) {
          return NextResponse.json(
            {
              error:
                lang === 'hi'
                  ? 'आवाज़ अभी नहीं समझ पाया — कृपया लिखकर बताएँ।'
                  : 'Could not understand the voice note right now — please type it instead.',
              code: 'voice_unavailable',
            },
            { status: 422 }
          );
        }
        userMessage = { role: 'user', content: transcript.text };
        loggedUserMessage = transcript.text;
      }
    }

    const messages: ChatMessage[] = [
      ...history.slice(-6).map(
        (m): ChatMessage =>
          m.role === 'assistant' ? { role: 'assistant', content: m.content } : { role: 'user', content: m.content }
      ),
      userMessage,
    ];
    let finalAnswer = '';
    let iterations = 0;
    const MAX_ITERATIONS = 5;
    const executedTools: string[] = [];

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const turn = await generateWithTools({
        systemInstruction,
        messages,
        tools: khataMitraTools,
      });

      if (turn.toolCalls.length === 0) {
        finalAnswer = turn.text || '';
        break;
      }

      messages.push(turn.assistantMessage);

      // The team's loop answered only the first call per turn; a model that
      // asks for find_customer and get_ledger_summary together then saw a
      // reply to one and a silent drop of the other.
      for (const call of turn.toolCalls) {
        const name = call.name;
        const args = call.args;
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
          } else if (name === 'find_customer') {
            const { customer_name } = args as { customer_name: string };
            const searchName = customer_name.trim();

            const { data: matches, error } = await supabaseServer
              .from('khata_customers')
              .select('id, name, phone, balance')
              .eq('user_id', userId)
              .ilike('name', `%${searchName}%`);

            if (error) throw error;

            const exact = (matches || []).find((c) => c.name.toLowerCase() === searchName.toLowerCase());
            const match = exact || (matches && matches[0]);

            if (match) {
              toolResponse = {
                success: true,
                not_found: false,
                customer_id: match.id,
                customer_name: match.name,
                current_balance: match.balance,
                message: `Found "${match.name}" with customer_id ${match.id}, current balance ₹${match.balance}. Use this customer_id for add_customer_transaction. Do NOT call create_customer.`,
              };
            } else {
              toolResponse = {
                success: true,
                not_found: true,
                message: `No customer named "${customer_name}" found. Call create_customer to create this account now, then add_customer_transaction.`,
              };
            }
          } else if (name === 'create_customer') {
            const { customer_name, phone } = args as { customer_name: string; phone?: string };
            const cleanName = customer_name.trim();

            const { data: newCustomer, error } = await supabaseServer
              .from('khata_customers')
              .insert({ user_id: userId, name: cleanName, phone: phone || null })
              .select('id, name, balance')
              .single();

            if (error) throw error;
            toolResponse = {
              success: true,
              customer_id: newCustomer.id,
              customer_name: newCustomer.name,
              message: `Created new customer account "${newCustomer.name}" with customer_id ${newCustomer.id}. Now call add_customer_transaction with this customer_id.`,
            };
            executedTools.push(name);
          } else if (name === 'add_customer_transaction') {
            const { customer_id, type, amount, note } = args as {
              customer_id: string;
              type: 'credit' | 'debit';
              amount: number;
              note?: string;
            };

            const { error: txError } = await supabaseServer.from('khata_transactions').insert({
              customer_id,
              user_id: userId,
              type,
              amount: Number(amount),
              note: note || null,
            });
            if (txError) throw txError;

            const { data: updatedCustomer } = await supabaseServer
              .from('khata_customers')
              .select('name, balance')
              .eq('id', customer_id)
              .maybeSingle();

            toolResponse = {
              success: true,
              message: `Logged ${type} of ₹${amount} for ${updatedCustomer?.name || 'customer'}. New balance: ₹${updatedCustomer?.balance ?? 'unknown'}.`,
              new_balance: updatedCustomer?.balance,
            };
            executedTools.push(name);
          } else if (name === 'get_customer_history') {
            const { customer_id, limit } = args as { customer_id: string; limit?: number };

            const { data: customer } = await supabaseServer
              .from('khata_customers')
              .select('name, balance')
              .eq('id', customer_id)
              .maybeSingle();

            const { data: txs, error } = await supabaseServer
              .from('khata_transactions')
              .select('type, amount, note, created_at')
              .eq('customer_id', customer_id)
              .order('created_at', { ascending: false })
              .limit(limit || 5);

            if (error) throw error;
            toolResponse = {
              success: true,
              customer_name: customer?.name,
              current_balance: customer?.balance,
              history: txs || [],
            };
          } else if (name === 'list_customers') {
            const { data: customers, error } = await supabaseServer
              .from('khata_customers')
              .select('id, name, balance')
              .eq('user_id', userId)
              .order('balance', { ascending: false });

            if (error) throw error;
            toolResponse = { success: true, customers: customers || [], count: customers?.length || 0 };
          }
        } catch (err) {
          toolResponse = { success: false, error: err instanceof Error ? err.message : 'Unknown tool error' };
        }

        messages.push({ role: 'tool', toolCallId: call.id, name, result: toolResponse });
      }
    }

    if (!finalAnswer) {
      finalAnswer = lang === 'hi' ? 'काम हो गया है।' : 'Done.';
    }

    const dataChangingTools = ['add_ledger_entry', 'create_customer', 'add_customer_transaction'];
    const toolExecuted = executedTools.some((t) => dataChangingTools.includes(t));

    return NextResponse.json({ response: finalAnswer, toolExecuted, loggedUserMessage });
  } catch (error) {
    console.error('Error in Khata Mitra Assistant API:', error);
    const raw = error instanceof Error ? error.message : String(error);

    // The free Gemini tier allows roughly ten requests a minute and each
    // message here costs two. Say "wait a moment" rather than returning the
    // provider's JSON, which the client would print verbatim.
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
      return NextResponse.json(
        {
          error: 'साथी अभी व्यस्त है — 30 सेकंड बाद फिर कोशिश करें। / Assistant is busy — try again in 30 seconds.',
          code: 'rate_limited',
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error: 'अभी जवाब नहीं दे पाया — फिर कोशिश करें। / Could not answer right now — please try again.',
        code: 'model_error',
      },
      { status: 500 }
    );
  }
}
