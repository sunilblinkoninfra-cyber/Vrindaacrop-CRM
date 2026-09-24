import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env, isImapConfigured } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { handleReply } from "@/lib/outreach/reply";
import { recordEvent, suppressLead } from "@/lib/outreach/events";
import { localDate } from "@/lib/outreach/scheduler";
import { EmailEventType, SuppressionReason, ValidationStatus } from "@prisma/client";
import { classifyInboundEmail } from "@/lib/inbound/classification";

export type ImapSyncResult = {
  ok: boolean;
  checked: number;
  matchedReplies: number;
  matchedBounces: number;
  details: Array<{
    from: string;
    subject: string;
    leadMatched: boolean;
    date: Date;
    isBounce?: boolean;
    bouncedEmail?: string;
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
      matchedBounces: 0,
      details: [],
    };
  }

  if (!isImapConfigured()) {
    return {
      ok: false,
      checked: 0,
      matchedReplies: 0,
      matchedBounces: 0,
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
  let matchedBounces = 0;

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search for messages received since target date
      const searchCriteria = { since: sinceDate };
      const messages = client.fetch(searchCriteria, {
        envelope: true,
        uid: true,
      });

      const buffer: any[] = [];
      try {
        for await (const msg of messages) {
          buffer.push(msg);
          if (buffer.length >= maxMessages) break;
        }
      } catch (err: any) {
        console.warn("[IMAP] Envelope fetch warning:", err?.message);
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
          // Check if this message is a Non-Delivery Report (Bounce)
          const isBounce =
            fromAddr.includes("mailer-daemon") ||
            fromAddr.includes("postmaster") ||
            /delivery status notification|failure|undeliver|returned mail|message blocked|rejected/i.test(subject);

          if (isBounce) {
            try {
              let messageSource: any = msg.source ?? null;
              if (!messageSource) {
                try {
                  const dl = await client.download(msg.uid.toString(), undefined, { uid: true });
                  if (dl && dl.content) messageSource = dl.content;
                } catch (dlErr: any) {
                  console.warn(`[IMAP] Could not download bounce source for UID ${msg.uid}:`, dlErr?.message);
                }
              }
              if (!messageSource) continue;

              const parsed = await simpleParser(messageSource);
              const fullText = ((parsed.text || "") + " " + (parsed.html || "") + " " + subject).trim();

              // 1. Try to extract from bounce headers
              let failedRecipient: string | null = null;
              const finalRecipient =
                parsed.headers.get("final-recipient")?.toString() ||
                parsed.headers.get("original-recipient")?.toString() ||
                parsed.headers.get("x-failed-recipients")?.toString();

              if (finalRecipient) {
                const m = finalRecipient.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (m) failedRecipient = m[0].toLowerCase();
              }

              // 2. Explicit patterns in text
              if (!failedRecipient) {
                const m1 = fullText.match(
                  /(?:wasn't delivered to|was not delivered to|message to|failed to deliver to|recipient)\s+<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>*/i
                );
                if (m1) {
                  const candidate = m1[1].toLowerCase();
                  if (!candidate.includes("vrindaacorp.com") && !candidate.includes("googlemail.com")) {
                    failedRecipient = candidate;
                  }
                }
              }

              if (!failedRecipient) {
                const m2 = fullText.match(
                  /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>:\s*(?:user unknown|recipient address rejected|address rejected|does not exist)/i
                );
                if (m2) {
                  const candidate = m2[1].toLowerCase();
                  if (!candidate.includes("vrindaacorp.com")) failedRecipient = candidate;
                }
              }

              // 3. Extract diagnostic failure reason if present
              let bounceReason = "Delivery failed / Address not found (NDR)";
              const reasonMatch = fullText.match(
                /(?:The response (?:from the remote server )?was:\s*)?(55\d[^\r\n]+|The email account that you tried to reach[^\r\n]+|Address rejected[^\r\n]+|Recipient address rejected[^\r\n]+|User unknown[^\r\n]+)/i
              );
              if (reasonMatch) {
                bounceReason = reasonMatch[1].trim().slice(0, 200);
              }

              let bouncedLead = null;
              if (failedRecipient) {
                bouncedLead = await prisma.lead.findFirst({
                  where: { emailNormalized: normalizeEmail(failedRecipient) },
                  select: { id: true, email: true, stage: true },
                });
              }

              // 4. Candidate fallback search across all mentioned emails
              if (!bouncedLead) {
                const allMatches = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                const candidates = Array.from(
                  new Set(allMatches.map((m) => m.toLowerCase().replace(/^[<"']|[>"']$/g, "")))
                ).filter(
                  (e) =>
                    !e.includes("vrindaacorp.com") &&
                    !e.includes("googlemail.com") &&
                    !e.includes("mailer-daemon") &&
                    !e.includes("postmaster")
                );

                if (candidates.length > 0) {
                  bouncedLead = await prisma.lead.findFirst({
                    where: { emailNormalized: { in: candidates.map(normalizeEmail) } },
                    select: { id: true, email: true, stage: true },
                  });
                }
              }

              if (bouncedLead) {
                const existingBounce = await prisma.emailEvent.findFirst({
                  where: {
                    leadId: bouncedLead.id,
                    type: EmailEventType.BOUNCED,
                    ...(messageId ? { messageId } : {}),
                  },
                });

                if (!existingBounce) {
                  const lastSent = await prisma.emailEvent.findFirst({
                    where: { leadId: bouncedLead.id, type: EmailEventType.SENT },
                    orderBy: { createdAt: "desc" },
                    select: { enrollmentId: true },
                  });

                  await recordEvent({
                    leadId: bouncedLead.id,
                    enrollmentId: lastSent?.enrollmentId ?? null,
                    type: EmailEventType.BOUNCED,
                    messageId: messageId ?? undefined,
                    metadata: {
                      reason: bounceReason,
                      source: "imap_ndr",
                      subject,
                      date: msgDate,
                    },
                  });

                  await suppressLead(
                    bouncedLead.id,
                    bouncedLead.email,
                    SuppressionReason.HARD_BOUNCE,
                    `Bounced (NDR): ${bounceReason}`
                  );

                  await prisma.activity
                    .create({
                      data: {
                        leadId: bouncedLead.id,
                        type: "email",
                        message: `Outreach email bounced (NDR): ${bounceReason}`,
                      },
                    })
                    .catch(() => undefined);

                  const today = localDate(new Date(), env.sending.timezone);
                  await prisma.sendingDay.updateMany({
                    where: { localDate: today },
                    data: { bounced: { increment: 1 } },
                  });

                  matchedBounces++;
                }

                details.push({
                  from: fromAddr,
                  subject,
                  leadMatched: true,
                  date: msgDate,
                  isBounce: true,
                  bouncedEmail: bouncedLead.email,
                });
                continue;
              }
            } catch (err) {
              console.error("[IMAP Bounce Process Error]:", err);
            }
          }

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
          // Parse snippet and full body from message source
          let snippet = subject;
          let fullBody = subject;
          let messageSource: any = msg.source ?? null;
          let parsedHeaders: Record<string, any> = {};

          if (!messageSource) {
            try {
              const dl = await client.download(msg.uid.toString(), undefined, { uid: true });
              if (dl && dl.content) messageSource = dl.content;
            } catch (dlErr: any) {
              console.warn(`[IMAP] Could not download reply source for UID ${msg.uid}:`, dlErr?.message);
            }
          }

          if (messageSource) {
            try {
              const parsed = await simpleParser(messageSource);
              fullBody = (parsed.text || parsed.html || subject).trim();
              snippet = fullBody.slice(0, 300).trim();
              if (parsed.headers) {
                for (const [k, v] of parsed.headers) {
                  parsedHeaders[k.toLowerCase()] = v;
                }
              }
            } catch {
              snippet = subject;
              fullBody = subject;
            }
          }

          // Strict Qualification Check:
          // 1. Do not consider bounce emails as reply.
          // 2. Do not consider invalid/incorrect email notification as reply.
          // 3. Do not consider away messages as a hot lead or reply.
          // 4. Only meaningful responses should be considered as reply.
          // 5. Only interest to know more or requesting info should be hot leads.
          const classification = classifyInboundEmail({
            subject,
            body: fullBody,
            fromAddr,
            headers: parsedHeaders,
          });

          // 1 & 2: Bounce or Invalid Mailbox Notification
          if (classification.isBounce || classification.isInvalidEmail) {
            const lastSent = await prisma.emailEvent.findFirst({
              where: { leadId: lead.id, type: EmailEventType.SENT },
              orderBy: { createdAt: "desc" },
              select: { enrollmentId: true },
            });

            await recordEvent({
              leadId: lead.id,
              enrollmentId: lastSent?.enrollmentId ?? null,
              type: EmailEventType.BOUNCED,
              messageId: messageId ?? undefined,
              metadata: {
                reason: classification.reason,
                source: "imap_inbound_filter",
                subject,
                date: msgDate,
              },
            });

            await suppressLead(
              lead.id,
              lead.email,
              SuppressionReason.HARD_BOUNCE,
              classification.reason
            );

            await prisma.activity
              .create({
                data: {
                  leadId: lead.id,
                  type: "email",
                  message: `Outreach email bounced: ${classification.reason}`,
                },
              })
              .catch(() => undefined);

            const today = localDate(new Date(), env.sending.timezone);
            await prisma.sendingDay.updateMany({
              where: { localDate: today },
              data: { bounced: { increment: 1 } },
            });

            matchedBounces++;
            details.push({
              from: fromAddr,
              subject,
              leadMatched: true,
              date: msgDate,
              isBounce: true,
              bouncedEmail: lead.email,
            });
            continue;
          }

          // 3: Out-of-Office / Away Message
          if (classification.isAwayMessage) {
            await prisma.activity
              .create({
                data: {
                  leadId: lead.id,
                  type: "email",
                  message: `📩 Received Out-of-Office / Away auto-reply: "${subject}". Preserved in sequence; not treated as reply or hot lead.`,
                },
              })
              .catch(() => undefined);

            details.push({
              from: fromAddr,
              subject,
              leadMatched: true,
              date: msgDate,
            });
            continue;
          }

          // 4: Check if meaningful human response
          if (!classification.isMeaningfulReply) {
            if (classification.category === "IGNORE" && /unsubscribe|opt[- ]?out/i.test(fullBody)) {
              await suppressLead(lead.id, lead.email, SuppressionReason.UNSUBSCRIBE, "Lead requested unsubscribe");
              await prisma.activity
                .create({
                  data: {
                    leadId: lead.id,
                    type: "email",
                    message: `Prospect requested unsubscribe: "${subject}". Suppressed from future outreach.`,
                  },
                })
                .catch(() => undefined);
            } else {
              await prisma.activity
                .create({
                  data: {
                    leadId: lead.id,
                    type: "email",
                    message: `Inbound notification received: "${subject}" (non-actionable; not classified as reply).`,
                  },
                })
                .catch(() => undefined);
            }

            details.push({
              from: fromAddr,
              subject,
              leadMatched: true,
              date: msgDate,
            });
            continue;
          }

          // 5: Meaningful reply (and HOT lead if showed interest)
          const res = await handleReply({
            fromEmail: fromAddr,
            messageId,
            snippet,
            subject,
            body: fullBody,
            isHotLead: classification.isHotLead,
            intentReason: classification.reason,
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
      matchedBounces,
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
      matchedBounces,
      details,
      error: error?.message || String(error),
    };
  } finally {
    isSyncing = false;
  }
}
