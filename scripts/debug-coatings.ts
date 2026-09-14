import "dotenv/config";
import { prisma } from "../app/lib/prisma";
import { buildKryptokWholesaleItemWhere } from "../app/lib/kryptok-wholesale-catalog";
import { buildProgressiveWholesaleItemWhere } from "../app/lib/progressive-wholesale-catalog";
import { isHardcoatGradeCoating } from "../app/lib/lens-power-shape-filter";

async function main() {
  const ktWhere = buildKryptokWholesaleItemWhere("BRC KT");
  const groups = await prisma.kryptokLens.groupBy({
    by: ["coating"],
    where: {
      AND: [ktWhere, { coating: { not: null } }],
    },
    _count: { _all: true },
  });
  console.log(
    "KT BRC KT raw coatings",
    groups.map((g) => ({
      coating: g.coating,
      count: g._count._all,
      hard: isHardcoatGradeCoating(g.coating),
    }))
  );

  const sample = await prisma.kryptokLens.findMany({
    where: ktWhere,
    take: 5,
    select: { brand: true, coating: true, sph: true, cyl: true, category: true },
  });
  console.log("KT samples", sample);

  const progWhere = buildProgressiveWholesaleItemWhere("BRC V2");
  const progGroups = await prisma.progressiveLens.groupBy({
    by: ["coating"],
    where: progWhere,
    _count: { _all: true },
  });
  console.log(
    "PROG BRC V2 coatings",
    progGroups.map((g) => ({
      coating: g.coating,
      count: g._count._all,
      hard: isHardcoatGradeCoating(g.coating),
    }))
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
