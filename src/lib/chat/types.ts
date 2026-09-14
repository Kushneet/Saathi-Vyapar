/**
 * src/lib/chat/types.ts
 *
 * Shared shapes for the assistant panel.
 *
 * Kept separate from any UI so the panel can be built, replaced or dropped
 * without touching the data layer, and so the API route and the component
 * agree on one contract.
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * The entrepreneur's real figures, read from the database.
 *
 * This exists so the assistant can answer "how much did I make?" from stored
 * data rather than from a language model's memory of the conversation. Every
 * number the assistant is allowed to say must come from this object.
 */
export interface ChatContext {
  userId: string;
  name: string | null;
  language: 'en' | 'hi';
  profile: {
    sector: string | null;
    district: string | null;
    state: string | null;
    monthlyRevenue: number;
    monthlyExpense: number;
    existingLoans: boolean;
  } | null;
  finance: {
    netProfit: number;
    marginPercent: number;
    breakEvenRevenue: number;
    cashFlowRisk: 'low' | 'medium' | 'high';
  } | null;
  ledger: {
    last30DaysIncome: number;
    last30DaysExpense: number;
    entryCount: number;
  };
  schemes: {
    eligibleCount: number;
    topMatches: { name: string; reasons: string[]; applicationLink?: string }[];
  };
}

export interface ChatRequest {
  message: string;
  /** Prior turns, oldest first. The server caps how many it will use. */
  history?: ChatMessage[];
  /** Facilitator acting for a linked entrepreneur. */
  user_id?: string;
}

export interface ChatResponse {
  reply: string;
  /** 'data' when answered from stored figures, 'llm' when only phrased by one. */
  source: 'data' | 'llm' | 'fallback';
}
