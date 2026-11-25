"use client";

import { correctAdminReturnStock } from "@/app/lib/admin-returns";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

type Input = Parameters<typeof correctAdminReturnStock>[0];

export function useCorrectReturnStock(options?: MutationOptions<void, Input>) {
  return useApiMutation(
    (input: Input) => correctAdminReturnStock(input), options);
}
