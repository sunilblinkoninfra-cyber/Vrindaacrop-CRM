import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Update the column mapping for a staged import batch.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const mapping = body.mapping as Record<string, string>;
  if (!mapping || typeof mapping !== "object") {
    return NextResponse.json({ error: "mapping required" }, { status: 400 });
  }

  const batch = await prisma.importBatch.update({
    where: { id: params.id },
    data: { columnMapping: mapping, status: "MAPPED" },
  });
  return NextResponse.json({ ok: true, batchId: batch.id });
}
