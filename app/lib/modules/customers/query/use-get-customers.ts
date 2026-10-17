"use client";

import {
  listAdminCustomers,
  type ListAdminCustomersParams,
  type PaginatedAdminCustomers,
} from "@/app/lib/admin-customers";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export function useGetCustomers(
  params?: ListAdminCustomersParams,
  options?: QueryOptions<PaginatedAdminCustomers>
) {
  return useApiQuery(
    QUERY_REGISTRY.getCustomers,
    () => listAdminCustomers(params),
    [
      params?.page,
      params?.limit,
      params?.status,
      params?.activeOnly,
      params?.q,
    ],
    options
  );
}
