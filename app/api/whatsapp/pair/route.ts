import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";
import QRCode from "qrcode";

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
 * Fetches or generates a high-contrast, scannable PNG Data URL for WhatsApp pairing.
 * Handles auto-creation of missing instances and raw Baileys pairing strings.
 */
async function fetchOrGenerateQr(instanceName: string): Promise<{
  base64Qr: string | null;
  pairingCode: string | null;
}> {
  let connectRes = await evoFetch(`/instance/connect/${instanceName}`);

  // If instance is missing (404/400) or fails, re-create the instance automatically
  if (!connectRes.ok) {
    console.log(`[Evolution API] Instance ${instanceName} missing or closed. Auto-creating instance...`);
    await evoFetch(`/instance/create`, {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        token: EVO_KEY,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    connectRes = await evoFetch(`/instance/connect/${instanceName}`);
  }

  if (!connectRes.ok) {
    return { base64Qr: null, pairingCode: null };
  }

  const connectData = await connectRes.json().catch(() => ({}));

  // Extract raw base64 or code string across potential schema variants
  const rawBase64 = connectData?.base64 || connectData?.qrcode?.base64 || null;
  const rawCode = connectData?.code || connectData?.qrcode?.code || connectData?.pairingCode || null;
  const pairingCode = connectData?.pairingCode || connectData?.qrcode?.pairingCode || null;

  // 1. If raw WhatsApp pairing code string (e.g. "2@...") exists, convert to high-contrast 400x400 PNG Data URL
  if (rawCode && typeof rawCode === "string" && rawCode.length > 5) {
    try {
      const generatedPng = await QRCode.toDataURL(rawCode, {
        errorCorrectionLevel: "M",
        margin: 4, // Strict 4-module quiet zone (white margin) required by WhatsApp scanner
        width: 400,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      return { base64Qr: generatedPng, pairingCode };
    } catch (err: any) {
      console.warn("[QRCode generation from raw string failed]:", err.message);
    }
  }

  // 2. If base64 PNG string exists
  if (rawBase64 && typeof rawBase64 === "string") {
    let clean = rawBase64.trim();
    if (!clean.startsWith("data:image/")) {
      clean = `data:image/png;base64,${clean}`;
    }
    return { base64Qr: clean, pairingCode };
  }

  return { base64Qr: null, pairingCode };
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
    let connectedPhone = dbUser?.whatsappNumber || "";

    // 1. Check live connection state (Lightweight & Safe)
    try {
      const stateRes = await evoFetch(`/instance/connectionState/${INSTANCE}`);
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        state = stateData?.instance?.state || "close";

        // Extract phone number of the linked WhatsApp account upon successful scan
        const rawOwner = stateData?.instance?.owner || stateData?.instance?.ownerJid || stateData?.owner || null;
        if (rawOwner && typeof rawOwner === "string") {
          const cleanDigits = rawOwner.replace(/@.*$/, "").replace(/[^\d]/g, "");
          if (cleanDigits && cleanDigits.length >= 10) {
            connectedPhone = `+${cleanDigits}`;
            // Auto-authorize linked number in database for the logged-in user
            if (user.id && dbUser?.whatsappNumber !== connectedPhone) {
              await prisma.user.update({
                where: { id: user.id },
                data: { whatsappNumber: connectedPhone },
              }).catch(() => undefined);
            }
          }
        }
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
        phone: connectedPhone,
        email: dbUser?.email || user.email,
        role: dbUser?.role || user.role,
        gateway: env.whatsapp.gateway,
      });
    }

    // 2. Initial load or explicit QR fetch: fetch QR code only if instance is not already open
    let base64Qr: string | null = null;
    let pairingCode: string | null = null;

    if (state !== "open") {
      const qrResult = await fetchOrGenerateQr(INSTANCE);
      base64Qr = qrResult.base64Qr;
      pairingCode = qrResult.pairingCode;
    }

    return NextResponse.json({
      ok: true,
      state,
      phone: connectedPhone,
      email: dbUser?.email || user.email,
      role: dbUser?.role || user.role,
      base64Qr,
      pairingCode,
      gateway: env.whatsapp.gateway,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Handles QR refresh, test message, phone save, instance reset, and disconnect
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
      const formatted = cleanPhone.startsWith("+") ? cleanPhone : cleanPhone ? `+${cleanPhone}` : "";
      await prisma.user.update({
        where: { id: user.id },
        data: { whatsappNumber: formatted || null },
      });
      return NextResponse.json({ ok: true, phone: formatted, message: "Authorized notification phone updated." });
    }

    if (action === "refresh_qr") {
      const qrResult = await fetchOrGenerateQr(INSTANCE);
      return NextResponse.json({
        ok: true,
        base64Qr: qrResult.base64Qr,
        pairingCode: qrResult.pairingCode,
      });
    }

    if (action === "recreate_instance" || action === "reset_instance") {
      try {
        await evoFetch(`/instance/delete/${INSTANCE}`, { method: "DELETE" }).catch(() => null);
      } catch {}

      await evoFetch(`/instance/create`, {
        method: "POST",
        body: JSON.stringify({
          instanceName: INSTANCE,
          token: EVO_KEY,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });

      const qrResult = await fetchOrGenerateQr(INSTANCE);
      return NextResponse.json({
        ok: true,
        base64Qr: qrResult.base64Qr,
        pairingCode: qrResult.pairingCode,
        message: "WhatsApp instance reset & recreated successfully.",
      });
    }

    if (action === "send_test") {
      const targetPhone = body.phone || dbUser?.whatsappNumber;
      if (!targetPhone) {
        return NextResponse.json({ error: "No authorized WhatsApp phone number linked yet. Please scan the QR code to link your device." }, { status: 400 });
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
