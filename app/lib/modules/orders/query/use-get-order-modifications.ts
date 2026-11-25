"use client";

import { listAdminOrderModifications } from "@/app/lib/admin-order-modifications";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";

export function useGetOrderModifications(orderId: string) {
  return useApiQuery(QUERY_REGISTRY.getOrderModifications,
    () => listAdminOrderModifications(orderId), [orderId], { enabled: Boolean(orderId) });
}
