"use client";

import {
  updateLoyaltySettings,
  type LoyaltySettings,
  type UpdateLoyaltySettingsPayload,
} from "@/app/lib/admin-loyalty";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export function useUpdateLoyaltySettings(
  options?: MutationOptions<LoyaltySettings, UpdateLoyaltySettingsPayload>
) {
  return useApiMutation(
    (payload: UpdateLoyaltySettingsPayload) => updateLoyaltySettings(payload),
    options
  );
}
