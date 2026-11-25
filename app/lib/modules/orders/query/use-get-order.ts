"use client";

import { getAdminOrder } from "@/app/lib/admin-orders";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";

export function useGetOrder(orderId: string) {
  return useApiQuery(QUERY_REGISTRY.getOrder,
    () => getAdminOrder(orderId), [orderId], { enabled: Boolean(orderId) });
}
