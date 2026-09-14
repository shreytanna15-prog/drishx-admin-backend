import { isHardcoatGradeCoating } from "./lens-power-shape-filter";

/**
 * Order live coating strings by managed active labels (sortOrder).
 * Labels with no matching live coating are omitted.
 * If no managed labels exist at all, returns live coatings sorted A–Z.
 * If managed labels exist but none are active, returns [] (hide all chips).
 */
export function intersectCoatingsWithManagedLabels(
  liveCoatings: string[],
  managedLabels: Array<{ name: string; sortOrder: number; isActive: boolean }>
): string[] {
  const colorLive = liveCoatings.filter(
    (coating) => !isHardcoatGradeCoating(coating)
  );
  if (colorLive.length === 0) return [];

  // No managed catalog yet — preserve legacy live facets.
  if (managedLabels.length === 0) {
    return [...colorLive].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }

  const activeManaged = managedLabels.filter((label) => label.isActive);
  if (activeManaged.length === 0) {
    return [];
  }

  const liveByKey = new Map<string, string>();
  for (const coating of colorLive) {
    liveByKey.set(coating.trim().toLowerCase(), coating);
  }

  const result: string[] = [];
  const used = new Set<string>();

  const sortedManaged = [...activeManaged].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  for (const label of sortedManaged) {
    const key = label.name.trim().toLowerCase();
    const live = liveByKey.get(key);
    if (!live || used.has(key)) continue;
    // Prefer managed canonical casing for the chip label.
    result.push(label.name);
    used.add(key);
  }

  return result;
}
