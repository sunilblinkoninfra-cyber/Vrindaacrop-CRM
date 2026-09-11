import { fullName } from "@/lib/utils";
import { chatJSON, isAiConfigured } from "@/lib/ai/client";
import { COMPANY_CONTEXT } from "@/lib/ai/generate";
import type { Lead } from "@prisma/client";

export type ReplyDraftOutput = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  generated: boolean;
};

/**
 * Generate or iteratively revise a contextual reply draft to an inbound client email.
 * When revisionFeedback is supplied from WhatsApp, the model inculcates the agent's
 * specific instructions into the draft while preserving a polished B2B tone.
 */
export async function generateProposedReply(args: {
  lead: Pick<Lead, "firstName" | "lastName" | "company" | "sector" | "email">;
  inboundSubject?: string | null;
  inboundBody: string;
  currentDraft?: { subject: string; bodyHtml: string; bodyText?: string } | null;
  revisionFeedback?: string | null;
}): Promise<ReplyDraftOutput> {
  const { lead, inboundSubject, inboundBody, currentDraft, revisionFeedback } = args;
  const name = fullName(lead.firstName, lead.lastName) || "there";
  const firstName = name.split(" ")[0];
  const company = lead.company || "your company";
  const sector = lead.sector || "facility management";

  const isRevision = Boolean(revisionFeedback && currentDraft);

  if (!isAiConfigured()) {
    return fallbackReplyDraft({
      name,
      firstName,
      company,
      sector,
      inboundBody,
      revisionFeedback,
      currentDraft,
    });
  }

  const system = `You are the Senior Communications Director and Enterprise Account Executive for VrindaaCorp Services.
${COMPANY_CONTEXT}

Your goal: Craft high-converting, professional, courteous B2B email responses to prospective clients who have replied to VrindaaCorp's outreach.

Strict Rules:
- Address the client warmly by their first name (${firstName}).
- Reference their company (${company}) naturally.
- Explicitly answer their question or acknowledge their statement from their inbound email.
- Highlight VrindaaCorp's proven capabilities (e.g., customized SLAs, 24/7 technical helpdesk, trained staff, local Greater Noida West / NCR rapid response).
- Include a clear, frictionless call to action (e.g., a 10-minute introductory call, site audit, or sharing an itemized proposal).
- Keep length between 80-150 words. Professional, sharp, confident, human tone. No fluffy jargon.
- Format bodyHtml with clean <p> and <a> tags only.
- Format bodyText with clean plain text suitable for WhatsApp preview.
${
  isRevision
    ? `CRITICAL REVISION INSTRUCTION:
The sales agent reviewed the previous draft and gave this explicit instruction on WhatsApp:
"${revisionFeedback}"
Incorporate this feedback completely into the revised draft (e.g. adjust meeting timings, discounts, scope of services, or tone).`
    : ""
}`;

  const userPrompt = isRevision
    ? `Client: ${name} at ${company} (Sector: ${sector})
Client's original inbound email:
"""
Subject: ${inboundSubject || "Outreach response"}
${inboundBody}
"""

Previous Draft:
Subject: ${currentDraft?.subject}
Body:
${currentDraft?.bodyText || currentDraft?.bodyHtml}

Agent's Requested Changes:
"${revisionFeedback}"

Please update the draft to incorporate the agent's feedback while maintaining VrindaaCorp standards.`
    : `Client: ${name} at ${company} (Sector: ${sector})
Client's inbound revert:
"""
Subject: ${inboundSubject || "Outreach response"}
${inboundBody}
"""

Please draft a prompt, professional B2B reply from VrindaaCorp Services addressing their inquiry.`;

  try {
    const parsed = await chatJSON<{
      subject: string;
      bodyHtml: string;
      bodyText: string;
    }>({
      system,
      user: userPrompt,
      schema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          bodyHtml: { type: "string" },
          bodyText: { type: "string" },
        },
        required: ["subject", "bodyHtml", "bodyText"],
        additionalProperties: false,
      },
    });

    if (!parsed?.subject || !parsed?.bodyHtml) {
      return fallbackReplyDraft({
        name,
        firstName,
        company,
        sector,
        inboundBody,
        revisionFeedback,
        currentDraft,
      });
    }

    return {
      subject: parsed.subject.trim(),
      bodyHtml: parsed.bodyHtml.trim(),
      bodyText: (parsed.bodyText || stripHtml(parsed.bodyHtml)).trim(),
      generated: true,
    };
  } catch {
    return fallbackReplyDraft({
      name,
      firstName,
      company,
      sector,
      inboundBody,
      revisionFeedback,
      currentDraft,
    });
  }
}

