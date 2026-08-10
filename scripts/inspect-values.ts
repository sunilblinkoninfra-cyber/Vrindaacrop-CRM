import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const sectors = await prisma.lead.groupBy({ by: ["sector"], _count: { _all: true } });
  const geos = await prisma.lead.groupBy({ by: ["geography"], _count: { _all: true } });
  console.log("=== SECTORS ===");
  for (const s of sectors.sort((a, b) => b._count._all - a._count._all))
    console.log(`${JSON.stringify(s.sector)}\t${s._count._all}`);
  console.log("\n=== GEOGRAPHIES ===");
  for (const g of geos.sort((a, b) => b._count._all - a._count._all))
    console.log(`${JSON.stringify(g.geography)}\t${g._count._all}`);
  await prisma.$disconnect();
}
main();
