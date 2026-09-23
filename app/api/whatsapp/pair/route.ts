import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";
import { env } from "@/lib/env";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const EVO_URL = env.whatsapp.evolutionApiUrl;
const EVO_KEY = env.whatsapp.evolutionApiKey;
const INSTANCE = env.whatsapp.evolutionInstanceName;

/**
 * Helper to call Evolution API
 */
async function evoFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${EVO_URL.replace(/\/+$/, "")}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: EVO_KEY,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  return res;
}

/**
 * GET: Fetches current connection state, live QR code, and user's phone number
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { whatsappNumber: true, role: true, name: true },
    });

    let state = "close";
    let base64Qr = null;
    let pairingCode = null;

    try {
      const stateRes = await evoFetch(`/instance/connectionState/${INSTANCE}`);
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        state = stateData?.instance?.state || "close";
      }

      // If not yet connected/open, fetch fresh QR code and pairing data
      if (state !== "open") {
        const connectRes = await evoFetch(`/instance/connect/${INSTANCE}`);
        if (connectRes.ok) {
          const connectData = await connectRes.json();
          base64Qr = connectData?.base64 || null;
          pairingCode = connectData?.pairingCode || null;
        }
      }
    } catch (err: any) {
      console.warn("[Evolution API unreachable or starting up]:", err.message);
      state = "offline";
    }

    return NextResponse.json({
      ok: true,
      state,
      phone: dbUser?.whatsappNumber || "",
      role: dbUser?.role || "AGENT",
      base64Qr,
      pairingCode,
      gateway: env.whatsapp.gateway,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Handles pairing code request, QR refresh, test message, and number update
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isOwnerOrAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden: Owner or Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action || "request_pairing_code";

    if (action === "save_phone") {
      const phone = String(body.phone || "").trim();
      await prisma.user.update({
        where: { id: user.id },
        data: { whatsappNumber: phone },
      });
      return NextResponse.json({ ok: true, phone, message: "Phone number updated successfully." });
    }

    if (action === "request_pairing_code") {
      const phone = String(body.phone || "").trim();
      const cleanPhone = phone.replace(/[^\d]/g, "");

      if (!cleanPhone || cleanPhone.length < 10) {
        return NextResponse.json({ error: "Please enter a valid phone number with country code (e.g. +91 8287868122)." }, { status: 400 });
      }

      // Update user in DB
      await prisma.user.update({
        where: { id: user.id },
        data: { whatsappNumber: `+${cleanPhone}` },
      });

      // Request pairing code from Evolution API
      const res = await evoFetch(`/instance/connect/${INSTANCE}?number=${cleanPhone}`);
      const data = await res.json();

      return NextResponse.json({
        ok: true,
        pairingCode: data.pairingCode || data.code || null,
        base64Qr: data.base64 || null,
        phone: `+${cleanPhone}`,
      });
    }

    if (action === "refresh_qr") {
      const res = await evoFetch(`/instance/connect/${INSTANCE}`);
      const data = await res.json();
      return NextResponse.json({
        ok: true,
        base64Qr: data.base64 || null,
        pairingCode: data.pairingCode || null,
      });
    }

    if (action === "send_test") {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { whatsappNumber: true, name: true },
      });

      const targetPhone = dbUser?.whatsappNumber;
      if (!targetPhone) {
        return NextResponse.json({ error: "No WhatsApp phone number configured for your account." }, { status: 400 });
      }

      const testMsg = `🎉 *VrindaaCorp AI Sales Agent Connected!*

Hello ${dbUser.name || "Business Owner"}! Your WhatsApp is now linked to VrindaaCorp CRM.

*What I will do:*
1. ☀️ *09:00 AM Morning Game Plan*: Daily outreach targets, sector focus, pacing cap, and domain deliverability status.
2. ⚡ *Inbound Client Revert Alerts*: When a client replies, I craft a tailored proposal draft and send it here. Reply *YES* to dispatch via sales@vrindaacorp.com.
3. 🌙 *09:00 PM Day-End Briefing*: Sent today, cumulative reach, open rates, response rates, and repeat openers.
4. 📈 *Bi-Weekly Domain Strategy*: Warmup scaling reviews with 1-tap *APPROVE STRATEGY*.

*Try chatting with me right now:*
• Reply *STATUS* for real-time outreach metrics.
• Reply *WHO OPENED TODAY* to see hot prospects.`;

      const result = await sendWhatsAppTextMessage(targetPhone, testMsg);
      return NextResponse.json({
        ok: result.ok,
        sent: result.ok,
        messageId: result.messageId,
        message: result.ok
          ? `Test message dispatched to ${targetPhone}! Check your WhatsApp chat.`
          : `Failed to dispatch WhatsApp message: ${result.error || "Evolution API unreachable"}`,
      });
    }

    if (action === "disconnect") {
      await evoFetch(`/instance/logout/${INSTANCE}`, { method: "DELETE" });
      return NextResponse.json({ ok: true, message: "WhatsApp device unlinked successfully." });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
