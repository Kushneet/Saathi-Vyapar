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

// ── Tool calling ──────────────────────────────────────────────────────────────

import { afterEach, vi } from 'vitest';
import { generateWithTools, toGeminiSchema, type ChatMessage, type ToolDefinition } from './provider';

const addEntry: ToolDefinition = {
  name: 'add_ledger_entry',
  description: 'Record income or expense.',
  parameters: {
    type: 'object',
    properties: {
      entry_type: { type: 'string', enum: ['income', 'expense'] },
      amount: { type: 'number' },
    },
    required: ['entry_type', 'amount'],
    additionalProperties: false,
  },
};

describe('toGeminiSchema', () => {
  it('upper-cases type names and drops additionalProperties, recursively', () => {
    const out = toGeminiSchema(addEntry.parameters) as Record<string, unknown>;
    expect(out.type).toBe('OBJECT');
    expect(out).not.toHaveProperty('additionalProperties');
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect(props.entry_type.type).toBe('STRING');
    expect(props.entry_type.enum).toEqual(['income', 'expense']);
    expect(props.amount.type).toBe('NUMBER');
    expect(out.required).toEqual(['entry_type', 'amount']);
  });
});

describe('generateWithTools on an OpenAI-compatible endpoint', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  function fakeEndpoint(reply: unknown) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(reply), { status: 200 });
      })
    );
    return calls;
  }

  it('sends tools in function format and returns the parsed tool call', async () => {
    process.env.LLM_BASE_URL = 'http://model.local/v1';
    process.env.LLM_MODEL = 'qwen';
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_PROVIDER;

    const calls = fakeEndpoint({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'add_ledger_entry', arguments: '{"entry_type":"income","amount":500}' },
              },
            ],
          },
        },
      ],
    });

    const turn = await generateWithTools({
      systemInstruction: 'You keep the books.',
      messages: [{ role: 'user', content: 'aaj 500 ki bikri hui' }],
      tools: [addEntry],
    });

    expect(calls[0].url).toBe('http://model.local/v1/chat/completions');
    const sent = calls[0].body as { tools: { type: string; function: { name: string } }[]; messages: { role: string }[] };
    expect(sent.tools[0].type).toBe('function');
    expect(sent.tools[0].function.name).toBe('add_ledger_entry');
    expect(sent.messages.map((m) => m.role)).toEqual(['system', 'user']);

    expect(turn.text).toBeNull();
    expect(turn.toolCalls).toEqual([{ id: 'call_1', name: 'add_ledger_entry', args: { entry_type: 'income', amount: 500 } }]);
    expect(turn.assistantMessage.toolCalls).toHaveLength(1);
  });

  it('replays the assistant tool call and the tool result in the endpoint format', async () => {
    process.env.LLM_BASE_URL = 'http://model.local/v1';
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_PROVIDER;

    const calls = fakeEndpoint({ choices: [{ message: { role: 'assistant', content: 'Likh diya: ₹500 aay.' } }] });

    const history: ChatMessage[] = [
      { role: 'user', content: 'aaj 500 ki bikri hui' },
      { role: 'assistant', toolCalls: [{ id: 'call_1', name: 'add_ledger_entry', args: { entry_type: 'income', amount: 500 } }] },
      { role: 'tool', toolCallId: 'call_1', name: 'add_ledger_entry', result: { success: true } },
    ];
    const turn = await generateWithTools({ systemInstruction: 's', messages: history, tools: [addEntry] });

    const sent = calls[0].body.messages as Record<string, unknown>[];
    expect(sent[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'add_ledger_entry', arguments: '{"entry_type":"income","amount":500}' } }],
    });
    expect(sent[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"success":true}' });
    expect(turn.text).toBe('Likh diya: ₹500 aay.');
    expect(turn.toolCalls).toEqual([]);
  });

  it('survives malformed tool arguments instead of throwing', async () => {
    process.env.LLM_BASE_URL = 'http://model.local/v1';
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_PROVIDER;
    fakeEndpoint({
      choices: [{ message: { tool_calls: [{ id: 'x', function: { name: 'add_ledger_entry', arguments: '{oops' } }] } }],
    });
    const turn = await generateWithTools({ systemInstruction: 's', messages: [{ role: 'user', content: 'hi' }], tools: [addEntry] });
    expect(turn.toolCalls[0]).toEqual({ id: 'x', name: 'add_ledger_entry', args: {} });
  });

  it('throws when nothing is configured (the tool loop has no fallback)', async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_PROVIDER;
    await expect(
      generateWithTools({ systemInstruction: 's', messages: [{ role: 'user', content: 'hi' }], tools: [addEntry] })
    ).rejects.toThrow(/No language model/);
  });
});
