import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

/**
 * Provider-agnostic AI client. Supports:
 *  - "anthropic": hosted Claude via @anthropic-ai/sdk
 *  - "local": any OpenAI-compatible /chat/completions endpoint (Ollama, vLLM,
 *    LM Studio, etc.) — the model deployed on the client's own server, shared
 *    by the website and this CRM.
 *
 * Both the email copywriter (lib/ai/generate.ts) and the contract-enrichment
 * (lib/ai/contract.ts) go through chatJSON so the provider is swappable with a
 * single env var (AI_PROVIDER).
 */

export function isAiConfigured(): boolean {
  if (env.ai.provider === "local") return Boolean(env.ai.localBaseUrl && env.ai.localModel);
  return Boolean(env.ai.apiKey);
}

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ apiKey: env.ai.apiKey });
  return anthropic;
}

/**
 * Ask the model for a JSON object matching `schema`. Returns the parsed object,
 * or null if the provider is unconfigured or the call/parse fails (callers then
 * fall back to a deterministic path). `schema` is a JSON Schema object.
 */
export async function chatJSON<T = unknown>(args: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T | null> {
  if (!isAiConfigured()) return null;
  try {
    const raw =
      env.ai.provider === "local"
        ? await localChat(args.system, args.user, args.schema, args.maxTokens ?? 1200)
        : await anthropicChat(args.system, args.user, args.schema, args.maxTokens ?? 1200);
    if (!raw) return null;
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    return null;
  }
}

async function anthropicChat(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  maxTokens: number
): Promise<string | null> {
  const res = await getAnthropic().messages.create({
    model: env.ai.model,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema },
    },
    system,
    messages: [{ role: "user", content: user }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const text = res.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text : null;
}

async function localChat(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  maxTokens: number
): Promise<string | null> {
  const base = env.ai.localBaseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(env.ai.apiKey ? { Authorization: `Bearer ${env.ai.apiKey}` } : {}),
  };

  const systemWithSchema = `${system}

Required JSON schema:
${JSON.stringify(schema, null, 2)}

Strict instruction: Respond ONLY with a valid JSON object conforming to the schema above. Do NOT wrap in markdown, backticks, or any explanatory text.`;

  const payloadWithSchema = {
    model: env.ai.localModel,
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: {
      type: "json_schema",
      json_schema: { name: "result", schema, strict: false },
    },
    messages: [
      { role: "system", content: systemWithSchema },
      { role: "user", content: user },
    ],
  };

  let res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payloadWithSchema),
  });

  // If the local provider (e.g. older Ollama or custom engine) does not support json_schema, fallback to json_object
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    const payloadFallback = {
      ...payloadWithSchema,
      response_format: { type: "json_object" },
    };
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payloadFallback),
    });
  }

  if (!res.ok) throw new Error(`local AI ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? null;
}

/** Pull the first JSON object out of a possibly-chatty or code-fenced model response. */
function extractJson(text: string): string {
  let cleaned = text.trim();
  // Strip markdown code fences if present (e.g. ```json ... ```)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  cleaned = cleaned.trim();
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) return cleaned;

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}
