---
name: drishx-client-api
description: >-
  Admin client API calling pattern without React Query — pure api functions,
  useApiQuery / useApiMutation hooks, list pagination (Paginated), summary vs
  detail DTOs, centralized loading and error handling via adminFetch. Use when
  adding or changing admin UI data fetching, mutations, list/table screens,
  loading states, API hooks, or app/lib admin-* client wrappers.
---

# DrishX Admin — Client API Calling

**No TanStack Query / SWR.** One pattern for reads and writes. Components never call `adminFetch` directly.

This skill also covers **list/table contracts**: pagination params, `Paginated<T>`, summary vs detail DTOs, and migration rules for hot lists (orders first).

## Stack (this repo)

| Layer | Location |
|-------|----------|
| Transport | `adminFetch` / `AdminApiError` in `app/lib/admin-api.ts` (uses `adminAuthFetch` for refresh) |
| Feature API | `app/lib/admin-<feature>.ts` or `app/lib/modules/<feature>/api.ts` |
| Shared hooks | `app/lib/hooks/use-api-query.ts`, `use-api-mutation.ts` |
| Registry | `app/lib/constants/api-registry.ts` |
| Shared types | `app/lib/types/api-client.ts` (`QueryOptions`, `MutationOptions`, `Paginated`) |

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

### `QueryOptions` / `MutationOptions` / `Paginated`

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

/** Standard list envelope for table/list endpoints. */
export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
  total?: number;
};
```

- No response → `TData = void`
- No payload → `TVariables = null` (call `mutate(null)`)
- Prefer `page` / `limit` over inventing `pageSize` on new endpoints. Cursor-based lists (e.g. ledgers) are allowed when documented on that domain — still return a clear “next page” signal.

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

## List & pagination contract

List query hooks accept **`params` as the first argument**:

```ts
type ListParams = {
  page?: number;   // default ~1; server default ~20–30
  limit?: number;  // hard-capped server-side (e.g. max 100)
  status?: string; // single or CSV when API supports it
  q?: string;      // search
  // …feature filters
};
```

Rules:

1. Pass every param that changes the request into `useApiQuery` **`deps`** (e.g. `page`, `limit`, `status`, `q`). Missing deps → stale data.
2. Type the response as `Paginated<OrderListItem>` (or feature summary type) — not a bare array for new/migrated list work.
3. UI: use hook `loading` for the first page; use `refreshing` (or mutation `pending`) for page changes / load-more. Do **not** keep a second ad-hoc `useState` loading flag next to the hook.
4. Default `limit` capped (e.g. 20–50); never present a silent `take: 100` as a complete list — page, load-more, or show “showing latest N”.
5. **Forbidden:** fetch all rows then `.filter` / `.find` for primary status tabs or search when the API supports (or should support) those query params. Filters belong in the request/`where` clause.

Good pagination references in this repo: `GET /api/lenses` (`page`/`limit`/`hasMore`), `GET /api/admin/catalog/products`, stock-matrix / suppliers.

## List vs detail

| Surface | Type | Endpoint |
|---------|------|----------|
| Tables / cards / queues | Summary DTO (`OrderListItem`, …) | `GET /api/…` list with `page`/`limit`/filters |
| Detail pages | Full detail model | `GET /api/…/:id` (or existing detail route) |

- List payloads exclude heavy relations: full wholesale line arrays, power versions, signed image URLs, full lens dumps, delivery pack internals. Prefer flags like `hasOrderImage` on list rows; sign URLs on detail only.
- Do **not** type list rows as the full detail model “for convenience.”
- Detail richness stays on the detail GET — unchanged for screens that need it.

## Migration rules

1. **New screens:** must use `useGet*` / `use*` hooks — never call `adminFetch` / `adminAuthFetch` from components.
2. **Touched list screens:** migrate that feature to hooks + server params in the **same PR**.
3. **Hot paths (mandatory for RW-11):**
   - **Orders** (admin orders table, dispatch, procurement order subsets) — Phase B
   - Then **customers**, **returns**, **invoices** — Phase C
4. Opportunistic migration for non-hot screens is fine; do not big-bang rewrite every `adminFetch` page in one PR.
5. After Phase A foundation lands, new list UIs that still call `adminFetch` from components should be rejected in review.

## Gold standard hooks

### List query (paginated summary)

```ts
// app/lib/modules/orders/query/use-get-orders.ts
import { listAdminOrders } from "@/app/lib/admin-orders";
import { QUERY_REGISTRY } from "@/app/lib/constants/api-registry";
import { useApiQuery } from "@/app/lib/hooks/use-api-query";
import type { Paginated, QueryOptions } from "@/app/lib/types/api-client";

type ListOrdersParams = {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
};

export function useGetOrders(
  params?: ListOrdersParams,
  options?: QueryOptions<Paginated<OrderListItem>>,
) {
  return useApiQuery(
    QUERY_REGISTRY.getOrders,
    () => listAdminOrders(params),
    [params?.page, params?.limit, params?.status, params?.q],
    options,
  );
}
```

Params = 1st arg; `options` = 2nd. Detail: separate `useGetOrder(id)` → `GET /api/orders/:id`.

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
3. Loading UI from hook flags (`loading` / `refreshing` / `pending`), not ad-hoc `useState` next to fetch.
4. Errors: non-401 → `error` state + optional `onError`; success side effects in `onSuccess`.
5. Do not introduce Axios or React Query in this repo’s admin UI.
6. Lists: `Paginated` + server filters; summary types on list; detail on `GET :id`.
7. Migrate opportunistically when editing a screen; orders (+ customers/returns/invoices) are mandatory hot paths.

## Screen shape

```tsx
const { data, loading, refreshing, error, refetch } = useGetOrders({
  page,
  limit: 30,
  status,
  q,
});
const { mutate, pending } = useCreateOrder({
  onSuccess: () => { /* navigate / refresh list via refetch */ },
});

if (loading) return <PageSkeleton />;
if (error) return <ErrorState message={error.message} onRetry={refetch} />;

// data.items — summary rows; use refreshing for page changes
```

## Checklist

- [ ] Registry entry added
- [ ] Pure function in api layer with typed response
- [ ] Hook under query/ or mutation/
- [ ] Screen uses hook flags for loading/error (`loading` / `refreshing` / `pending`)
- [ ] 401 not toasted / not custom-redirected in the hook
- [ ] Mutation variables wrapped in one object when needed
- [ ] List hooks: `params` first; `deps` include every request param
- [ ] List response typed as `Paginated<SummaryDto>` (not full detail)
- [ ] No client-only primary filter after fetching all rows
- [ ] Detail screens use detail GET / detail hook
