import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere } from "@/lib/leads-query";
import { getSessionUser, leadScopeWhere } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const HEADER = [
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
] as const;

const BATCH_SIZE = 500;

function escape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowToCsv(l: Record<string, unknown>): string {
  return HEADER.map((k) => escape(l[k])).join(",") + "\n";
}

// Export campaign-ready CSV, honouring the same filters as the leads list.
// Streamed in cursor-paginated batches so memory stays bounded regardless of
// how many leads match — the old version loaded the entire result set into
// an array before writing anything.
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await getSessionUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Agents export only their own leads.
  const where: Prisma.LeadWhereInput = { AND: [buildLeadWhere(req.nextUrl.searchParams), leadScopeWhere(user)] };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(HEADER.join(",") + "\n"));

      let cursor: string | undefined;
      try {
        for (;;) {
          const leads = await prisma.lead.findMany({
            where,
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          });
          if (leads.length === 0) break;

          let chunk = "";
          for (const l of leads) chunk += rowToCsv(l);
          controller.enqueue(encoder.encode(chunk));

          cursor = leads[leads.length - 1].id;
          if (leads.length < BATCH_SIZE) break;
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vrindaacorp-leads-${Date.now()}.csv"`,
    },
  });
}
