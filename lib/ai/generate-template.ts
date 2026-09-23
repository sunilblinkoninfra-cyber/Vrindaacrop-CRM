import { chatJSON, isAiConfigured } from "@/lib/ai/client";
import { COMPANY_CONTEXT } from "@/lib/ai/generate";
import { getIndustryHook } from "@/lib/email/render";

export type GeneratedTemplateResult = {
  name: string;
  subjectA: string;
  subjectB: string;
  html: string;
  aiGenerated: boolean;
};

/**
 * Generate a complete B2B outreach email template using Ollama AI deployed on the VPS.
 * If sector/industry is not provided, crafts a comprehensive facility management &
 * workplace dining outreach template grounded in VrindaaCorp's service capabilities.
 * 
 * If Ollama is offline or unconfigured, gracefully falls back to a deterministic,
 * high-converting template so the user is never blocked.
 */
export async function generateTemplateWithOllama(args: {
  campaignName?: string;
  campaignDescription?: string;
  sector?: string | null;
  stepOrder?: number;
}): Promise<GeneratedTemplateResult> {
  const { campaignName = "B2B Outreach", campaignDescription, sector, stepOrder = 0 } = args;
  const isFollowUp = stepOrder > 0;
  const sectorLabel = sector?.trim();

  // If AI is configured (Ollama on VPS or Anthropic), attempt generation
  if (isAiConfigured()) {
    try {
      const system = `You are a premier B2B outreach copywriter and email marketing strategist for VrindaaCorp Services.
${COMPANY_CONTEXT}

Your goal is to write a high-converting, professional cold outreach email template.
Rules:
- The template must contain standard merge variables in double curly braces: {{firstName}}, {{company}}, {{city}}, {{geography}}.
- Provide two high-converting subject lines for A/B testing:
  - "subjectA": concise (under 60 characters), value-oriented.
  - "subjectB": compelling curiosity/benefit angle (under 60 characters).
- "html": clean HTML body using only <p>, <a>, <strong>, and <ul>/<li> tags.
- Mention VrindaaCorp's core facility management, housekeeping, technical maintenance, and corporate catering solutions.
- Keep the body concise (90-130 words), polite, and tailored. One clear call-to-action for a brief 10-minute discovery call.
- Do NOT include duplicate subject lines, signature placeholders, or unsubscribe text inside bodyHtml.`;

      const userPrompt = sectorLabel
        ? `Campaign: "${campaignName}".
Sector/Industry: "${sectorLabel}".
Step: ${isFollowUp ? `Follow-up Step ${stepOrder}` : "Initial Introduction"}.
Brief: ${campaignDescription || `Tailored outreach for ${sectorLabel} organizations.`}`
        : `Campaign: "${campaignName}".
Sector/Industry: NOT SPECIFIED (General Commercial / Corporate Outreach).
Step: ${isFollowUp ? `Follow-up Step ${stepOrder}` : "Initial Introduction"}.
Brief: ${campaignDescription || "Comprehensive facility management, workplace cafeteria & operational excellence for corporate organizations."}`;

      const parsed = await chatJSON<{
        name?: string;
        subjectA: string;
        subjectB: string;
        html: string;
      }>({
        system,
        user: userPrompt,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            subjectA: { type: "string" },
            subjectB: { type: "string" },
            html: { type: "string" },
          },
          required: ["subjectA", "subjectB", "html"],
          additionalProperties: false,
        },
      });

      if (parsed?.subjectA && parsed?.html) {
        const cleanHtml = parsed.html.trim();
        const templateName =
          parsed.name?.trim() ||
          (sectorLabel
            ? `[Ollama AI] [${sectorLabel}] ${campaignName} - Step ${stepOrder + 1}`
            : `[Ollama AI] Facility Solutions: ${campaignName} - Step ${stepOrder + 1}`);

        return {
          name: templateName,
          subjectA: parsed.subjectA.trim(),
          subjectB: parsed.subjectB?.trim() || `Exploring facility management support for {{company}}`,
          html: cleanHtml,
          aiGenerated: true,
        };
      }
    } catch (err) {
      console.warn("[generateTemplateWithOllama] Ollama AI call failed, using deterministic template:", err);
    }
  }

  // Graceful deterministic fallback when Ollama is offline/unconfigured
  return fallbackTemplate(campaignName, sectorLabel, stepOrder);
}

