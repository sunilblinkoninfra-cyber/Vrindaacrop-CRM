import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env, isImapConfigured } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { handleReply } from "@/lib/outreach/reply";

export type ImapSyncResult = {
  ok: boolean;
  checked: number;
  matchedReplies: number;
  details: Array<{
    from: string;
    subject: string;
    leadMatched: boolean;
    date: Date;
  }>;
  error?: string;
};

let isSyncing = false;

/**
 * Poll the configured mailbox via IMAP (e.g. Gmail / Google Workspace / Microsoft 365)
 * for incoming replies from leads enrolled in outreach campaigns.
 */
export async function syncImapReplies(options?: {
  sinceDays?: number;
  maxMessages?: number;
}): Promise<ImapSyncResult> {
  if (isSyncing) {
    return {
      ok: true,
      checked: 0,
      matchedReplies: 0,
      details: [],
    };
  }

  if (!isImapConfigured()) {
    return {
      ok: false,
      checked: 0,
      matchedReplies: 0,
      details: [],
      error: "IMAP is not configured (missing IMAP/SMTP credentials in .env).",
    };
  }

  isSyncing = true;

  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: env.imap.secure,
    auth: {
      user: env.imap.user,
      pass: env.imap.pass,
    },
    logger: false,
  });

  const sinceDays = options?.sinceDays ?? 7;
  const maxMessages = options?.maxMessages ?? 50;
  const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const details: ImapSyncResult["details"] = [];
  let checked = 0;
  let matchedReplies = 0;

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search for messages received since target date
      const searchCriteria = { since: sinceDate };
      const messages = client.fetch(searchCriteria, {
        envelope: true,
        source: true,
        uid: true,
      });

      const buffer: any[] = [];
      for await (const msg of messages) {
        buffer.push(msg);
        if (buffer.length >= maxMessages) break;
      }

      // Process in reverse chronological order (newest first)
      buffer.sort((a, b) => (b.envelope?.date?.getTime() ?? 0) - (a.envelope?.date?.getTime() ?? 0));

      for (const msg of buffer) {
        checked++;
        const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase()?.trim();
        const subject = msg.envelope?.subject ?? "(No Subject)";
        const messageId = msg.envelope?.messageId;
        const msgDate = msg.envelope?.date ?? new Date();

        if (!fromAddr) continue;

        // Skip our own sent emails if they appear in inbox
        if (fromAddr === env.imap.user.toLowerCase() || fromAddr === env.smtp.fromEmail.toLowerCase()) {
          continue;
        }

        const normalized = normalizeEmail(fromAddr);

        // Check if fromAddr is a lead in our database
        const lead = await prisma.lead.findFirst({
          where: { emailNormalized: normalized },
          select: { id: true, email: true, stage: true, hot: true },
        });

        if (!lead) {
          details.push({
            from: fromAddr,
            subject,
            leadMatched: false,
            date: msgDate,
          });
          continue;
        }

        // Check if we already processed a REPLIED event for this messageId or lead
        const existingEvent = await prisma.emailEvent.findFirst({
          where: {
            leadId: lead.id,
            type: "REPLIED",
            ...(messageId ? { messageId } : {}),
          },
        });

        if (!existingEvent) {
          // Parse snippet from message source
          let snippet = subject;
          if (msg.source) {
            try {
              const parsed = await simpleParser(msg.source);
              snippet = (parsed.text || parsed.html || subject).slice(0, 300).trim();
            } catch {
              snippet = subject;
            }
          }

          const res = await handleReply({
            fromEmail: fromAddr,
            messageId,
            snippet,
          });

          if (res.matched && !res.alreadyProcessed) {
            matchedReplies++;
          }
        }

        details.push({
          from: fromAddr,
          subject,
          leadMatched: true,
          date: msgDate,
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();

    return {
      ok: true,
      checked,
      matchedReplies,
      details,
    };
  } catch (error: any) {
    console.error("[IMAP Sync Error]:", error);
    try {
      await client.logout();
    } catch {
      // ignore logout error
    }
    return {
      ok: false,
      checked,
      matchedReplies,
      details,
      error: error?.message || String(error),
    };
  } finally {
    isSyncing = false;
  }
}
