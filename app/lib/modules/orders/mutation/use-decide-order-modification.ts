"use client";

import { decideAdminOrderModification } from "@/app/lib/admin-order-modifications";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

type Input = Parameters<typeof decideAdminOrderModification>[0];
type Result = Awaited<ReturnType<typeof decideAdminOrderModification>>;

export function useDecideOrderModification(options?: MutationOptions<Result, Input>) {
  return useApiMutation(decideAdminOrderModification, options);
}
