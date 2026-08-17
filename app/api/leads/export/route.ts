import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere } from "@/lib/leads-query";
import { getSessionUser, leadScopeWhere } from "@/lib/rbac";

export const runtime = "nodejs";

// Export campaign-ready CSV, honouring the same filters as the leads list.
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await getSessionUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Agents export only their own leads.
  const where = { AND: [buildLeadWhere(req.nextUrl.searchParams), leadScopeWhere(user)] };
  const leads = await prisma.lead.findMany({ where, orderBy: { createdAt: "desc" } });

  const header = [
    "firstName",
    "lastName",
    "company",
    "email",
    "phone",
    "sector",
    "city",
    "geography",
    "stage",
    "validationStatus",
    "isSuppressed",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const l of leads) {
    lines.push(
      [
        l.firstName,
        l.lastName,
        l.company,
        l.email,
        l.phone,
        l.sector,
        l.city,
        l.geography,
        l.stage,
        l.validationStatus,
        l.isSuppressed,
      ]
        .map(escape)
        .join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vrindaacorp-leads-${Date.now()}.csv"`,
    },
  });
}
