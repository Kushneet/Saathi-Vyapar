import { describe, it, expect } from 'vitest';
import { detectMessageLanguage } from './detectLanguage';

describe('detectMessageLanguage', () => {
  it('treats Devanagari as Hindi', () => {
    expect(detectMessageLanguage('मेरी दुकान की कमाई पंद्रह हजार है')).toEqual({
      language: 'hi',
      confident: true,
    });
  });

  it('treats romanised Hindi as Hindi, not English', () => {
    // The case a Latin-script test gets wrong, and the most common one here.
    expect(detectMessageLanguage('mera kirana dukan hai gaon mein').language).toBe('hi');
    expect(detectMessageLanguage('kharcha bahut zyada hai is mahine').language).toBe('hi');
  });

  it('detects English', () => {
    expect(detectMessageLanguage('my monthly income is around fifteen thousand')).toEqual({
      language: 'en',
      confident: true,
    });
  });

  it('never lets a one-word answer overwrite the stored preference', () => {
    // "haan" and "no" are answers to a yes/no question, not a language choice.
    expect(detectMessageLanguage('haan').confident).toBe(false);
    expect(detectMessageLanguage('no').confident).toBe(false);
    expect(detectMessageLanguage('yes').confident).toBe(false);
  });

  it('reads a bare number as carrying no language signal', () => {
    expect(detectMessageLanguage('15000').confident).toBe(false);
    expect(detectMessageLanguage('').confident).toBe(false);
  });

  it('classifies mixed Hinglish by its Hindi tokens', () => {
    expect(detectMessageLanguage('shop ka kharcha 8000 hai').language).toBe('hi');
  });
});
