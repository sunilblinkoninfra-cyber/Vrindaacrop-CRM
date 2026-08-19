import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { recordEvent, findLeadForEvent, suppressLead } from "@/lib/outreach/events";
import { handleReply } from "@/lib/outreach/reply";
import { prisma } from "@/lib/prisma";
import { rejectOversized } from "@/lib/validation/inbound";
import { EmailEventType, SuppressionReason } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unified SES-over-SNS webhook. Handles:
 *  - SNS SubscriptionConfirmation (auto-confirm)
 *  - SES event notifications (Delivery, Bounce, Complaint, Open, Click) via a
 *    configuration-set SNS destination
 *  - SES inbound receiving (Received) for reply detection
 * Protected by a shared secret in the ?token= query param.
 */
export async function POST(req: NextRequest) {
  if (env.aws.webhookSecret) {
    const token = req.nextUrl.searchParams.get("token");
    if (token !== env.aws.webhookSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // SES/SNS payloads can legitimately be larger than a form submission
  // (bounce/complaint notifications can list many recipients).
  const oversized = rejectOversized(req, 512 * 1024);
  if (oversized) return oversized;

  let envelope: any;
  try {
    envelope = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 1. SNS subscription confirmation handshake.
  if (envelope.Type === "SubscriptionConfirmation" && envelope.SubscribeURL) {
    try {
      await fetch(envelope.SubscribeURL);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, confirmed: true });
  }

  // SNS wraps the SES payload as a JSON string in `Message`.
  let message: any = envelope;
  if (envelope.Type === "Notification" && typeof envelope.Message === "string") {
    try {
      message = JSON.parse(envelope.Message);
    } catch {
      message = {};
    }
  }

  try {
    await processSesMessage(message);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function processSesMessage(msg: any) {
  const notificationType: string | undefined = msg.notificationType || msg.eventType;
  const mail = msg.mail ?? {};
  const messageId: string | undefined = mail.messageId;

  switch (notificationType) {
    case "Delivery": {
      const found = await findLeadForEvent(messageId);
      if (found) await recordEvent({ ...found, type: EmailEventType.DELIVERED, messageId });
      break;
    }
    case "Open": {
      const found = await findLeadForEvent(messageId);
      if (found) await recordEvent({ ...found, type: EmailEventType.OPENED, messageId });
      break;
    }
    case "Click": {
      const found = await findLeadForEvent(messageId);
      if (found)
        await recordEvent({
          ...found,
          type: EmailEventType.CLICKED,
          messageId,
          metadata: { url: msg.click?.link },
        });
      break;
    }
    case "Bounce": {
      const isHard = msg.bounce?.bounceType === "Permanent";
      const recipients: string[] = (msg.bounce?.bouncedRecipients ?? []).map((r: any) => r.emailAddress);
      for (const email of recipients) {
        const found = await findLeadForEvent(messageId, email);
        if (found) {
          await recordEvent({ ...found, type: EmailEventType.BOUNCED, messageId, metadata: { hard: isHard } });
          if (isHard) await suppressLead(found.leadId, email, SuppressionReason.HARD_BOUNCE);
        }
      }
      break;
    }
    case "Complaint": {
      const recipients: string[] = (msg.complaint?.complainedRecipients ?? []).map((r: any) => r.emailAddress);
      for (const email of recipients) {
        const found = await findLeadForEvent(messageId, email);
        if (found) {
          await recordEvent({ ...found, type: EmailEventType.COMPLAINED, messageId });
          await suppressLead(found.leadId, email, SuppressionReason.COMPLAINT);
        }
      }
      break;
    }
    case "Received": {
      // Inbound email = a reply. Match by sender.
      const from: string | undefined =
        mail.commonHeaders?.from?.[0] ?? mail.source ?? mail.commonHeaders?.returnPath;
      const fromEmail = extractEmail(from);
      const subject: string = mail.commonHeaders?.subject ?? "";
      if (fromEmail) {
        await handleReply({ fromEmail, snippet: subject });
      }
      break;
    }
    default:
      // Unknown type — log for observability.
      await prisma.jobRun.create({
        data: { job: "ses-webhook", ok: true, finishedAt: new Date(), detail: `Unhandled type: ${notificationType}` },
      });
  }
}

function extractEmail(raw?: string): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : raw).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}
