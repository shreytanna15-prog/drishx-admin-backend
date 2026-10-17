"use client";

import {
  listLoyaltyCustomers,
  type ListLoyaltyCustomersParams,
  type PaginatedLoyaltyCustomers,
} from "@/app/lib/admin-loyalty";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export function useGetLoyaltyCustomers(
  params?: ListLoyaltyCustomersParams,
  options?: QueryOptions<PaginatedLoyaltyCustomers>
) {
  return useApiQuery(
    QUERY_REGISTRY.getLoyaltyCustomers,
    () => listLoyaltyCustomers(params),
    [params?.page, params?.limit, params?.q],
    options
  );
}
