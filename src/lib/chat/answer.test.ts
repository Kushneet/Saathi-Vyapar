import { describe, it, expect, vi, afterEach } from 'vitest';
import { answerQuestion } from './answer';
import type { ChatContext } from './types';

const context: ChatContext = {
  userId: 'u1',
  name: 'Ramesh',
  language: 'en',
  profile: {
    sector: 'retail',
    district: 'Satara',
    state: 'Maharashtra',
    monthlyRevenue: 45000,
    monthlyExpense: 28000,
    existingLoans: false,
  },
  finance: {
    netProfit: 17000,
    marginPercent: 37.8,
    breakEvenRevenue: 28000,
    cashFlowRisk: 'low',
  },
  ledger: { last30DaysIncome: 4250, last30DaysExpense: 2340, entryCount: 5 },
  schemes: {
    eligibleCount: 3,
    topMatches: [{ name: 'Mudra Shishu Loan (PMMY)', reasons: ['✓ within limit'] }],
  },
};

afterEach(() => vi.unstubAllEnvs());

describe('answerQuestion — answered from stored figures', () => {
  it('quotes the profit the dashboard shows, not a generated number', async () => {
    const r = await answerQuestion('kitna bacha', context);
    expect(r.source).toBe('data');
    expect(r.reply).toContain('17,000');
  });

  it('answers the break-even question in rupees', async () => {
    const r = await answerQuestion('kitna bechna hai', context);
    expect(r.source).toBe('data');
    expect(r.reply).toContain('28,000');
  });

  it('answers scheme questions with the matched count', async () => {
    const r = await answerQuestion('kaunsi yojana milegi', context);
    expect(r.source).toBe('data');
    expect(r.reply).toContain('3');
    expect(r.reply).toContain('Mudra');
  });

  it('reports the ledger totals for the last 30 days', async () => {
    const r = await answerQuestion('mera kharch kitna hai', context);
    expect(r.source).toBe('data');
    expect(r.reply).toContain('4,250');
    expect(r.reply).toContain('2,340');
  });

  it('understands the same question in Devanagari', async () => {
    const r = await answerQuestion('इस महीने कितना बचा', context);
    expect(r.source).toBe('data');
    expect(r.reply).toContain('17,000');
  });
});

describe('answerQuestion — nothing to answer from', () => {
  it('falls back rather than inventing a figure when no model is configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    const r = await answerQuestion('what colour should my shop sign be', context);
    expect(r.source).toBe('fallback');
    expect(r.reply.length).toBeGreaterThan(0);
  });

  it('does not claim a profit when the profile is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    const empty: ChatContext = {
      ...context,
      profile: null,
      finance: null,
      ledger: { last30DaysIncome: 0, last30DaysExpense: 0, entryCount: 0 },
      schemes: { eligibleCount: 0, topMatches: [] },
    };
    const r = await answerQuestion('kitna bacha', empty);
    expect(r.source).toBe('fallback');
    expect(r.reply).not.toMatch(/₹\s*\d/);
  });
});
