"use client";

import {
  fetchLensPowerRanges,
  type LensPowerRange,
} from "@/app/lib/admin-lens-catalog";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export type GetPowerRangesParams = { activeOnly?: boolean };

export function useGetPowerRanges(
  params?: GetPowerRangesParams,
  options?: QueryOptions<{ items: LensPowerRange[] }>
) {
  return useApiQuery(
    QUERY_REGISTRY.getLensPowerRanges,
    () => fetchLensPowerRanges({ activeOnly: params?.activeOnly }),
    [params?.activeOnly],
    options
  );
}
