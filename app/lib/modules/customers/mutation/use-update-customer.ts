"use client";

import {
  updateAdminCustomer,
  type AdminCustomer,
  type UpdateAdminCustomerPayload,
} from "@/app/lib/admin-customers";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export type UpdateCustomerVariables = {
  id: string;
  payload: UpdateAdminCustomerPayload;
};

export function useUpdateCustomer(
  options?: MutationOptions<AdminCustomer, UpdateCustomerVariables>
) {
  return useApiMutation(
    ({ id, payload }: UpdateCustomerVariables) =>
      updateAdminCustomer(id, payload),
    options
  );
}
