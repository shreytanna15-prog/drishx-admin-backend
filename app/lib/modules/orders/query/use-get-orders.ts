"use client";

import {
  listAdminOrders,
  type ListAdminOrdersParams,
  type PaginatedAdminOrders,
} from "@/app/lib/admin-orders";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export function useGetOrders(
  params?: ListAdminOrdersParams,
  options?: QueryOptions<PaginatedAdminOrders>
) {
  return useApiQuery(
    QUERY_REGISTRY.getOrders,
    () => listAdminOrders(params),
    [
      params?.page,
      params?.limit,
      params?.status,
      params?.q,
      params?.employeeId,
      params?.userId,
      params?.batchId,
      params?.lineType,
      params?.orderKind,
      params?.scope,
      params?.assigneeId,
      params?.dateFrom,
      params?.dateTo,
    ],
    options
  );
}
