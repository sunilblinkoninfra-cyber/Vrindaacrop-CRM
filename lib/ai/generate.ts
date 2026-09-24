import { fullName } from "@/lib/utils";
import { chatJSON, isAiConfigured } from "@/lib/ai/client";
import { CALENDLY_BOOKING_URL } from "@/lib/constants";
import type { RenderLead } from "@/lib/email/render";

export { isAiConfigured };

/** Short, stable description of VrindaaCorp used to ground every generated email. */
export const COMPANY_CONTEXT = `VrindaaCorp Services is an integrated facility management company based in Greater Noida West, Uttar Pradesh, India. Services: hard services (HVAC, electrical, plumbing, preventive maintenance), cleaning & housekeeping, security, landscaping, energy management, corporate catering, business support, and compliance & safety. It serves corporate, healthcare, education, industrial, retail, hospitality, and residential clients. Official Meeting Scheduling Link: https://calendly.com/vrindaacorp-sales/30min`;

export type GeneratedEmail = { subject: string; html: string; generated: boolean };

/**
 * Generate a personalized outreach email for a lead using their name, company,
 * sector and the campaign brief. Returns { generated: true } when produced by
 * the model, or a deterministic templated fallback ({ generated: false }) when
 * no ANTHROPIC_API_KEY is configured — so the outreach flow works offline.
 */
export async function generateEmail(args: {
  lead: RenderLead;
  brief: string;
  stepLabel?: string; // e.g. "initial outreach", "follow-up 1"
}): Promise<GeneratedEmail> {
  const { lead, brief, stepLabel } = args;
  const name = fullName(lead.firstName, lead.lastName) || "there";
  const company = lead.company || "your organization";
  const sector = lead.sector || "your sector";

  if (!isAiConfigured()) {
    return fallbackEmail(name, company, sector, brief);
  }

  const system = `You are an expert B2B outreach copywriter for VrindaaCorp Services.
${COMPANY_CONTEXT}

Write a short, professional, personalized cold outreach email. Rules:
- In the "subject" field, generate a concise, engaging B2B subject line (under 60 characters) relevant to their sector.
- In the "bodyHtml" field, address the recipient by first name and reference their company by name naturally.
- Tie the value proposition to their sector where relevant; do not invent facts about their company.
- Keep it concise (90-140 words), warm and specific — not generic or salesy.
- One clear call to action (a brief call/meeting). No emojis. No pushy language.
- MANDATORY BOOK A CALL LINK: If you add an option or link to book a call or schedule a meeting, you MUST strictly use https://calendly.com/vrindaacorp-sales/30min (e.g. <a href="https://calendly.com/vrindaacorp-sales/30min">Book a 30-min call</a>) and NOTHING ELSE. Never use any other link or placeholder.
- Return the body as simple HTML using only <p> and <a> tags. Do NOT include duplicate subject lines, signature blocks, or unsubscribe text inside bodyHtml.`;

  const userPrompt = `Lead: ${name} at ${company} (sector: ${sector}).
Campaign step: ${stepLabel ?? "initial outreach"}.
Brief / offer to convey: ${brief}`;

  const parsed = await chatJSON<{ subject: string; bodyHtml: string }>({
    system,
    user: userPrompt,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        bodyHtml: { type: "string" },
      },
      required: ["subject", "bodyHtml"],
      additionalProperties: false,
    },
  });

  const bodyHtml = parsed?.bodyHtml?.trim();
  if (!bodyHtml) {
    // Provider unavailable / parse failure → deterministic fallback so a campaign
    // never stalls on a single lead.
    return fallbackEmail(name, company, sector, brief);
  }

  const subject = parsed?.subject?.trim() || `Facility management support for ${company}`;
  return { subject, html: bodyHtml, generated: true };
}

function fallbackEmail(name: string, company: string, sector: string, brief: string): GeneratedEmail {
  const firstName = name.split(" ")[0];
  const subject = `Facility management support for ${company}`;
  const html = `
    <p>Hi ${firstName},</p>
    <p>I'm reaching out from VrindaaCorp Services. We provide integrated facility management —
    housekeeping, security, technical maintenance, and catering — for ${sector} organizations like ${company}.</p>
    <p>${brief ? escapeHtml(brief) : "We'd love to understand your current facility needs and see if we can help streamline operations and costs."}</p>
    <p>Would you be open to a brief call this week? Feel free to <a href="${CALENDLY_BOOKING_URL}">book a 30-min call here</a> at your convenience.</p>
    <p>Warm regards,<br/>VrindaaCorp Services</p>`;
  return { subject, html: html.trim(), generated: false };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}
