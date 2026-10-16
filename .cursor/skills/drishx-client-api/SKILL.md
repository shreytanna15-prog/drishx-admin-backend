---
name: drishx-client-api
description: >-
  Admin client API calling pattern without React Query — pure api functions,
  useApiQuery / useApiMutation hooks, centralized loading and error handling via
  adminFetch. Use when adding or changing admin UI data fetching, mutations,
  loading states, API hooks, or app/lib admin-* client wrappers.
---

# DrishX Admin — Client API Calling

**No TanStack Query / SWR.** One pattern for reads and writes. Components never call `adminFetch` directly.

## Stack (this repo)

| Layer | Location |
|-------|----------|
| Transport | `adminFetch` / `AdminApiError` in `app/lib/admin-api.ts` (uses `adminAuthFetch` for refresh) |
| Feature API | `app/lib/admin-<feature>.ts` or `app/lib/modules/<feature>/api.ts` |
| Shared hooks | `app/lib/hooks/use-api-query.ts`, `use-api-mutation.ts` |
| Registry | `app/lib/constants/api-registry.ts` |
| Shared types | `app/lib/types/api-client.ts` (`QueryOptions`, `MutationOptions`) |

Server routes stay under `app/api` — follow `drishx-api-auth-audit` for those. This skill is **admin UI → `/api/...` only**.

## Folder rules

Every feature client surface:

1. **`api`** — pure async functions (no React, no alerts).
2. **`types`** — Payload / Response / Params (file or colocated in `api`).
3. **`query`** — `use-get-<entity>.ts` → `useApiQuery`.
4. **`mutation`** — `use-<action>-<entity>.ts` → `useApiMutation`.

Incremental OK: keep existing `app/lib/admin-*.ts` as the api layer; add hooks when touching a screen.

```
app/lib/modules/<feature>/
  api.ts
  types.ts
  query/use-get-orders.ts
  mutation/use-create-order.ts
```

## Shared primitives (create once if missing)

### `QueryOptions` / `MutationOptions`

```ts
// app/lib/types/api-client.ts
export type QueryOptions<TData> = {
  enabled?: boolean;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
};

export type MutationOptions<TData, TVariables> = {
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
};
```

- No response → `TData = void`
- No payload → `TVariables = null` (call `mutate(null)`)

### Registry

```ts
// app/lib/constants/api-registry.ts
export const QUERY_REGISTRY = {
  getOrders: "getOrders",
} as const;

export const MUTATION_REGISTRY = {
  createOrder: "createOrder",
} as const;
```

Never hardcode ad-hoc fetch names in hooks — register first.

### `useApiQuery` / `useApiMutation`

Implement once under `app/lib/hooks/`. Behavior contract:

| | Query | Mutation |
|---|--------|----------|
| Trigger | mount + `deps` change (if `enabled !== false`) | `mutate(variables)` |
| Loading | `loading` (first load), `refreshing` (refetch) | `pending` |
| Data | `data` | `data` after success |
| Error | `error` | `error` |
| Retry | `refetch()` | call `mutate` again |
| Callbacks | `onSuccess` / `onError` in options | same |

**401 / auth:** do not surface in `onError` UI — `adminAuthFetch` already refreshes / signs out. Treat `AdminApiError` with `status === 401` (and missing token) as auth-handled.

**Other errors:** call `options.onError` (and/or set `error` for inline UI). Prefer a small `showClientError(error)` helper later; until then, screens read `error.message` or pass `onError`.

## Gold standard hooks

### Query

```ts
// app/lib/modules/orders/query/use-get-orders.ts
import { listAdminOrders } from "@/app/lib/admin-orders";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { QueryOptions } from "@/app/lib/types/api-client";

export function useGetOrders(
  params?: ListOrdersParams,
  options?: QueryOptions<OrdersResponse>,
) {
  return useApiQuery(
    QUERY_REGISTRY.getOrders,
    () => listAdminOrders(params),
    [params?.status, params?.q],
    options,
  );
}
```

Params = 1st arg; `options` = 2nd.

### Mutation

```ts
export function useCreateOrder(
  options?: MutationOptions<OrderResponse, CreateOrderPayload>,
) {
  return useApiMutation(
    (payload) => createAdminOrder(payload),
    options,
  );
}
```

**Strict payload rule:** one argument only. Id + body → `mutationFn: ({ id, data }) => updateX({ id, data })`.

**Id in path:** api function takes `{ payload, params }` or a single object with `id`.

## Essential rules

1. Components talk only to `useGet*` / `use*` hooks — never `adminFetch` / `adminAuthFetch`.
2. Api files only call `adminFetch` (or compose other api helpers).
3. Loading UI from hook flags (`loading` / `pending`), not ad-hoc `useState` next to fetch.
4. Errors: non-401 → `error` state + optional `onError`; success side effects in `onSuccess`.
5. Do not introduce Axios or React Query in this repo’s admin UI.
6. Migrate opportunistically when editing a screen; don’t big-bang rewrite.

## Screen shape

```tsx
const { data, loading, error, refetch } = useGetOrders();
const { mutate, pending } = useCreateOrder({
  onSuccess: () => { /* navigate / refresh list via refetch */ },
});

if (loading) return <PageSkeleton />;
if (error) return <ErrorState message={error.message} onRetry={refetch} />;
```

## Checklist

- [ ] Registry entry added
- [ ] Pure function in api layer with typed response
- [ ] Hook under query/ or mutation/
- [ ] Screen uses hook flags for loading/error
- [ ] 401 not toasted / not custom-redirected in the hook
- [ ] Mutation variables wrapped in one object when needed
