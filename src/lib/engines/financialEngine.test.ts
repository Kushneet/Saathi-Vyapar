/**
 * financialEngine.test.ts
 * Vitest unit tests for the financial calculation engine.
 * Covers normal cases, zero values, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  explainPlain,
  calculateBreakEven,
  calculateNetProfit,
  calculateBreakEvenRevenue,
  calculateMarginPercent,
  assessCashFlowRisk,
  generateFinancialSummary,
} from './financialEngine';

// ─────────────────────────────────────────────────────────
// calculateBreakEven
// ─────────────────────────────────────────────────────────
describe('calculateBreakEven', () => {
  it('calculates break-even units correctly', () => {
    // Fixed: 10000, Price: 500, Variable: 300 → margin = 200 → 10000/200 = 50
    expect(calculateBreakEven(10000, 500, 300)).toBe(50);
  });

  it('returns Infinity when price equals variable cost (zero margin)', () => {
    expect(calculateBreakEven(10000, 300, 300)).toBe(Infinity);
  });

  it('returns Infinity when price is less than variable cost (negative margin)', () => {
    expect(calculateBreakEven(10000, 200, 300)).toBe(Infinity);
  });

  it('returns Infinity when fixedCosts is 0 and contribution margin is 0', () => {
    expect(calculateBreakEven(0, 100, 100)).toBe(Infinity);
  });

  it('returns 0 break-even when fixedCosts is 0 and contribution margin is positive', () => {
    expect(calculateBreakEven(0, 500, 300)).toBe(0);
  });

  it('handles large numbers correctly', () => {
    // 1 crore fixed, 1000 price, 800 variable → margin = 200 → 100000/200 = 500
    expect(calculateBreakEven(10000000, 1000, 800)).toBe(50000);
  });

  it('handles fractional results', () => {
    // 1000 / (500 - 350) = 1000 / 150 ≈ 6.666...
    const result = calculateBreakEven(1000, 500, 350);
    expect(result).toBeCloseTo(6.667, 2);
  });
});

// ─────────────────────────────────────────────────────────
// calculateMarginPercent
// ─────────────────────────────────────────────────────────
describe('calculateMarginPercent', () => {
  it('calculates a positive margin correctly', () => {
    // Revenue 10000, Expenses 7000 → margin = 30%
    expect(calculateMarginPercent(10000, 7000)).toBe(30);
  });

  it('calculates a negative margin (operating at a loss)', () => {
    // Revenue 5000, Expenses 8000 → margin = -60%
    expect(calculateMarginPercent(5000, 8000)).toBe(-60);
  });

  it('returns 0% margin when revenue equals expenses (break-even)', () => {
    expect(calculateMarginPercent(5000, 5000)).toBe(0);
  });

  it('returns 0 when revenue is 0 (avoids division by zero)', () => {
    expect(calculateMarginPercent(0, 5000)).toBe(0);
  });

  it('returns 100% margin when expenses are 0', () => {
    expect(calculateMarginPercent(10000, 0)).toBe(100);
  });

  it('handles very small margins accurately', () => {
    // Revenue 100000, Expenses 99000 → 1%
    expect(calculateMarginPercent(100000, 99000)).toBeCloseTo(1, 5);
  });

  it('returns 0 when both revenue and expenses are 0', () => {
    expect(calculateMarginPercent(0, 0)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
// assessCashFlowRisk
// ─────────────────────────────────────────────────────────
describe('assessCashFlowRisk', () => {
  it('returns low risk when expenses are well below revenue and no loans', () => {
    // ratio = 5000/10000 = 0.5 — below 0.7, no loans
    expect(assessCashFlowRisk(10000, 5000, false)).toBe('low');
  });

  it('returns medium risk when ratio is 0.7 and no loans', () => {
    // ratio = 7000/10000 = 0.7 → medium
    expect(assessCashFlowRisk(10000, 7000, false)).toBe('medium');
  });

  it('returns medium risk when ratio is below 0.7 but has existing loans', () => {
    // ratio = 0.5 < 0.7, but loans = true → medium
    expect(assessCashFlowRisk(10000, 5000, true)).toBe('medium');
  });

  it('returns high risk when ratio is >= 0.9', () => {
    // ratio = 9000/10000 = 0.9 → high
    expect(assessCashFlowRisk(10000, 9000, false)).toBe('high');
  });

  it('returns high risk when has loans and ratio >= 0.7', () => {
    // ratio = 0.7 with loans → high
    expect(assessCashFlowRisk(10000, 7000, true)).toBe('high');
  });

  it('returns high risk when revenue is 0', () => {
    expect(assessCashFlowRisk(0, 5000, false)).toBe('high');
  });

  it('returns high risk when revenue is 0 even with no expenses', () => {
    expect(assessCashFlowRisk(0, 0, false)).toBe('high');
  });

  it('returns medium risk when ratio is exactly 0.75 without loans', () => {
    // 0.7 <= 0.75 < 0.9 → medium
    expect(assessCashFlowRisk(10000, 7500, false)).toBe('medium');
  });

  it('returns low risk at exact boundary below medium (ratio 0.69)', () => {
    // ratio < 0.7 and no loans → low
    expect(assessCashFlowRisk(10000, 6900, false)).toBe('low');
  });
});

// ─────────────────────────────────────────────────────────
// generateFinancialSummary
// ─────────────────────────────────────────────────────────
describe('calculateNetProfit', () => {
  it('returns what is left after expenses', () => {
    expect(calculateNetProfit(30000, 20000)).toBe(10000);
  });

  it('goes negative when expenses exceed revenue', () => {
    expect(calculateNetProfit(5000, 7000)).toBe(-2000);
  });

  it('is zero at break-even', () => {
    expect(calculateNetProfit(20000, 20000)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
describe('calculateBreakEvenRevenue', () => {
  it('equals fixed costs when no variable-cost split is known', () => {
    expect(calculateBreakEvenRevenue(20000)).toBe(20000);
  });

  it('scales up as the contribution margin shrinks', () => {
    expect(calculateBreakEvenRevenue(10000, 0.5)).toBe(20000);
    expect(calculateBreakEvenRevenue(10000, 0.25)).toBe(40000);
  });

  it('is Infinity when the contribution margin is zero or negative', () => {
    expect(calculateBreakEvenRevenue(10000, 0)).toBe(Infinity);
    expect(calculateBreakEvenRevenue(10000, -0.1)).toBe(Infinity);
  });

  it('is zero when there are no costs to cover', () => {
    expect(calculateBreakEvenRevenue(0)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
describe('generateFinancialSummary', () => {
  it('returns correct structure for a healthy business', () => {
    const result = generateFinancialSummary({
      monthlyRevenueEst: 20000,
      monthlyExpenseEst: 10000,
      existingLoans: false,
    });
    expect(result).toHaveProperty('breakEvenRevenue');
    expect(result).toHaveProperty('marginPercent');
    expect(result).toHaveProperty('cashFlowRisk');
    expect(result).toHaveProperty('explanation');
    expect(result.cashFlowRisk).toBe('low');
    expect(result.marginPercent).toBe(50);
    expect(typeof result.explanation).toBe('string');
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it('returns high risk and correct margin for a stressed business', () => {
    const result = generateFinancialSummary({
      monthlyRevenueEst: 10000,
      monthlyExpenseEst: 9500,
      existingLoans: false,
    });
    expect(result.cashFlowRisk).toBe('high');
    expect(result.marginPercent).toBeCloseTo(5, 1);
  });

  it('handles zero revenue correctly', () => {
    const result = generateFinancialSummary({
      monthlyRevenueEst: 0,
      monthlyExpenseEst: 5000,
      existingLoans: false,
    });
    expect(result.cashFlowRisk).toBe('high');
    expect(result.marginPercent).toBe(0);
    // Earning nothing does not make the target infinite — you still need
    // ₹5,000 of sales to cover ₹5,000 of costs. The old formula
    // (expenses / revenue) returned Infinity here.
    expect(result.breakEvenRevenue).toBe(5000);
  });

  it('mentions loans in explanation when existingLoans is true', () => {
    const result = generateFinancialSummary({
      monthlyRevenueEst: 15000,
      monthlyExpenseEst: 8000,
      existingLoans: true,
    });
    expect(result.explanation).toContain('loan');
  });

  it('reports medium risk for moderate expense ratio with loans', () => {
    // ratio = 6000/15000 = 0.4 → normally low, but loans → medium
    const result = generateFinancialSummary({
      monthlyRevenueEst: 15000,
      monthlyExpenseEst: 6000,
      existingLoans: true,
    });
    expect(result.cashFlowRisk).toBe('medium');
  });

  it('reports break-even as the rupee sales target, not a ratio', () => {
    const result = generateFinancialSummary({
      monthlyRevenueEst: 30000,
      monthlyExpenseEst: 20000,
      existingLoans: false,
    });
    // The old code returned 20000/30000 = 0.67 and stored it as "units".
    expect(result.breakEvenRevenue).toBe(20000);
    expect(result.explanation).toContain('₹20000');
  });

  it('reports profit in rupees alongside the percentage', () => {
    const result = generateFinancialSummary({
      monthlyRevenueEst: 30000,
      monthlyExpenseEst: 20000,
      existingLoans: false,
    });
    expect(result.netProfit).toBe(10000);
    expect(result.explanation).toContain('₹10000');
  });

  it('marginPercent is negative when expenses exceed revenue', () => {
    const result = generateFinancialSummary({
      monthlyRevenueEst: 5000,
      monthlyExpenseEst: 7000,
      existingLoans: false,
    });
    expect(result.marginPercent).toBeLessThan(0);
    expect(result.explanation).toContain('loss');
  });
});

describe('explainPlain', () => {
  const summary = { netProfit: 21000, marginPercent: 84, breakEvenRevenue: 4000, cashFlowRisk: 'medium' as const };

  it('says the same figures in Hindi with no English words', () => {
    const text = explainPlain(summary, 'hi', true);
    expect(text).toContain('₹21,000');
    expect(text).toContain('₹4,000');
    expect(text).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('says the same figures in English with no Devanagari', () => {
    const text = explainPlain(summary, 'en', false);
    expect(text).toContain('₹21,000');
    expect(text).toContain('₹4,000');
    expect(text).not.toMatch(/[ऀ-ॿ]/);
    expect(text).not.toMatch(/instalment/);
  });

  it('never says "₹100 of every ₹100" for a margin just under 100', () => {
    const text = explainPlain({ ...summary, marginPercent: 99.93 }, 'en');
    expect(text).toContain('₹99.9 of every ₹100');
  });

  it('describes a loss as a shortfall', () => {
    expect(explainPlain({ ...summary, netProfit: -500, marginPercent: -5 }, 'en')).toMatch(/short by ₹500/);
  });
});
