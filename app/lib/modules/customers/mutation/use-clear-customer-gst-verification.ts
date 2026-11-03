"use client";

import {
  clearCustomerGstVerification,
  type AdminCustomer,
} from "@/app/lib/admin-customers";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export function useClearCustomerGstVerification(
  options?: MutationOptions<AdminCustomer, string>
) {
  return useApiMutation(
    (id: string) => clearCustomerGstVerification(id),
    options
  );
}
