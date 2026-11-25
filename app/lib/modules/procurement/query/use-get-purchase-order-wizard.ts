"use client";

import { loadPurchaseOrderWizardData } from "@/app/lib/admin-purchase-orders";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

type Result = Awaited<ReturnType<typeof loadPurchaseOrderWizardData>>;

export function useGetPurchaseOrderWizard(
  draftId?: string | null,
  options?: QueryOptions<Result>
) {
  return useApiQuery(
    QUERY_REGISTRY.getPurchaseOrderWizard,
    () => loadPurchaseOrderWizardData(draftId),
    [draftId],
    options
  );
}
