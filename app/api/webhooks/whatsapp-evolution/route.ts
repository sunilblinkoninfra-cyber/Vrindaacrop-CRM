import { NextResponse } from "next/server";
import { handleIncomingWhatsAppMessage } from "@/lib/whatsapp-revert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Webhook handler for Evolution API (Self-Hosted WhatsApp Gateway on VPS).
 * Handles incoming WhatsApp messages from the paired business/owner phone.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Evolution API payload validation
    const event = body?.event;
    if (event && event !== "messages.upsert") {
      return NextResponse.json({ ok: true, status: "ignored_event" });
    }

    const data = body?.data;
    const key = data?.key;

    // Ignore messages sent by ourselves
    if (key?.fromMe) {
      return NextResponse.json({ ok: true, status: "ignored_from_me" });
    }

    // Remote JID format: "919999999999@s.whatsapp.net"
    const remoteJid = key?.remoteJid || "";
    if (remoteJid.includes("@g.us")) {
      // Ignore group messages
      return NextResponse.json({ ok: true, status: "ignored_group" });
    }

    const fromPhone = remoteJid.replace(/@.*$/, "").replace(/[^\d]/g, "");

    // Extract text from standard conversation or extended text
    const message = data?.message;
    const messageText = (
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.buttonsResponseMessage?.selectedButtonId ||
      message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      ""
    ).trim();

    if (!fromPhone || !messageText) {
      return NextResponse.json({ ok: true, status: "empty_content" });
    }

    console.log(`[Evolution WhatsApp Inbound from +${fromPhone}]: "${messageText}"`);

    // Route to unified revert & Ollama agent handler
    const result = await handleIncomingWhatsAppMessage({
      fromPhone,
      messageText,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("[Evolution Webhook Error]:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
