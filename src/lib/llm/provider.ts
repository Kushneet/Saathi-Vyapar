/**
 * src/lib/llm/provider.ts
 *
 * One place the app asks a language model for text.
 *
 * Three routes each built their own GoogleGenAI client, so the provider was
 * hard-wired to Gemini in three places. This makes it a configuration choice,
 * which is what allows a self-hosted Indic model (Sarvam, Gemma, Qwen) to be
 * demoed from a laptop and later moved to a hosted endpoint without touching
 * route code.
 *
 * Two backends:
 *   - 'gemini'            — Google Gemini via @google/genai
 *   - 'openai-compatible' — anything exposing /v1/chat/completions: Ollama,
 *                           vLLM, llama.cpp server, Hugging Face router,
 *                           or a dedicated HF Inference Endpoint
 *
 * The contract everywhere is: return the text, or null. Never throw, never
 * invent. Every caller already has a deterministic fallback, so a model that
 * is slow, down, or not configured degrades to rule-based output rather than
 * failing the request. That is also why the financial arithmetic is not here
 * — it runs in src/lib/engines, whatever the model does.
 */

import { GoogleGenAI } from '@google/genai';

export type LlmProvider = 'gemini' | 'openai-compatible';

export interface LlmRequest {
  prompt: string;
  systemInstruction?: string;
  /** 0 for extraction, higher for phrasing. Defaults to 0.2. */
  temperature?: number;
  /** Ask for a JSON object back. */
  json?: boolean;
}

/** Default ceiling for a single call. A 2B model on a laptop CPU is not fast. */
const DEFAULT_TIMEOUT_MS = 30000;

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
}

/**
 * Work out which backend to use.
 *
 * Explicit LLM_PROVIDER wins. Otherwise an LLM_BASE_URL implies a self-hosted
 * endpoint, and a GEMINI_API_KEY implies Gemini. Nothing configured returns
 * null and the callers fall back to deterministic output.
 */
export function resolveLlmConfig(
  env: Record<string, string | undefined> = process.env
): LlmConfig | null {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  const baseUrl = env.LLM_BASE_URL?.trim();
  const timeoutMs = Number(env.LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  if (explicit === 'openai-compatible' || (!explicit && baseUrl)) {
    if (!baseUrl) return null;
    return {
      provider: 'openai-compatible',
      // Ollama ignores an absent key; hosted endpoints need one.
      apiKey: env.LLM_API_KEY?.trim() || undefined,
      baseUrl: baseUrl.replace(/\/$/, ''),
      model: env.LLM_MODEL?.trim() || 'sarvam-2b',
      timeoutMs,
    };
  }

  if (explicit === 'gemini' || (!explicit && env.GEMINI_API_KEY)) {
    if (!env.GEMINI_API_KEY) return null;
    return {
      provider: 'gemini',
      apiKey: env.GEMINI_API_KEY,
      model: env.LLM_MODEL?.trim() || 'gemini-2.5-flash',
      timeoutMs,
    };
  }

  return null;
}

/**
 * Strip markdown fences from a model reply.
 *
 * Small self-hosted models routinely wrap JSON in ```json ... ``` even when
 * asked not to, which makes JSON.parse throw and sends a perfectly good
 * answer to the fallback path. Gemini rarely does this; a 2B model often does.
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

async function callGemini(config: LlmConfig, req: LlmRequest): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey! });

  const response = await ai.models.generateContent({
    model: config.model,
    contents: req.prompt,
    config: {
      systemInstruction: req.systemInstruction,
      temperature: req.temperature ?? 0.2,
      ...(req.json ? { responseMimeType: 'application/json' } : {}),
    },
  });

  return response.text?.trim() || null;
}

async function callOpenAiCompatible(
  config: LlmConfig,
  req: LlmRequest
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const messages: { role: string; content: string }[] = [];
    if (req.systemInstruction) {
      messages.push({ role: 'system', content: req.systemInstruction });
    }
    messages.push({ role: 'user', content: req.prompt });

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: req.temperature ?? 0.2,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      console.error(`LLM endpoint returned ${response.status}:`, await response.text());
      return null;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate text from the configured model.
 *
 * @returns The reply, or null when no model is configured or the call failed.
 *          Callers must handle null with their deterministic fallback.
 */
export async function generateText(req: LlmRequest): Promise<string | null> {
  const config = resolveLlmConfig();

  if (!config) {
    return null;
  }

  try {
    const text =
      config.provider === 'gemini'
        ? await callGemini(config, req)
        : await callOpenAiCompatible(config, req);

    if (!text) return null;

    return req.json ? stripCodeFence(text) : text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`LLM call timed out after ${config.timeoutMs}ms (${config.model})`);
    } else {
      console.error(`LLM call failed (${config.provider}/${config.model}):`, err);
    }
    return null;
  }
}

/** Which model is answering, for logs and the health endpoint. */
export function describeLlm(): string {
  const config = resolveLlmConfig();
  if (!config) return 'none (deterministic fallback only)';
  return config.provider === 'gemini'
    ? `gemini:${config.model}`
    : `${config.baseUrl} (${config.model})`;
}
