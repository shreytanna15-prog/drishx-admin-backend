"use client";

import { fetchCatalogStockPowers } from "@/app/lib/admin-stock";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

type Params = Parameters<typeof fetchCatalogStockPowers>[0];
type Result = Awaited<ReturnType<typeof fetchCatalogStockPowers>>;

export function useGetCatalogStockPowers(params?: Params, options?: QueryOptions<Result>) {
  return useApiQuery(
    QUERY_REGISTRY.getCatalogStockPowers,
    () => fetchCatalogStockPowers(params),
    [params?.q, params?.productId, params?.familyCode, params?.shortageOnly, params?.page, params?.limit],
    options
  );
}
