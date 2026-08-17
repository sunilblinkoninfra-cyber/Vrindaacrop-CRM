import { NextRequest, NextResponse } from "next/server";
import { generateEmail, isAiConfigured } from "@/lib/ai/generate";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const maxDuration = 60;

// Generate a sample AI email for a representative lead so the user can preview
// what an AI-enabled template will produce before launching a campaign.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!isOwnerOrAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const brief = String(body.brief ?? "").trim();
  if (!brief) return NextResponse.json({ error: "Provide a brief to generate from." }, { status: 400 });

  const sample = {
    id: "preview",
    firstName: body.firstName || "Rahul",
    lastName: body.lastName || "Sharma",
    company: body.company || "Apex Towers",
    sector: body.sector || "Corporate",
    email: "preview@example.com",
  };

  const result = await generateEmail({ lead: sample, brief, stepLabel: "initial outreach" });
  return NextResponse.json({ ...result, configured: isAiConfigured() });
}
