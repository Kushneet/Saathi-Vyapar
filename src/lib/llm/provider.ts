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
 *
 * Two entry points:
 *   - generateText()      — one prompt in, one reply out
 *   - generateWithTools() — one turn of a tool-calling conversation. Tools are
 *                           declared once as JSON Schema and translated to
 *                           each backend's own shape here, so a route such as
 *                           Khata Mitra is written against neither.
 */

import { GoogleGenAI, type Schema } from '@google/genai';

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

// ── Tool calling ──────────────────────────────────────────────────────────────

/** A tool the model may ask us to run. `parameters` is JSON Schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A call the model asked for. `id` is echoed back with the result. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * One message in a tool-calling conversation, in a shape neither backend
 * uses natively. `raw` carries the backend's own copy of an assistant turn:
 * Gemini 3.x attaches a thought signature to function-call parts and rejects
 * a replay that reconstructs the part without it.
 */
export type ChatMessage =
  | { role: 'user'; content: string; audio?: { mimeType: string; base64: string } }
  | { role: 'assistant'; content?: string; toolCalls?: ToolCall[]; raw?: unknown }
  | { role: 'tool'; toolCallId: string; name: string; result: Record<string, unknown> };

export interface ToolTurnRequest {
  systemInstruction: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  temperature?: number;
}

/** What one model turn produced: a final answer, tool calls, or neither. */
export interface ToolTurnResult {
  text: string | null;
  toolCalls: ToolCall[];
  /** The assistant message to append before the tool results. */
  assistantMessage: Extract<ChatMessage, { role: 'assistant' }>;
}

/** Whether the configured backend accepts audio directly in a user turn. */
export function llmAcceptsAudio(): boolean {
  return resolveLlmConfig()?.provider === 'gemini';
}

/**
 * Gemini's schema dialect: JSON Schema with upper-case type names and no
 * `additionalProperties`. Everything else passes through.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'additionalProperties') continue;
    if (key === 'type' && typeof value === 'string') out[key] = value.toUpperCase();
    else if (key === 'properties' && value && typeof value === 'object') {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)])
      );
    } else out[key] = toGeminiSchema(value);
  }
  return out;
}

async function toolTurnGemini(config: LlmConfig, req: ToolTurnRequest): Promise<ToolTurnResult> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey! });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = req.messages.map((m) => {
    if (m.role === 'user') {
      return {
        role: 'user',
        parts: m.audio
          ? [{ inlineData: { mimeType: m.audio.mimeType, data: m.audio.base64 } }]
          : [{ text: m.content }],
      };
    }
    if (m.role === 'assistant') {
      if (m.raw) return m.raw;
      return {
        role: 'model',
        parts: [
          ...(m.content ? [{ text: m.content }] : []),
          ...(m.toolCalls ?? []).map((c) => ({ functionCall: { name: c.name, args: c.args } })),
        ],
      };
    }
    return { role: 'user', parts: [{ functionResponse: { name: m.name, response: m.result } }] };
  });

  const response = await ai.models.generateContent({
    model: config.model,
    contents,
    config: {
      systemInstruction: req.systemInstruction,
      temperature: req.temperature ?? 0.2,
      tools: [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: toGeminiSchema(t.parameters) as Schema,
          })),
        },
      ],
    },
  });

  const calls: ToolCall[] = (response.functionCalls ?? []).map((fc, i) => ({
    id: fc.id ?? `${fc.name}-${i}`,
    name: fc.name ?? '',
    args: (fc.args as Record<string, unknown>) ?? {},
  }));
  const text = response.text?.trim() || null;

  return {
    text: calls.length ? null : text,
    toolCalls: calls,
    assistantMessage: {
      role: 'assistant',
      content: text ?? undefined,
      toolCalls: calls,
      raw: response.candidates?.[0]?.content,
    },
  };
}

async function toolTurnOpenAi(config: LlmConfig, req: ToolTurnRequest): Promise<ToolTurnResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: 'system', content: req.systemInstruction }];
    for (const m of req.messages) {
      if (m.role === 'user') {
        // Audio never reaches this backend: callers transcribe first
        // (see llmAcceptsAudio). A stray audio turn becomes its caption.
        messages.push({ role: 'user', content: m.audio ? '[voice message]' : m.content });
      } else if (m.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: m.content ?? null,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: JSON.stringify(c.args) },
                })),
              }
            : {}),
        });
      } else {
        messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: JSON.stringify(m.result) });
      }
    }

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
        tools: req.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM endpoint returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message ?? {};
    const text = typeof message.content === 'string' && message.content.trim() ? message.content.trim() : null;

    const calls: ToolCall[] = (message.tool_calls ?? []).map(
      (c: { id?: string; function?: { name?: string; arguments?: string } }, i: number) => {
        let args: Record<string, unknown> = {};
        try {
          args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
        } catch {
          // A model that emits malformed JSON gets an empty argument set and
          // the tool's own validation reports what is missing.
        }
        return { id: c.id ?? `call-${i}`, name: c.function?.name ?? '', args };
      }
    );

    return {
      text: calls.length ? null : text,
      toolCalls: calls,
      assistantMessage: { role: 'assistant', content: text ?? undefined, toolCalls: calls },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Whether an error is the provider saying "slow down". */
function isRateLimit(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify(err)}` : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|rate limit|quota/i.test(text);
}

/** The wait the provider asked for, if it said; otherwise a few seconds. */
function retryDelayMs(err: unknown): number {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify(err)}` : String(err);
  const m = text.match(/retryDelay["']?\s*:\s*["']?(\d+)s/i) || text.match(/retry in (\d+)s/i);
  const seconds = m ? Number(m[1]) : 4;
  return Math.min(seconds, 20) * 1000;
}

/**
 * Run one model turn of a tool-calling conversation.
 *
 * Unlike generateText this throws on failure: a tool loop has no
 * deterministic fallback to degrade to, and the caller's error handling
 * is the right place to turn that into a reply. A per-minute rate limit
 * (the free Gemini tier allows about ten calls) gets one retry after the
 * wait the provider asked for; a hard daily quota still surfaces.
 */
export async function generateWithTools(req: ToolTurnRequest): Promise<ToolTurnResult> {
  const config = resolveLlmConfig();
  if (!config) {
    throw new Error('No language model is configured (set GEMINI_API_KEY or LLM_BASE_URL).');
  }
  const run = () => (config.provider === 'gemini' ? toolTurnGemini(config, req) : toolTurnOpenAi(config, req));
  try {
    return await run();
  } catch (err) {
    if (!isRateLimit(err)) throw err;
    const wait = retryDelayMs(err);
    console.warn(`LLM rate limited (${config.provider}/${config.model}); retrying once in ${wait}ms`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    return run();
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
