import { adminFetch } from "@/app/lib/admin-api";

export type AlternatePowerSettings = {
  maxSphDelta: number;
  maxCylDelta: number;
  maxSuggestions: number;
  preferWarehouse: boolean;
  hardMaxDistanceScore: number;
};

export type DispatchCutoffSettings = {
  enabled: boolean;
  time: string;
  timezone: string;
  skipWeekends: boolean;
};

export async function getAlternatePowerSettings(): Promise<AlternatePowerSettings> {
  const data = await adminFetch<{ settings: AlternatePowerSettings }>(
    "/api/settings/alternate-power"
  );
  return {
    ...data.settings,
    hardMaxDistanceScore: data.settings.hardMaxDistanceScore ?? 4,
  };
}

export async function updateAlternatePowerSettings(
  settings: AlternatePowerSettings
): Promise<AlternatePowerSettings> {
  const data = await adminFetch<{ settings: AlternatePowerSettings }>(
    "/api/settings/alternate-power",
    { method: "PUT", body: JSON.stringify(settings) }
  );
  return data.settings;
}

export async function getDispatchCutoffSettings(): Promise<DispatchCutoffSettings> {
  const data = await adminFetch<{ settings: DispatchCutoffSettings }>(
    "/api/settings/dispatch-cutoff"
  );
  return data.settings;
}

export async function updateDispatchCutoffSettings(
  settings: DispatchCutoffSettings
): Promise<DispatchCutoffSettings> {
  const data = await adminFetch<{ settings: DispatchCutoffSettings }>(
    "/api/settings/dispatch-cutoff",
    { method: "PUT", body: JSON.stringify(settings) }
  );
  return data.settings;
}
