import { prisma } from "@/lib/prisma";

export type DirectiveCategory =
  | "pricing_policy"
  | "sector_preference"
  | "tone_and_style"
  | "standing_rule"
  | "client_instruction";

export type OwnerDirective = {
  id: string;
  category: DirectiveCategory;
  content: string;
  source: "owner_explicit" | "extracted_from_edit" | "extracted_from_confirmation";
  createdAt: string;
  updatedAt: string;
};

export type StrategicMemory = {
  version: number;
  lastUpdated: string;
  directives: OwnerDirective[];
};

const DEFAULT_DIRECTIVES: OwnerDirective[] = [
  {
    id: "dir_1",
    category: "standing_rule",
    content: "Always confirm understanding of the Owner's instructions and ask for confirmation before dispatching emails to clients or modifying campaigns.",
    source: "owner_explicit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dir_2",
    category: "pricing_policy",
    content: "Inaugural client discounts should be capped at 10% to 15% for the first quarter unless explicitly authorized by the Owner.",
    source: "owner_explicit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dir_3",
    category: "sector_preference",
    content: "Prioritize Corporate Offices, IT Parks, Healthcare Facilities, and Commercial Hubs in Delhi-NCR, Gurgaon, and Noida.",
    source: "owner_explicit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dir_4",
    category: "tone_and_style",
    content: "Client email tone must be professional, consultative, reassuring, and highlight our PSARA compliance and 24/7 supervisor audits.",
    source: "owner_explicit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dir_5",
    category: "standing_rule",
    content: "All inbound client email replies must be responded to within 30 minutes with a concrete meeting or phone call call-to-action.",
    source: "owner_explicit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dir_calendly",
    category: "standing_rule",
    content: "Whenever adding a 'book a call' option or meeting link to email templates or client replies, strictly use https://calendly.com/vrindaacorp-sales/30min and nothing else.",
    source: "owner_explicit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Retrieve the current Owner Strategic Memory profile from the database.
 */
export async function getOwnerStrategicMemory(): Promise<StrategicMemory> {
  try {
    const record = await prisma.inboundLeadLog.findFirst({
      where: { channel: "owner_strategic_memory" },
      orderBy: { createdAt: "desc" },
    });

    if (record && record.payload) {
      const parsed = record.payload as any;
      if (Array.isArray(parsed.directives) && parsed.directives.length > 0) {
        const existingIds = new Set(parsed.directives.map((d: any) => d.id));
        const mergedDirectives = [...parsed.directives];
        for (const def of DEFAULT_DIRECTIVES) {
          if (!existingIds.has(def.id)) {
            mergedDirectives.push(def);
          }
        }
        return {
          version: parsed.version || 1,
          lastUpdated: parsed.lastUpdated || record.createdAt.toISOString(),
          directives: mergedDirectives,
        };
      }
    }
  } catch (err) {
    console.warn("[getOwnerStrategicMemory error]:", err);
  }

  // Initialize and persist default memory
  const initialMemory: StrategicMemory = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    directives: DEFAULT_DIRECTIVES,
  };

  try {
    await prisma.inboundLeadLog.create({
      data: {
        channel: "owner_strategic_memory",
        status: "active",
        payload: initialMemory as any,
      },
    });
  } catch (err) {
    console.warn("[initializeStrategicMemory error]:", err);
  }

  return initialMemory;
}

/**
 * Add or update a directive in the Owner Strategic Memory.
 */
export async function saveDirective(
  category: DirectiveCategory,
  content: string,
  source: "owner_explicit" | "extracted_from_edit" | "extracted_from_confirmation" = "owner_explicit",
  existingId?: string
): Promise<StrategicMemory> {
  const current = await getOwnerStrategicMemory();
  const now = new Date().toISOString();

  let updatedList = [...current.directives];

  if (existingId) {
    updatedList = updatedList.map((d) =>
      d.id === existingId ? { ...d, category, content: content.trim(), updatedAt: now } : d
    );
  } else {
    // Avoid exact duplicate content
    const isDuplicate = updatedList.some(
      (d) => d.content.toLowerCase().trim() === content.toLowerCase().trim()
    );
    if (!isDuplicate) {
      updatedList.push({
        id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        category,
        content: content.trim(),
        source,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const updatedMemory: StrategicMemory = {
    version: current.version + 1,
    lastUpdated: now,
    directives: updatedList,
  };

  await prisma.inboundLeadLog.create({
    data: {
      channel: "owner_strategic_memory",
      status: "active",
      payload: updatedMemory as any,
    },
  });

  return updatedMemory;
}

/**
 * Delete a directive by ID.
 */
export async function deleteDirective(id: string): Promise<StrategicMemory> {
  const current = await getOwnerStrategicMemory();
  const updatedList = current.directives.filter((d) => d.id !== id);

  const updatedMemory: StrategicMemory = {
    version: current.version + 1,
    lastUpdated: new Date().toISOString(),
    directives: updatedList,
  };

  await prisma.inboundLeadLog.create({
    data: {
      channel: "owner_strategic_memory",
      status: "active",
      payload: updatedMemory as any,
    },
  });

  return updatedMemory;
}

/**
 * Automatically analyze Owner edits or instructions to extract lasting strategic rules.
 */
export async function autoLearnFromOwnerAction(args: {
  userMessage: string;
  leadContext?: { company?: string; sector?: string };
}) {
  const { userMessage, leadContext } = args;
  const lower = userMessage.toLowerCase().trim();

  // Pattern 1: Pricing / Discount Directives
  if (lower.includes("discount") || lower.includes("price") || lower.includes("pricing") || lower.includes("rate")) {
    const match = lower.match(/(offer|give|cap|keep|maximum|max|limit)?\s*(\d{1,2}%)\s*(discount|off)?/i);
    if (match && match[2]) {
      const discount = match[2];
      await saveDirective(
        "pricing_policy",
        `Owner approved discount guideline: "${discount} discount for qualifying client proposals (${userMessage.slice(0, 100)})".`,
        "extracted_from_edit"
      );
    }
  }

  // Pattern 2: Sector / Industry Preferences
  if (lower.includes("pause") || lower.includes("hold") || lower.includes("stop") || lower.includes("focus on")) {
    const sectorKeywords = ["manufacturing", "healthcare", "corporate", "logistics", "education", "retail", "tech", "real estate"];
    for (const sec of sectorKeywords) {
      if (lower.includes(sec)) {
        await saveDirective(
          "sector_preference",
          `Sector policy updated by Owner: "${userMessage.slice(0, 120)}".`,
          "extracted_from_edit"
        );
        break;
      }
    }
  }

  // Pattern 3: Explicit "Remember" / "Rule" / "Always" / "Never"
  if (lower.startsWith("remember") || lower.includes("always ") || lower.includes("never ") || lower.includes("rule:")) {
    await saveDirective(
      "standing_rule",
      userMessage.replace(/^(remember that|remember to|remember|rule:)\s*/i, "").trim(),
      "owner_explicit"
    );
  }
}

/**
 * Formats the Owner's Strategic Memory into a crisp, high-priority block for Ollama prompts.
 */
export function formatMemoryForPrompt(memory: StrategicMemory): string {
  if (!memory.directives || memory.directives.length === 0) {
    return "No standing owner directives set.";
  }

  const lines = memory.directives.map((d) => {
    const cat = d.category.replace(/_/g, " ").toUpperCase();
    return `• [${cat}]: ${d.content}`;
  });

  return `[OWNER'S STRATEGIC PLAYBOOK & STANDING DIRECTIVES]
${lines.join("\n")}
*CRITICAL: All generated drafts, recommendations, and actions MUST strictly align with the Owner's directives above.*`;
}
