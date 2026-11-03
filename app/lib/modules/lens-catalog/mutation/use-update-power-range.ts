"use client";

import {
  updateLensPowerRangeRequest,
  type LensPowerRange,
  type LensPowerRangeBounds,
} from "@/app/lib/admin-lens-catalog";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export type UpdatePowerRangeVariables = {
  id: string;
  payload: Partial<LensPowerRangeBounds> & {
    sortOrder?: number;
    isActive?: boolean;
  };
};

export function useUpdatePowerRange(
  options?: MutationOptions<{ item: LensPowerRange }, UpdatePowerRangeVariables>
) {
  return useApiMutation(
    ({ id, payload }: UpdatePowerRangeVariables) =>
      updateLensPowerRangeRequest(id, payload),
    options
  );
}
