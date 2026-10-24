"use client";

import {
  createAdminCustomer,
  type AdminCustomer,
  type CreateAdminCustomerPayload,
} from "@/app/lib/admin-customers";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export function useCreateCustomer(
  options?: MutationOptions<AdminCustomer, CreateAdminCustomerPayload>
) {
  return useApiMutation(
    (payload: CreateAdminCustomerPayload) => createAdminCustomer(payload),
    options
  );
}
