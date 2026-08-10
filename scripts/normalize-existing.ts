/**
 * One-time backfill: normalize sector + geography on existing leads.
 * - sector  → canonical (merges MFG/Mfg → Manufacturing, etc.)
 * - city    → normalized city name (from the raw value currently in geography)
 * - geography → canonical region derived from the city
 * Idempotent: safe to run repeatedly.
 *
 * Usage: npx tsx scripts/normalize-existing.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { normalizeSector, normalizeCity, toRegion } from "@/lib/import/normalize";

async function main() {
  const leads = await prisma.lead.findMany({
    select: { id: true, sector: true, city: true, geography: true },
  });
  console.log(`Scanning ${leads.length} leads…`);

  let updated = 0;
  for (const l of leads) {
    // If city not yet set, the raw city is still in `geography`.
    const rawGeo = l.city ?? l.geography;
    const newSector = normalizeSector(l.sector);
    const newCity = normalizeCity(rawGeo);
    const newRegion = toRegion(rawGeo);

    if (newSector !== l.sector || newCity !== l.city || newRegion !== l.geography) {
      await prisma.lead.update({
        where: { id: l.id },
        data: { sector: newSector, city: newCity, geography: newRegion },
      });
      updated++;
    }
  }
  console.log(`Updated ${updated} leads.`);

  const sectors = await prisma.lead.groupBy({ by: ["sector"], _count: { _all: true } });
  const regions = await prisma.lead.groupBy({ by: ["geography"], _count: { _all: true } });
  console.log("\nSectors after:");
  for (const s of sectors.sort((a, b) => b._count._all - a._count._all))
    console.log(`  ${s.sector ?? "(none)"}: ${s._count._all}`);
  console.log("Regions after:");
  for (const r of regions.sort((a, b) => b._count._all - a._count._all))
    console.log(`  ${r.geography ?? "(none)"}: ${r._count._all}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
