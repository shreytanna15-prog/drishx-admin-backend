"use client";

import {
  createLensPowerRangeRequest,
  type LensPowerRange,
  type LensPowerRangeBounds,
} from "@/app/lib/admin-lens-catalog";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export type CreatePowerRangePayload = LensPowerRangeBounds & {
  sortOrder?: number;
  isActive?: boolean;
};

export function useCreatePowerRange(
  options?: MutationOptions<{ item: LensPowerRange }, CreatePowerRangePayload>
) {
  return useApiMutation(
    (payload: CreatePowerRangePayload) => createLensPowerRangeRequest(payload),
    options
  );
}
