import { describe, it, expect } from 'vitest';
import { spokenToDigits } from './spokenNumbers';
import { parseOcrText } from './ocrParser';

describe('spokenToDigits', () => {
  it('converts romanised Hindi amounts', () => {
    expect(spokenToDigits('bikri pandrah sau')).toBe('bikri 1500');
    expect(spokenToDigits('kharch aath sau')).toBe('kharch 800');
    expect(spokenToDigits('do hazaar')).toBe('2000');
  });

  it('converts Devanagari amounts', () => {
    expect(spokenToDigits('बिक्री पंद्रह सौ')).toBe('बिक्री 1500');
    expect(spokenToDigits('खर्च दो हज़ार')).toBe('खर्च 2000');
  });

  it('converts English amounts', () => {
    expect(spokenToDigits('sales two thousand')).toBe('sales 2000');
    expect(spokenToDigits('five hundred')).toBe('500');
  });

  it('reads a bare scale word as one of that scale', () => {
    // "sau rupaye" is a hundred rupees, not zero.
    expect(spokenToDigits('sau')).toBe('100');
    expect(spokenToDigits('hazaar')).toBe('1000');
  });

  it('combines scales', () => {
    expect(spokenToDigits('ek lakh pachas hazaar')).toBe('150000');
    expect(spokenToDigits('do hazaar paanch sau')).toBe('2500');
  });

  it('leaves digits and ordinary words alone', () => {
    expect(spokenToDigits('bikri 1500')).toBe('bikri 1500');
    expect(spokenToDigits('doodh bikri')).toBe('doodh bikri');
  });

  it('handles an empty transcript', () => {
    expect(spokenToDigits('')).toBe('');
  });
});

describe('spoken entry end to end', () => {
  it('feeds the same parser the photo flow uses', () => {
    // One dictated line per entry, exactly as the OCR path produces.
    const spoken = 'bikri pandrah sau\nkharch aath sau';
    const entries = parseOcrText(spokenToDigits(spoken));

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ amount: 1500, entry_type: 'income' });
    expect(entries[1]).toMatchObject({ amount: 800, entry_type: 'expense' });
  });
});
