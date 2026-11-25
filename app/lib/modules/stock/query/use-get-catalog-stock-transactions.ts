"use client";

import { fetchCatalogStockTransactions } from "@/app/lib/admin-stock";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

type Params = Parameters<typeof fetchCatalogStockTransactions>[0];
type Result = Awaited<ReturnType<typeof fetchCatalogStockTransactions>>;

export function useGetCatalogStockTransactions(params?: Params, options?: QueryOptions<Result>) {
  return useApiQuery(
    QUERY_REGISTRY.getCatalogStockTransactions,
    () => fetchCatalogStockTransactions(params),
    [params?.q, params?.powerId, params?.productId, params?.movementType, params?.from, params?.to, params?.page, params?.limit],
    options
  );
}
