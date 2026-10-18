import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ingestLead } from "@/lib/inbound/ingest";
import { rateLimit } from "@/lib/rate-limit";
import { rejectOversized, websiteFormSchema } from "@/lib/validation/inbound";
import { sendNotificationEmail } from "@/lib/ses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Form-Secret",
};

export function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

/**
 * Website contact-form intake. The site posts JSON here. Protected by a shared
 * secret (INBOUND_FORM_SECRET) sent as the X-Form-Secret header or ?token=,
 * plus a honeypot field ("website") that real users never fill.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { bucket: "inbound-form", limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const oversized = rejectOversized(req);
  if (oversized) return oversized;

  const secret = env.inbound.formSecret;
  if (secret) {
    const header = req.headers.get("x-form-secret");
    const token = req.nextUrl.searchParams.get("token");
    if (header !== secret && token !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors });
  }

  const parsed = websiteFormSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400, headers: cors }
    );
  }
  const body = parsed.data;

  // Honeypot: silently accept but drop obvious bots.
  if (body.website) {
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const result = await ingestLead({
    channel: "website_form",
    email: body.email,
    firstName: body.firstName ?? body.name,
    lastName: body.lastName,
    company: body.company,
    phone: body.phone,
    sector: body.sector,
    city: body.city,
    sourceDetail: body.source ?? body.page,
    raw: rawBody,
  });

  // If lead was accepted (created or duplicate touch), send notification email to info@vrindaacorp.com
  if (result.status !== "error" && result.status !== "invalid") {
    const leadName = [body.firstName, body.lastName].filter(Boolean).join(" ") || body.name || "Prospective Client";
    const leadCompany = body.company ? ` (${body.company})` : "";
    const subject = `🔔 New Website Lead: ${leadName}${leadCompany}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
        <div style="background-color: #0f766e; color: #ffffff; padding: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">New Website Lead Received</h2>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Site Assessment & Inquiry Form</p>
        </div>
        <div style="padding: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: 600; width: 140px; color: #64748b;">Full Name:</td>
              <td style="padding: 10px 0; font-weight: 600; color: #0f172a;">${leadName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Email:</td>
              <td style="padding: 10px 0;"><a href="mailto:${body.email}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${body.email}</a></td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Mobile:</td>
              <td style="padding: 10px 0;"><a href="tel:${body.phone || ''}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${body.phone || 'N/A'}</a></td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Company:</td>
              <td style="padding: 10px 0; color: #0f172a;">${body.company || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Site Type:</td>
              <td style="padding: 10px 0; color: #0f172a;">${body.sector || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: 600; color: #64748b;">City:</td>
              <td style="padding: 10px 0; color: #0f172a;">${body.city || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Details:</td>
              <td style="padding: 10px 0; color: #0f172a;">${body.source || 'Website Site Assessment Form'}</td>
            </tr>
          </table>

          <div style="margin-top: 24px; text-align: center;">
            <a href="https://vrindaacorp-crm.tech/leads" style="display: inline-block; background-color: #0f766e; color: #ffffff; padding: 12px 24px; font-weight: 600; border-radius: 6px; text-decoration: none; font-size: 14px;">Open Lead in VrindaaCorp CRM →</a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 14px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          Notification dispatched by VrindaaCorp Automated Lead Intake System
        </div>
      </div>
    `;

    try {
      await sendNotificationEmail("info@vrindaacorp.com", subject, html);
    } catch (err) {
      console.error("Failed to send lead alert email to info@vrindaacorp.com:", err);
    }
  }

  return NextResponse.json({ ok: result.status !== "error", ...result }, { headers: cors });
}
