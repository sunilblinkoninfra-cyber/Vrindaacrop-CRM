import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC helpers for signing tracking-link parameters. Prevents an attacker
 * from crafting arbitrary click-redirect URLs against our domain (open-redirect).
 *
 * Uses NEXTAUTH_SECRET as the signing key so we don't need another secret.
 * Signature is short base64url-encoded HMAC-SHA256 (16 bytes).
 */

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for URL signing");
  return Buffer.from(secret, "utf8");
}

/** Sign an arbitrary string payload; return a short base64url tag. */
export function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url").slice(0, 22);
}

/** Verify a signature in constant time. */
export function verify(payload: string, tag: string): boolean {
  const expected = sign(payload);
  if (expected.length !== tag.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(tag));
  } catch {
    return false;
  }
}
