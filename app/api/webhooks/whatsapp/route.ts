import { NextResponse } from "next/server";
import { handleIncomingWhatsAppMessage } from "@/lib/whatsapp-revert";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ||
  process.env.META_VERIFY_TOKEN ||
  "vrindaacorp_crm_whatsapp_secret";

/**
 * GET: Webhook verification challenge from Meta WhatsApp Cloud API.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp Webhook Verified]");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * POST: Incoming WhatsApp messages from agents (e.g. "YES", "SEND", or revision instructions).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Verify this is a WhatsApp status/message payload
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      // Status updates or read receipts - acknowledge 200
      return NextResponse.json({ ok: true, status: "no_messages" });
    }

    const firstMsg = messages[0];
    const fromPhone = firstMsg.from; // e.g. "919876543210"

    // Extract message content from text or interactive button
    let messageText = "";
    if (firstMsg.type === "text") {
      messageText = firstMsg.text?.body || "";
    } else if (firstMsg.type === "interactive") {
      messageText =
        firstMsg.interactive?.button_reply?.title ||
        firstMsg.interactive?.button_reply?.id ||
        firstMsg.interactive?.list_reply?.title ||
        "";
    }

    if (!fromPhone || !messageText.trim()) {
      return NextResponse.json({ ok: true, status: "empty_content" });
    }

    console.log(`[WhatsApp Inbound Message from +${fromPhone}]: "${messageText}"`);

    // Process through intelligence & revert loop
    const result = await handleIncomingWhatsAppMessage({
      fromPhone,
      messageText,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("[WhatsApp Webhook Handler Error]:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
