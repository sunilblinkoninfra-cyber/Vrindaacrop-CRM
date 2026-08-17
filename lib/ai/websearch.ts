import { env } from "@/lib/env";

export type SearchSnippet = { title: string; snippet: string; url: string };

/**
 * Optional web search used to ground contract-intelligence enrichment. A local
 * model can't browse on its own, so we fetch snippets and feed them to it.
 * Pluggable: Serper (hosted) or a self-hosted SearXNG instance. Returns [] when
 * unconfigured — the model then infers from the company name alone, and the
 * result is flagged low-confidence.
 */
export async function webSearch(query: string, limit = 5): Promise<SearchSnippet[]> {
  try {
    if (env.websearch.provider === "serper" && env.websearch.apiKey) {
      return await serper(query, limit);
    }
    if (env.websearch.provider === "searxng" && env.websearch.baseUrl) {
      return await searxng(query, limit);
    }
  } catch {
    /* fall through to empty */
  }
  return [];
}

export function isWebSearchConfigured(): boolean {
  return (
    (env.websearch.provider === "serper" && Boolean(env.websearch.apiKey)) ||
    (env.websearch.provider === "searxng" && Boolean(env.websearch.baseUrl))
  );
}

async function serper(query: string, limit: number): Promise<SearchSnippet[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": env.websearch.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: limit }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { organic?: { title: string; snippet: string; link: string }[] };
  return (data.organic ?? []).slice(0, limit).map((r) => ({ title: r.title, snippet: r.snippet, url: r.link }));
}

async function searxng(query: string, limit: number): Promise<SearchSnippet[]> {
  const base = env.websearch.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/search?q=${encodeURIComponent(query)}&format=json`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { title: string; content: string; url: string }[] };
  return (data.results ?? []).slice(0, limit).map((r) => ({ title: r.title, snippet: r.content, url: r.url }));
}
