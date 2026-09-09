/**
 * transcribeAudio.test.ts
 * Covers the audio-type gate. The Gemini call itself is not exercised here.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { isSupportedAudio, transcribeAudio } from './transcribeAudio';

describe('isSupportedAudio', () => {
  it('accepts the format WhatsApp actually sends', () => {
    // WhatsApp voice notes arrive as opus in an ogg container, with the
    // codec appended to the header.
    expect(isSupportedAudio('audio/ogg; codecs=opus')).toBe(true);
    expect(isSupportedAudio('audio/ogg')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isSupportedAudio('  AUDIO/MPEG  ')).toBe(true);
  });

  it('defaults to ogg when the type is missing', () => {
    expect(isSupportedAudio(undefined)).toBe(true);
  });

  it('rejects non-audio types', () => {
    expect(isSupportedAudio('image/jpeg')).toBe(false);
    expect(isSupportedAudio('video/mp4')).toBe(false);
    expect(isSupportedAudio('application/pdf')).toBe(false);
  });
});

describe('transcribeAudio', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns null rather than throwing when no API key is configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(await transcribeAudio(Buffer.from('x'), 'audio/ogg')).toBeNull();
  });

  it('refuses an unsupported type without calling out', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    expect(await transcribeAudio(Buffer.from('x'), 'image/png')).toBeNull();
  });

  it('refuses an oversized clip', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const tooBig = Buffer.alloc(11 * 1024 * 1024);
    expect(await transcribeAudio(tooBig, 'audio/ogg')).toBeNull();
  });
});
