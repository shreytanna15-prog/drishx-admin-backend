"use client";

import {
  getAdminCustomer,
  type AdminCustomer,
  type CustomerFinanceSummary,
} from "@/app/lib/admin-customers";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export type AdminCustomerDetail = {
  customer: AdminCustomer;
  finance: CustomerFinanceSummary | null;
};

export function useGetCustomer(
  id: string | undefined,
  options?: QueryOptions<AdminCustomerDetail>
) {
  return useApiQuery(
    QUERY_REGISTRY.getCustomer,
    () => getAdminCustomer(id!),
    [id],
    { ...options, enabled: Boolean(id) && options?.enabled !== false }
  );
}