function fallbackTemplate(
  campaignName: string,
  sector?: string,
  stepOrder: number = 0
): GeneratedTemplateResult {
  const isFollowUp = stepOrder > 0;

  if (sector) {
    const hook = getIndustryHook(sector);
    if (isFollowUp) {
      return {
        name: `[Auto] [${sector}] Follow-up Step ${stepOrder + 1}`,
        subjectA: `Quick follow-up regarding facility services for {{company}}`,
        subjectB: `Following up: ${sector} operations & catering at {{company}}`,
        html: `<p>Hi {{firstName}},</p>
<p>I wanted to briefly follow up on my earlier note regarding facility management and catering support for {{company}} in {{city}}.</p>
<p>At <strong>VrindaaCorp</strong>, we specialize in ${hook}. We help organizations like yours maintain seamless day-to-day operations while reducing vendor overhead.</p>
<p>Would you have 5 to 10 minutes for a brief introductory call this week?</p>
<p>Best regards,<br/><strong>VrindaaCorp Services</strong><br/><em>sales@vrindaacorp.com</em></p>`,
        aiGenerated: false,
      };
    }

    return {
      name: `[Auto] [${sector}] Outreach Step ${stepOrder + 1}`,
      subjectA: `Integrated facility & catering solutions for {{company}}`,
      subjectB: `Enhancing workplace operations at {{company}} in {{city}}`,
      html: `<p>Hi {{firstName}},</p>
<p>I am reaching out from <strong>VrindaaCorp Services</strong>. We partner with premier ${sector} organizations across {{city}} and {{geography}} to deliver end-to-end facility management and staff catering solutions.</p>
<p>Our dedicated team oversees ${hook} with stringent quality compliance, 24/7 technical maintenance (HVAC, electrical, plumbing), and ISO-certified hygiene protocols.</p>
<p>Would you be open to a quick 10-minute discovery call next week to see how we can assist {{company}}?</p>
<p>Warm regards,<br/><strong>VrindaaCorp Services</strong><br/><em>sales@vrindaacorp.com</em></p>`,
      aiGenerated: false,
    };
  }

  // General fallback when Industry is NOT provided
  if (isFollowUp) {
    return {
      name: `[Ollama AI Fallback] General Facility Follow-up Step ${stepOrder + 1}`,
      subjectA: `Quick follow-up on facility operations for {{company}}`,
      subjectB: `Streamlining workplace management for {{company}}`,
      html: `<p>Hi {{firstName}},</p>
<p>I hope you are having a productive week.</p>
<p>I wanted to quickly follow up on my previous message. At <strong>VrindaaCorp Services</strong>, we help growing organizations in {{city}} manage their facility operations—including workplace housekeeping, technical maintenance, and executive cafeteria services—under one reliable umbrella.</p>
<p>Could we schedule a brief 10-minute introductory conversation this Thursday or Friday?</p>
<p>Warm regards,<br/><strong>VrindaaCorp Operations Team</strong><br/><em>sales@vrindaacorp.com</em></p>`,
      aiGenerated: false,
    };
  }

  return {
    name: `[Ollama AI Fallback] Comprehensive Facility & Workplace Solutions`,
    subjectA: `Streamlining facility operations & employee dining at {{company}}`,
    subjectB: `Integrated facility management partnership for {{company}}`,
    html: `<p>Hi {{firstName}},</p>
<p>I hope this email finds you well.</p>
<p>I am reaching out from <strong>VrindaaCorp Services</strong>. We provide integrated facility management—encompassing technical maintenance (HVAC, electrical, plumbing), premium housekeeping, 24/7 security, and corporate cafeteria operations—for leading enterprises across {{city}}.</p>
<p>Our unified model eliminates the hassle of managing multiple fragmented vendors, ensuring verified quality benchmarks, regulatory safety compliance, and up to 15-20% cost efficiency for {{company}}.</p>
<p>Would you be open to a brief 10-minute introductory call next week to discuss your current facility requirements?</p>
<p>Best regards,<br/><strong>VrindaaCorp Business Solutions</strong><br/><em>sales@vrindaacorp.com</em></p>`,
    aiGenerated: false,
  };
}
