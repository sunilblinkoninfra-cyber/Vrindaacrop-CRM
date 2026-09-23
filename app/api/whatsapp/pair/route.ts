import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";

const INSTANCE = env.whatsapp.evolutionInstanceName || "vrindaacorp-crm";
const EVO_URL = env.whatsapp.evolutionApiUrl || "http://127.0.0.1:8080";
const EVO_KEY = env.whatsapp.evolutionApiKey || "vrindaacorp-evolution-key";

async function evoFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${EVO_URL}${endpoint}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: EVO_KEY,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
}

/**
 * GET:
 * - If ?poll=true: ONLY checks connectionState (does NOT touch or invalidate the QR code!)
 * - Otherwise: returns current state and generates/retrieves QR code if not open.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isOwnerOrAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden: Owner or Admin access required." }, { status: 403 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, whatsappNumber: true, role: true, name: true },
    });

    const isPoll = req.nextUrl.searchParams.get("poll") === "true";

    let state = "close";

    // 1. Check live connection state (Lightweight & Safe)
    try {
      const stateRes = await evoFetch(`/instance/connectionState/${INSTANCE}`);
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        state = stateData?.instance?.state || "close";
      }
    } catch (err: any) {
      console.warn("[Evolution API connectionState check failed]:", err.message);
      state = "offline";
    }

    // If this is just a status poll, return immediately without touching the QR code!
    if (isPoll) {
      return NextResponse.json({
        ok: true,
        state,
        phone: dbUser?.whatsappNumber || "",
        email: dbUser?.email || user.email,
        role: dbUser?.role || user.role,
        gateway: env.whatsapp.gateway,
      });
    }

    // 2. Initial load or explicit QR fetch: fetch QR code only if instance is not already open
    let base64Qr: string | null = null;
    if (state !== "open") {
      try {
        const connectRes = await evoFetch(`/instance/connect/${INSTANCE}`);
        if (connectRes.ok) {
          const connectData = await connectRes.json();
          base64Qr = connectData?.base64 || null;
        }
      } catch (err: any) {
        console.warn("[Evolution API connect fetch failed]:", err.message);
      }
    }

    return NextResponse.json({
      ok: true,
      state,
      phone: dbUser?.whatsappNumber || "",
      email: dbUser?.email || user.email,
      role: dbUser?.role || user.role,
      base64Qr,
      gateway: env.whatsapp.gateway,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Handles QR refresh, test message, phone save, and disconnect
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isOwnerOrAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden: Owner or Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action || "refresh_qr";

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, whatsappNumber: true, role: true, name: true },
    });

    if (action === "save_phone") {
      const phone = String(body.phone || "").trim();
      const cleanPhone = phone.replace(/[^\d+]/g, "");
      await prisma.user.update({
        where: { id: user.id },
        data: { whatsappNumber: cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}` },
      });
      return NextResponse.json({ ok: true, phone: cleanPhone, message: "Phone number updated successfully." });
    }

    if (action === "refresh_qr") {
      // Cleanly fetch fresh QR code from Evolution API
      const res = await evoFetch(`/instance/connect/${INSTANCE}`);
      const data = await res.json();

      return NextResponse.json({
        ok: true,
        base64Qr: data.base64 || null,
      });
    }

    if (action === "send_test") {
      const targetPhone = body.phone || dbUser?.whatsappNumber || "+918287868122";
      if (!targetPhone) {
        return NextResponse.json({ error: "No recipient phone number provided or configured." }, { status: 400 });
      }

      const testMsg = `🤖 *VrindaaCorp AI Agent Status Check*

Hello ${dbUser?.name || "Admin"}! Your WhatsApp is now linked to VrindaaCorp CRM.

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

    if (action === "disconnect" || action === "logout") {
      await evoFetch(`/instance/logout/${INSTANCE}`, { method: "DELETE" });
      return NextResponse.json({ ok: true, message: "WhatsApp device unlinked successfully." });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
