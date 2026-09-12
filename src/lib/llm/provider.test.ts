import { describe, it, expect } from 'vitest';
import { resolveLlmConfig, stripCodeFence } from './provider';

describe('resolveLlmConfig', () => {
  it('uses Gemini when only a Gemini key is present', () => {
    const c = resolveLlmConfig({ GEMINI_API_KEY: 'k' });
    expect(c?.provider).toBe('gemini');
    expect(c?.model).toBe('gemini-2.5-flash');
  });

  it('uses a self-hosted endpoint when a base URL is set', () => {
    const c = resolveLlmConfig({
      LLM_BASE_URL: 'http://localhost:11434/v1',
      LLM_MODEL: 'sarvam-2b',
    });
    expect(c?.provider).toBe('openai-compatible');
    expect(c?.baseUrl).toBe('http://localhost:11434/v1');
    expect(c?.model).toBe('sarvam-2b');
  });

  it('lets the self-hosted endpoint win over a leftover Gemini key', () => {
    // Demo case: the key is still in .env.local but the laptop model should serve.
    const c = resolveLlmConfig({
      LLM_BASE_URL: 'http://localhost:11434/v1',
      GEMINI_API_KEY: 'k',
    });
    expect(c?.provider).toBe('openai-compatible');
  });

  it('honours an explicit provider choice', () => {
    const c = resolveLlmConfig({
      LLM_PROVIDER: 'gemini',
      LLM_BASE_URL: 'http://localhost:11434/v1',
      GEMINI_API_KEY: 'k',
    });
    expect(c?.provider).toBe('gemini');
  });

  it('trims a trailing slash off the base URL', () => {
    const c = resolveLlmConfig({
      LLM_BASE_URL: 'http://localhost:11434/v1/',
    });
    expect(c?.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('returns null when nothing is configured, so callers fall back', () => {
    expect(resolveLlmConfig({})).toBeNull();
    expect(resolveLlmConfig({ LLM_PROVIDER: 'openai-compatible' })).toBeNull();
  });
});

describe('stripCodeFence', () => {
  it('unwraps fenced JSON, which small local models emit constantly', () => {
    expect(stripCodeFence('```json\n{"name":"Ramesh"}\n```')).toBe('{"name":"Ramesh"}');
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves unfenced text alone', () => {
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
    expect(stripCodeFence('Plain sentence.')).toBe('Plain sentence.');
  });

  it('does not mangle a fence-like string inside the JSON', () => {
    expect(stripCodeFence('{"note":"use ``` carefully"}')).toBe('{"note":"use ``` carefully"}');
  });
});
