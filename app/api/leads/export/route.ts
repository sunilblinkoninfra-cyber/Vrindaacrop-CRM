import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere } from "@/lib/leads-query";

export const runtime = "nodejs";

// Export campaign-ready CSV, honouring the same filters as the leads list.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const where = buildLeadWhere(req.nextUrl.searchParams);
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
