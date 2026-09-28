import { prisma } from "@/lib/prisma";
import { getOwnerStrategicMemory, formatMemoryForPrompt } from "@/lib/ai/strategic-memory";

export type DigitalEmployeeProfile = {
  name: string;
  role: string;
  company: string;
  timeZone: string;
  ownerPhone?: string;
  activeDirectivesCount: number;
};

/**
 * Provides context and memory for the VrindaaCorp Digital Employee AI Agent.
 */
export async function getDigitalEmployeeContext(userPhone: string): Promise<{
  profile: DigitalEmployeeProfile;
  memoryPrompt: string;
}> {
  const memory = await getOwnerStrategicMemory();
  const memoryPrompt = formatMemoryForPrompt(memory);

  const profile: DigitalEmployeeProfile = {
    name: "VrindaaCorp AI Chief of Staff",
    role: "Autonomous Sales & Operations Digital Employee",
    company: "VrindaaCorp Services",
    timeZone: "Asia/Kolkata (IST)",
    ownerPhone: userPhone,
    activeDirectivesCount: memory.directives?.length || 0,
  };

  return { profile, memoryPrompt };
}
