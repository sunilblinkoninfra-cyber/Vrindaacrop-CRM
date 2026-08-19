import { promises as dns } from "dns";
import { randomUUID } from "crypto";
import net from "net";
import { prisma } from "@/lib/prisma";

export type SmtpProbeResult =
  | { outcome: "confirmed-invalid"; reason: string }
  | { outcome: "confirmed-valid"; reason: string }
  | { outcome: "unknown"; reason: string };

const CATCH_ALL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SOCKET_TIMEOUT_MS = 5000;

/** Resolves the lowest-priority (best) MX host for a domain, or null if none. */
export async function pickBestMx(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 0) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch {
    return null;
  }
}

/**
 * Best-effort SMTP conversation: HELO/MAIL FROM/RCPT TO for a single address,
 * then QUIT without ever sending DATA. Every failure mode (timeout, connection
 * refused, blocked outbound port 25 — expected on Vercel/AWS by default) fails
 * open to "unknown"; this function must never throw to its caller.
 */
export async function probeMailbox(email: string, mxHost: string): Promise<SmtpProbeResult> {
  const domain = email.split("@")[1] ?? "example.com";
  const ownDomain = process.env.SMTP_PROBE_HELO_DOMAIN || "vrindaacorpservices.in";

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SmtpProbeResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const socket = net.createConnection({ port: 25, host: mxHost });
    socket.setTimeout(SOCKET_TIMEOUT_MS);

    let stage: "greet" | "helo" | "mail" | "rcpt" = "greet";
    let buffer = "";

    socket.on("timeout", () => finish({ outcome: "unknown", reason: "SMTP probe timed out" }));
    socket.on("error", (e) => finish({ outcome: "unknown", reason: `SMTP probe failed: ${e.message}` }));

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (!buffer.endsWith("\r\n")) return; // wait for a full line
      const code = parseInt(buffer.slice(0, 3), 10);
      buffer = "";

      if (stage === "greet") {
        if (code !== 220) return finish({ outcome: "unknown", reason: `unexpected greeting code ${code}` });
        stage = "helo";
        socket.write(`EHLO ${ownDomain}\r\n`);
        return;
      }
      if (stage === "helo") {
        if (code < 200 || code >= 300) return finish({ outcome: "unknown", reason: `EHLO rejected (${code})` });
        stage = "mail";
        socket.write(`MAIL FROM:<probe@${ownDomain}>\r\n`);
        return;
      }
      if (stage === "mail") {
        if (code < 200 || code >= 300) return finish({ outcome: "unknown", reason: `MAIL FROM rejected (${code})` });
        stage = "rcpt";
        socket.write(`RCPT TO:<${email}>\r\n`);
        return;
      }
      if (stage === "rcpt") {
        socket.write("QUIT\r\n");
        if (code === 250 || code === 251) {
          return finish({ outcome: "confirmed-valid", reason: `SMTP: mailbox confirmed (${code})` });
        }
        if (code === 550 || code === 551 || code === 553) {
          return finish({ outcome: "confirmed-invalid", reason: `SMTP: mailbox does not exist (${code})` });
        }
        return finish({ outcome: "unknown", reason: `SMTP: inconclusive RCPT response (${code})` });
      }
    });

    void domain; // reserved for future per-domain diagnostics
  });
}

/**
 * Checks (and caches, per-domain) whether the mail server accepts mail for any
 * address at all — if so, a "confirmed-valid" result for a real address can't
 * be trusted. Cached in Postgres (not memory) so the expensive probe survives
 * across serverless invocations, reused for up to 30 days.
 */
export async function isCatchAllDomain(domain: string, mxHost: string): Promise<boolean> {
  const lower = domain.toLowerCase();
  const cached = await prisma.domainReputation.findUnique({ where: { domain: lower } });
  if (cached && Date.now() - cached.lastCheckedAt.getTime() < CATCH_ALL_TTL_MS) {
    return cached.isCatchAll;
  }

  const probeAddress = `nonexistent-probe-${randomUUID().slice(0, 8)}@${lower}`;
  const result = await probeMailbox(probeAddress, mxHost);
  const isCatchAll = result.outcome === "confirmed-valid";

  await prisma.domainReputation.upsert({
    where: { domain: lower },
    update: { isCatchAll, mxHost, lastCheckedAt: new Date() },
    create: { domain: lower, isCatchAll, mxHost, lastCheckedAt: new Date() },
  });

  return isCatchAll;
}
