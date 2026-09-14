import { prisma } from "./prisma";

export const ALTERNATE_POWER_SETTING_KEY = "alternatePower";

export type AlternatePowerSettings = {
  maxSphDelta: number;
  maxCylDelta: number;
  maxSuggestions: number;
  preferWarehouse: boolean;
  /** Combined |ΔSPH|+|ΔCYL| ceiling for nearest same-product fill. */
  hardMaxDistanceScore: number;
};

export const DEFAULT_ALTERNATE_POWER_SETTINGS: AlternatePowerSettings = {
  maxSphDelta: 0.25,
  maxCylDelta: 0.25,
  maxSuggestions: 5,
  preferWarehouse: true,
  hardMaxDistanceScore: 4,
};

function normalizeSettings(raw: unknown): AlternatePowerSettings {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const maxSphDelta = Number(obj.maxSphDelta);
  const maxCylDelta = Number(obj.maxCylDelta);
  const maxSuggestions = Number(obj.maxSuggestions);
  const hardMaxDistanceScore = Number(obj.hardMaxDistanceScore);
  const preferWarehouse =
    typeof obj.preferWarehouse === "boolean"
      ? obj.preferWarehouse
      : DEFAULT_ALTERNATE_POWER_SETTINGS.preferWarehouse;

  return {
    maxSphDelta:
      Number.isFinite(maxSphDelta) && maxSphDelta >= 0
        ? maxSphDelta
        : DEFAULT_ALTERNATE_POWER_SETTINGS.maxSphDelta,
    maxCylDelta:
      Number.isFinite(maxCylDelta) && maxCylDelta >= 0
        ? maxCylDelta
        : DEFAULT_ALTERNATE_POWER_SETTINGS.maxCylDelta,
    maxSuggestions:
      Number.isFinite(maxSuggestions) && maxSuggestions >= 1
        ? Math.min(20, Math.floor(maxSuggestions))
        : DEFAULT_ALTERNATE_POWER_SETTINGS.maxSuggestions,
    preferWarehouse,
    hardMaxDistanceScore:
      Number.isFinite(hardMaxDistanceScore) && hardMaxDistanceScore >= 0
        ? hardMaxDistanceScore
        : DEFAULT_ALTERNATE_POWER_SETTINGS.hardMaxDistanceScore,
  };
}

export async function getAlternatePowerSettings(): Promise<AlternatePowerSettings> {
  const row = await prisma.appSetting.findUnique({
    where: { key: ALTERNATE_POWER_SETTING_KEY },
  });
  if (!row) return { ...DEFAULT_ALTERNATE_POWER_SETTINGS };
  return normalizeSettings(row.value);
}

export async function setAlternatePowerSettings(
  input: Partial<AlternatePowerSettings>
): Promise<AlternatePowerSettings> {
  const current = await getAlternatePowerSettings();
  const next = normalizeSettings({ ...current, ...input });

  await prisma.appSetting.upsert({
    where: { key: ALTERNATE_POWER_SETTING_KEY },
    create: {
      key: ALTERNATE_POWER_SETTING_KEY,
      value: next,
    },
    update: {
      value: next,
    },
  });

  return next;
}
