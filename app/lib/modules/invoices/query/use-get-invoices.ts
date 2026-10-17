"use client";

import {
  listAdminInvoices,
  type ListAdminInvoicesParams,
  type PaginatedAdminInvoices,
} from "@/app/lib/admin-invoices";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export function useGetInvoices(
  params?: ListAdminInvoicesParams,
  options?: QueryOptions<PaginatedAdminInvoices>
) {
  return useApiQuery(
    QUERY_REGISTRY.getInvoices,
    () => listAdminInvoices(params),
    [params?.page, params?.limit, params?.status, params?.q],
    options
  );
}