function fallbackReplyDraft(args: {
  name: string;
  firstName: string;
  company: string;
  sector: string;
  inboundBody: string;
  revisionFeedback?: string | null;
  currentDraft?: { subject: string; bodyHtml: string; bodyText?: string } | null;
}): ReplyDraftOutput {
  const { firstName, company, sector, revisionFeedback, currentDraft } = args;

  if (revisionFeedback && currentDraft) {
    const cleanFeedback = revisionFeedback.trim();
    const subject = currentDraft.subject.startsWith("Re:")
      ? currentDraft.subject
      : `Re: ${currentDraft.subject}`;
    const bodyHtml = `
      <p>Hi ${firstName},</p>
      <p>Thank you for getting back to us regarding facility management support for ${company}.</p>
      <p>Regarding your note: <em>${escapeHtml(cleanFeedback)}</em>. We are pleased to accommodate this and have updated our proposed plan accordingly.</p>
      <p>VrindaaCorp provides integrated technical maintenance (HVAC, electrical, plumbing), housekeeping, and security tailored for ${sector} facilities in Delhi-NCR.</p>
      <p>Would you be open to a quick 10-minute discovery call or a preliminary site inspection this week?</p>
      <p>Warm regards,<br/>VrindaaCorp Client Services<br/><a href="https://vrindaacorp.com">vrindaacorp.com</a></p>
    `.trim();

    const bodyText = `Hi ${firstName},\n\nThank you for getting back to us regarding facility management support for ${company}.\n\nRegarding your note: ${cleanFeedback}. We are pleased to accommodate this and have updated our plan accordingly.\n\nVrindaaCorp provides integrated technical maintenance (HVAC, electrical, plumbing), housekeeping, and security tailored for ${sector} facilities in Delhi-NCR.\n\nWould you be open to a quick 10-minute discovery call or preliminary site inspection this week?\n\nWarm regards,\nVrindaaCorp Client Services\nvrindaacorp.com`;

    return {
      subject,
      bodyHtml,
      bodyText,
      generated: false,
    };
  }

  const subject = `Re: Facility management services for ${company}`;
  const bodyHtml = `
    <p>Hi ${firstName},</p>
    <p>Thank you for getting in touch with us regarding facility management services for ${company}.</p>
    <p>At VrindaaCorp Services, we specialize in end-to-end facility management — including hard maintenance (HVAC, electrical, plumbing), professional housekeeping, security, and corporate support for ${sector} facilities across Delhi-NCR and Greater Noida.</p>
    <p>We would love to share a customized scope of work and see how we can optimize your operational efficiency and service uptime.</p>
    <p>Would you be available for a brief 10-minute call or a complimentary site visit this week?</p>
    <p>Best regards,<br/>VrindaaCorp Client Services<br/><a href="https://vrindaacorp.com">vrindaacorp.com</a> | sales@vrindaacorp.com</p>
  `.trim();

  const bodyText = `Hi ${firstName},\n\nThank you for getting in touch with us regarding facility management services for ${company}.\n\nAt VrindaaCorp Services, we specialize in end-to-end facility management — including hard maintenance (HVAC, electrical, plumbing), professional housekeeping, security, and corporate support for ${sector} facilities across Delhi-NCR and Greater Noida.\n\nWe would love to share a customized scope of work and see how we can optimize your operational efficiency and service uptime.\n\nWould you be available for a brief 10-minute call or a complimentary site visit this week?\n\nBest regards,\nVrindaaCorp Client Services\nvrindaacorp.com | sales@vrindaacorp.com`;

  return {
    subject,
    bodyHtml,
    bodyText,
    generated: false,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}
