/**
 * ocrParser.test.ts
 * Pure parsing/classification rules — no Tesseract, no DB, no network.
 */

import { describe, it, expect } from 'vitest';
import { parseOcrText, classifyEntryType, summariseEntries } from './ocrParser';

describe('classifyEntryType', () => {
  it('detects expenses written in Devanagari', () => {
    expect(classifyEntryType('खर्च 500').type).toBe('expense');
    expect(classifyEntryType('किराया 2000').type).toBe('expense');
  });

  it('detects expenses written in romanised Hindi', () => {
    expect(classifyEntryType('Kharch 500').type).toBe('expense');
    expect(classifyEntryType('bijli bill 340').type).toBe('expense');
  });

  it('detects expenses written in English', () => {
    expect(classifyEntryType('Stock purchase 1200').type).toBe('expense');
    expect(classifyEntryType('Paid to supplier 900').type).toBe('expense');
  });

  it('detects income in all three registers', () => {
    expect(classifyEntryType('बिक्री 1500').type).toBe('income');
    expect(classifyEntryType('Bikri 1500').type).toBe('income');
    expect(classifyEntryType('Daily sales 1500').type).toBe('income');
  });

  it('prefers expense when a line carries both markers', () => {
    // Mislabelling an expense as income inflates revenue, which is worse.
    expect(classifyEntryType('Sale stock purchase 400').type).toBe('expense');
  });

  it('marks an unclassifiable line as low confidence', () => {
    expect(classifyEntryType('Rice 150')).toEqual({ type: 'income', confidence: 'low' });
  });
});

describe('parseOcrText', () => {
  it('keeps expense lines out of income — the bug this replaces', () => {
    const entries = parseOcrText(['Bikri 1500', 'Kharch 800'].join('\n'));

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ amount: 1500, entry_type: 'income' });
    expect(entries[1]).toMatchObject({ amount: 800, entry_type: 'expense' });
  });

  it('parses "Label: amount" lines including Devanagari labels', () => {
    const entries = parseOcrText('कुल खर्च: ₹2,500');
    expect(entries[0]).toMatchObject({ amount: 2500, entry_type: 'expense' });
  });

  it('strips thousands separators and currency markers', () => {
    expect(parseOcrText('Total sales 1,25,000')[0].amount).toBe(125000);
    expect(parseOcrText('₹450')[0].amount).toBe(450);
  });

  it('ignores date-like lines, blanks and implausible amounts', () => {
    const entries = parseOcrText(['12/09 entry', '', 'x', 'Sale 99999999999'].join('\n'));
    expect(entries).toHaveLength(0);
  });

  it('summarises income, expense and net', () => {
    const entries = parseOcrText(['Bikri 2000', 'Kharch 750'].join('\n'));
    expect(summariseEntries(entries)).toEqual({ income: 2000, expense: 750, net: 1250 });
  });
});

describe('parseOcrText — spoken or typed sentences', () => {
  it('finds the amount in the middle of a sentence', () => {
    expect(parseOcrText('aaj 2400 ki bikri hui')).toEqual([
      { amount: 2400, entry_type: 'income', description: 'bikri', confidence: 'high' },
    ]);
  });

  it('reads an English sentence', () => {
    const [e] = parseOcrText('sold 500 today');
    expect(e.amount).toBe(500);
    expect(e.entry_type).toBe('income');
    expect(e.description).toBe('sold');
  });

  it('does not guess when a sentence has two numbers', () => {
    expect(parseOcrText('2 kg aloo kharida 60 rupaye me')).toEqual([]);
  });
});
