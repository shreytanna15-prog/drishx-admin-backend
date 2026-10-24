"use client";

import {
  setCustomerAccountAction,
  type AccountActionValue,
  type AdminCustomer,
} from "@/app/lib/admin-customers";
import { useApiMutation } from "@/app/lib/hooks/use-api-mutation";
import type { MutationOptions } from "@/app/lib/types/api-client";

export type SetAccountActionVariables = {
  id: string;
  action: AccountActionValue;
};

export function useSetAccountAction(
  options?: MutationOptions<AdminCustomer, SetAccountActionVariables>
) {
  return useApiMutation(
    ({ id, action }: SetAccountActionVariables) =>
      setCustomerAccountAction(id, action),
    options
  );
}
