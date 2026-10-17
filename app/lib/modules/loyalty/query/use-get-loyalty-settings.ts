"use client";

import { getLoyaltySettings, type LoyaltySettings } from "@/app/lib/admin-loyalty";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export function useGetLoyaltySettings(
  options?: QueryOptions<LoyaltySettings>
) {
  return useApiQuery(
    QUERY_REGISTRY.getLoyaltySettings,
    () => getLoyaltySettings(),
    [],
    options
  );
}
