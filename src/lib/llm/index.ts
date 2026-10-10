import { env } from '@/lib/env';

/**
 * LLM provider abstraction. The brief specifies Claude, but the founder can only
 * supply a Gemini key, so extraction + the guardrail second-check run on Gemini.
 * Everything behind this interface so the provider is swappable (Claude, etc.)
 * without touching the pipeline — mirrors the VoiceProvider / EmailProvider pattern.
 */
export interface LlmJsonRequest {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LlmJsonResult {
  text: string; // raw model output (expected to be JSON)
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  generateJson(req: LlmJsonRequest): Promise<LlmJsonResult>;
}

/** Google Gemini (Generative Language API) via raw fetch — JSON output mode. */
class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  // Global throttle so we stay under the free-tier RPM limit (default ~4.6/min).
  private static nextSlot = 0;
  private static minIntervalMs = Number(process.env.LLM_MIN_INTERVAL_MS ?? '13000');

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, GeminiProvider.nextSlot - now);
    GeminiProvider.nextSlot = Math.max(now, GeminiProvider.nextSlot) + GeminiProvider.minIntervalMs;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  async generateJson(req: LlmJsonRequest): Promise<LlmJsonResult> {
    const key = env.geminiApiKey();
    const model = env.llmModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0,
        maxOutputTokens: req.maxOutputTokens ?? 2048,
        responseMimeType: 'application/json',
      },
    });

    // Retry transient failures (429 / 5xx). 429 = per-minute quota → wait a full
    // window; 5xx = short exponential backoff. Throttle before each attempt.
    const MAX_ATTEMPTS = 5;
    let lastErr = '';
    let res: Response | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await this.throttle();
      res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) break;
      const text = await res.text();
      lastErr = `Gemini generateContent failed ${res.status}: ${text.slice(0, 400)}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) throw new Error(lastErr);
      const delay = res.status === 429 ? 60000 : Math.min(1000 * 2 ** (attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
    }
    if (!res || !res.ok) throw new Error(lastErr || 'Gemini request failed');

    const data = (await res.json()) as GeminiResponse;
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      model,
    };
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

let _provider: LlmProvider | null = null;
export function llmProvider(): LlmProvider {
  if (_provider) return _provider;
  switch (env.llmProvider()) {
    case 'gemini':
    default:
      _provider = new GeminiProvider();
  }
  return _provider;
}
