"use client";

import {
  verifyCustomerGst,
  type VerifyGstResult,
} from "@/app/lib/admin-customers";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export function useVerifyCustomerGst(
  options?: MutationOptions<VerifyGstResult, string>
) {
  return useApiMutation(
    (id: string) => verifyCustomerGst(id),
    options
  );
}
