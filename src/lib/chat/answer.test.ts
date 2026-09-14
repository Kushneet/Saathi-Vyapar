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
    all: [
      {
        id: 'mudra-shishu', name: 'Mudra Shishu Loan (PMMY)', kind: 'loan',
        benefit: 'Collateral-free loans up to ₹50,000.', eligible: true,
        reasons: ['✓ Your annual revenue (₹3,00,000) is within the scheme limit (₹25,00,000)'],
        documents: ['आधार कार्ड (Aadhaar Card)', 'पैन कार्ड / फॉर्म 60 (PAN Card)', 'बैंक खाता पासबुक (Bank Account Details)'],
        applicationLink: 'https://www.mudra.org.in/',
      },
      {
        id: 'stand-up-india', name: 'Stand-Up India — SC/ST & Women', kind: 'loan',
        benefit: 'Loans ₹10 Lakh–₹1 Crore for greenfield projects.', eligible: false,
        reasons: ['✗ This scheme is specifically for female entrepreneurs'],
        documents: [], applicationLink: 'https://www.standupmitra.in/',
      },
      {
        id: 'pmkvy', name: 'PMKVY — PM Kaushal Vikas Yojana', kind: 'training',
        benefit: 'Free skills training with certificate.', eligible: true,
        reasons: ['✓ You appear to meet all eligibility criteria for this scheme'], documents: [],
      },
    ],
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
      schemes: { eligibleCount: 0, topMatches: [], all: [] },
    };
    const r = await answerQuestion('kitna bacha', empty);
    expect(r.source).toBe('fallback');
    expect(r.reply).not.toMatch(/₹\s*\d/);
  });
});

describe('answerQuestion — scheme questions from data', () => {
  it('describes a named scheme: what it gives, whether you qualify, papers', async () => {
    const res = await answerQuestion('mudra loan kya hai?', { ...context, language: 'en' });
    expect(res.source).toBe('data');
    expect(res.reply).toContain('Mudra Shishu');
    expect(res.reply).toContain('₹50,000');
    expect(res.reply).toMatch(/you can get it|You qualify/i);
    expect(res.reply).toContain('Aadhaar');
  });

  it('says why a scheme is not for you', async () => {
    const res = await answerQuestion('stand up india milega?', { ...context, language: 'hi' });
    expect(res.source).toBe('data');
    expect(res.reply).toMatch(/महिला|नहीं/);
  });

  it('lists loans you can get when asked for loans', async () => {
    const res = await answerQuestion('which loans can I get?', { ...context, language: 'en' });
    expect(res.source).toBe('data');
    expect(res.reply).toContain('Mudra Shishu');
    expect(res.reply).not.toContain('PMKVY');
  });

  it('lists training when asked for training', async () => {
    const res = await answerQuestion('koi training milegi?', { ...context, language: 'en' });
    expect(res.reply).toContain('PMKVY');
  });
});
