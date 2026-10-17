"use client";

import {
  listAdminReturns,
  type ListAdminReturnsParams,
  type PaginatedAdminReturns,
} from "@/app/lib/admin-returns";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export function useGetReturns(
  params?: ListAdminReturnsParams,
  options?: QueryOptions<PaginatedAdminReturns>
) {
  return useApiQuery(
    QUERY_REGISTRY.getReturns,
    () => listAdminReturns(params),
    [
      params?.page,
      params?.limit,
      params?.status,
      params?.orderId,
      params?.q,
    ],
    options
  );
}
