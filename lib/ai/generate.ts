import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { fullName } from "@/lib/utils";
import type { RenderLead } from "@/lib/email/render";

/** Short, stable description of VrindaaCorp used to ground every generated email. */
const COMPANY_CONTEXT = `VrindaaCorp Services is an integrated facility management company based in Greater Noida West, Uttar Pradesh, India. Services: hard services (HVAC, electrical, plumbing, preventive maintenance), cleaning & housekeeping, security, landscaping, energy management, corporate catering, business support, and compliance & safety. It serves corporate, healthcare, education, industrial, retail, hospitality, and residential clients.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ai.apiKey });
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(env.ai.apiKey);
}

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
- Address the recipient by first name and reference their company by name naturally.
- Tie the value proposition to their sector where relevant; do not invent facts about their company.
- Keep it concise (90-140 words), warm and specific — not generic or salesy.
- One clear call to action (a brief call/meeting). No emojis. No pushy language.
- Return the body as simple HTML using only <p> and <a> tags. Do NOT include a subject line, signature block, greeting duplication, or unsubscribe text in the body.`;

  const userPrompt = `Lead: ${name} at ${company} (sector: ${sector}).
Campaign step: ${stepLabel ?? "initial outreach"}.
Brief / offer to convey: ${brief}`;

  try {
    const res = await getClient().messages.create({
      model: env.ai.model,
      max_tokens: 1200,
      thinking: { type: "disabled" },
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              bodyHtml: { type: "string" },
            },
            required: ["subject", "bodyHtml"],
            additionalProperties: false,
          },
        },
      },
      system,
      messages: [{ role: "user", content: userPrompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("No text content returned");
    const parsed = JSON.parse(text.text) as { subject: string; bodyHtml: string };
    return { subject: parsed.subject.trim(), html: parsed.bodyHtml.trim(), generated: true };
  } catch {
    // Any failure (rate limit, refusal, parse error) → deterministic fallback so
    // the campaign never stalls on a single lead.
    return fallbackEmail(name, company, sector, brief);
  }
}

function fallbackEmail(name: string, company: string, sector: string, brief: string): GeneratedEmail {
  const firstName = name.split(" ")[0];
  const subject = `Facility management support for ${company}`;
  const html = `
    <p>Hi ${firstName},</p>
    <p>I'm reaching out from VrindaaCorp Services. We provide integrated facility management —
    housekeeping, security, technical maintenance, and catering — for ${sector} organizations like ${company}.</p>
    <p>${brief ? escapeHtml(brief) : "We'd love to understand your current facility needs and see if we can help streamline operations and costs."}</p>
    <p>Would you be open to a brief call this week? <a href="https://vrindaacorpservices.in">Learn more about us</a>.</p>
    <p>Warm regards,<br/>VrindaaCorp Services</p>`;
  return { subject, html: html.trim(), generated: false };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}
