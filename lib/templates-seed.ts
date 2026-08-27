import { prisma } from "@/lib/prisma";

export const INDUSTRY_DEFAULT_TEMPLATES = [
  {
    name: "[Corporate] Premium Executive Dining & Cafeteria Solutions",
    subjectA: "Transforming corporate dining & pantry operations at {{company}}",
    subjectB: "Catering & cafeteria excellence for {{company}}'s team",
    html: `<p>Hi {{firstName}},</p>
<p>I hope this note finds you well.</p>
<p>I am reaching out from <strong>VrindaaCorp</strong>. We partner with premier corporate organizations across {{city}} to deliver exceptional corporate cafeteria experiences, live gourmet chef counters, and daily executive pantry operations.</p>
<p>For leading corporate teams like {{company}}, our customized food services help boost employee satisfaction, promote wellness, and eliminate administrative overhead with automated cafeteria billing.</p>
<p>Would you have 10 minutes next Tuesday for a brief introductory conversation or a complimentary menu tasting session for your facility team?</p>
<p>Best regards,<br/><strong>VrindaaCorp Catering Services</strong><br/><em>sales@vrindaacorp.com</em></p>`,
  },
  {
    name: "[Healthcare] Hospital Dietary & Clinical Nutrition Services",
    subjectA: "NABH-compliant dietary catering & patient nutrition for {{company}}",
    subjectB: "24/7 clinical cafeteria & dietary management for {{company}}",
    html: `<p>Dear {{firstName}},</p>
<p>Healthcare facilities require the highest hygiene standards, strict therapeutic dietary adherence, and round-the-clock cafeteria support for medical staff.</p>
<p>At <strong>VrindaaCorp</strong>, we specialize in <strong>{{industryHook}}</strong> across leading hospitals and healthcare institutions in {{city}}.</p>
<p>Our dedicated hospital catering division ensures:
<ul>
  <li>Dietitian-formulated therapeutic patient meal plans (Diabetic, Renal, Low-Sodium).</li>
  <li>HACCP & FSSAI certified cleanroom kitchen hygiene.</li>
  <li>24/7 energized cafeteria & pantry support for doctors and nursing staff.</li>
</ul>
</p>
<p>Could we schedule a short 10-minute call this week to explore how we can support {{company}}'s dietary management?</p>
<p>Warm regards,<br/><strong>VrindaaCorp Healthcare Solutions</strong></p>`,
  },
  {
    name: "[Manufacturing] Industrial Plant & Shift Workforce Catering",
    subjectA: "High-volume plant cafeteria & shift dining operations for {{company}}",
    subjectB: "Hygienic industrial food management for {{company}}'s workforce",
    html: `<p>Hello {{firstName}},</p>
<p>Managing large-scale workforce nutrition across multiple continuous shifts is vital for industrial plant productivity and worker safety.</p>
<p><strong>VrindaaCorp</strong> manages industrial workforce dining facilities serving thousands of meals daily with zero downtime across {{geography}}.</p>
<p>Our industrial dining services include:
<ul>
  <li>Nutritious, high-energy meals tailored for industrial and factory workforces.</li>
  <li>Seamless shift-wise meal dispatch (Morning, Afternoon, Night shifts).</li>
  <li>Strict industrial safety, bio-waste management, and FSSAI grade-A hygiene.</li>
</ul>
</p>
<p>Let's connect for a brief 10-minute discovery call to discuss how we can enhance worker dining at {{company}}.</p>
<p>Best regards,<br/><strong>VrindaaCorp Industrial Dining</strong></p>`,
  },
  {
    name: "[Education] Institutional & Campus Dining Solutions",
    subjectA: "Nutritious campus dining & food court management for {{company}}",
    subjectB: "Student & faculty cafeteria solutions for {{company}}",
    html: `<p>Dear {{firstName}},</p>
<p>Providing wholesome, balanced, and student-favorite dining options is essential for educational campuses and institutions.</p>
<p>At <strong>VrindaaCorp</strong>, we manage vibrant campus food courts, hostel mess operations, and faculty cafeterias across premier institutions in {{city}}.</p>
<p>We would love to share how our flexible student meal plans and modern food court setups can elevate dining at {{company}}.</p>
<p>Would you be open to a quick call or campus visit next week?</p>
<p>Warm regards,<br/><strong>VrindaaCorp Campus Dining Team</strong></p>`,
  },
  {
    name: "[Hospitality] Hotel & Event Facility Catering Operations",
    subjectA: "Back-of-house staff cafeteria & event banquet catering for {{company}}",
    subjectB: "Hospitality food services & event dining partnership for {{company}}",
    html: `<p>Hi {{firstName}},</p>
<p>In the hospitality industry, delivering impeccable quality extends to your back-of-house team and banquet operations.</p>
<p><strong>VrindaaCorp</strong> partners with luxury hotels, resorts, and convention centers across {{city}} to provide seamless staff dining management and scalable banquet production support.</p>
<p>Could we arrange a brief introductory call with your operations head to discuss potential synergy with {{company}}?</p>
<p>Best regards,<br/><strong>VrindaaCorp Hospitality Division</strong></p>`,
  },
];

export async function ensureDefaultIndustryTemplates() {
  for (const tpl of INDUSTRY_DEFAULT_TEMPLATES) {
    const existing = await prisma.emailTemplate.findFirst({
      where: { name: tpl.name },
    });
    if (!existing) {
      await prisma.emailTemplate.create({
        data: {
          name: tpl.name,
          subjectA: tpl.subjectA,
          subjectB: tpl.subjectB,
          html: tpl.html,
          aiEnabled: false,
        },
      });
    }
  }
}

/**
 * Resolves the best email template for a lead:
 * If lead has a sector (e.g. Healthcare, Corporate, Manufacturing) and there is a matching
 * industry template, returns the industry template; otherwise uses the sequence step's default template.
 */
export async function resolveTemplateForLead(
  defaultTemplate: {
    id: string;
    name: string;
    subjectA: string;
    subjectB: string | null;
    html: string;
    aiEnabled: boolean;
    aiBrief: string | null;
  },
  lead: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    sector: string | null;
    city: string | null;
    geography: string | null;
  }
) {
  if (!lead.sector) return defaultTemplate;

  const sectorKey = lead.sector.trim();
  const matched = await prisma.emailTemplate.findFirst({
    where: {
      OR: [
        { name: { contains: `[${sectorKey}]`, mode: "insensitive" } },
        { name: { contains: sectorKey, mode: "insensitive" } },
      ],
    },
  });

  return matched ?? defaultTemplate;
}
