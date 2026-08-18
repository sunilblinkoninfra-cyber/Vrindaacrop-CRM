import { NextRequest, NextResponse } from "next/server";

/**
 * Sliding-window rate limiter keyed by IP + bucket name. In-memory only, so
 * effective on a single serverless instance; a determined attacker can spread
 * requests across warm instances. This is Sprint 0 defense-in-depth — Sprint 1
 * swaps this for @upstash/ratelimit + Upstash Redis for global correctness.
 *
 * Failure mode is fail-open: if the store misbehaves we don't block legitimate
 * traffic. Bots cost far less than a locked-out user.
 */

type Hit = number[]; // list of timestamps in ms
const store = new Map<string, Hit>();

function prune(hits: Hit, windowMs: number, now: number): Hit {
  const cutoff = now - windowMs;
  return hits.filter((t) => t >= cutoff);
}

/** Return null if the request is allowed; a 429 response if it should be rejected. */
export function rateLimit(
  req: NextRequest,
  opts: { bucket: string; limit: number; windowSeconds: number; keyBy?: "ip" | "ip+body" }
): NextResponse | null {
  const now = Date.now();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const key = `${opts.bucket}:${ip}`;

  const windowMs = opts.windowSeconds * 1000;
  const hits = prune(store.get(key) ?? [], windowMs, now);
  if (hits.length >= opts.limit) {
    const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } }
    );
  }
  hits.push(now);
  store.set(key, hits);

  // Best-effort GC: drop the oldest key every 1000 inserts.
  if (store.size > 1000) {
    const first = store.keys().next().value;
    if (first !== undefined) store.delete(first);
  }
  return null;
}
