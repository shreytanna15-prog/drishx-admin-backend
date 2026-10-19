"use client";

import { useState } from "react";
import type { Paginated } from "@/app/lib/types/api-client";

/** Merge a server page into an accumulated list (page 1 replaces). */
export function mergePaginatedItems<T extends { id: string }>(
  prev: T[],
  page: Pick<Paginated<T>, "page" | "items">
): T[] {
  if (page.page <= 1) return page.items;
  const seen = new Set(prev.map((row) => row.id));
  const merged = [...prev];
  for (const row of page.items) {
    if (!seen.has(row.id)) merged.push(row);
  }
  return merged;
}

/**
 * Apply a page result after a possible filter reset.
 * Ignores stale page>1 writes when the list was cleared (empty prev).
 */
export function applyPaginatedPageSuccess<T extends { id: string }>(
  prev: T[],
  page: Pick<Paginated<T>, "page" | "items">
): T[] {
  if (page.page > 1 && prev.length === 0) {
    return prev;
  }
  return mergePaginatedItems(prev, page);
}

export type PaginatedListUiState = {
  /** True while awaiting the current filter/search response. */
  isPending: boolean;
  /** Show skeleton — nothing reliable to display yet. */
  showPendingPlaceholder: boolean;
  /** Show empty copy only after a settled response with zero rows. */
  showEmpty: boolean;
  /** Retained prior rows are shown but must look non-final. */
  showStaleContent: boolean;
  /** Compact subtitle while pending. */
  pendingLabel: string | null;
  /** Prominent live status for filter/search transitions. */
  statusBanner: string | null;
};

/**
 * Derive list placeholder vs empty vs keep-previous UI from hook flags.
 * Empty messages must not appear while a current-key request is outstanding.
 */
export function resolvePaginatedListUi(input: {
  loading: boolean;
  refreshing: boolean;
  itemCount: number;
  hasActiveFilters: boolean;
  /** Filter/search key changed; page-1 success not applied yet. */
  awaitingCurrentKey?: boolean;
  /** Request failed — stop claiming “updating”. */
  error?: boolean;
  /** Plural entity for banners, e.g. "orders". */
  entityLabel?: string;
}): PaginatedListUiState {
  const entity = input.entityLabel?.trim() || "results";
  const awaiting = Boolean(input.awaitingCurrentKey);
  const fetchPending = input.loading || input.refreshing;
  const isPending = !input.error && (fetchPending || awaiting);
  const emptyItems = input.itemCount === 0;
  const updatingLabel = `Updating ${entity}…`;
  const searchingLabel =
    input.hasActiveFilters && emptyItems ? "Searching…" : updatingLabel;

  if (isPending && emptyItems) {
    return {
      isPending: true,
      showPendingPlaceholder: true,
      showEmpty: false,
      showStaleContent: false,
      pendingLabel: searchingLabel,
      statusBanner: searchingLabel,
    };
  }

  if (isPending) {
    return {
      isPending: true,
      showPendingPlaceholder: false,
      showEmpty: false,
      showStaleContent: true,
      pendingLabel: updatingLabel,
      statusBanner: updatingLabel,
    };
  }

  if (emptyItems) {
    return {
      isPending: false,
      showPendingPlaceholder: false,
      showEmpty: true,
      showStaleContent: false,
      pendingLabel: null,
      statusBanner: null,
    };
  }

  return {
    isPending: false,
    showPendingPlaceholder: false,
    showEmpty: false,
    showStaleContent: false,
    pendingLabel: null,
    statusBanner: null,
  };
}

/**
 * Page + accumulated items for server-paginated lists.
 * When `resetKey` changes (filters/search), page resets to 1 but previous
 * items are kept until the next page-1 success (avoids empty-state flash).
 * `awaitingCurrentKey` is true immediately on reset until page-1 success
 * (or `acknowledgeCurrentKey` after an error).
 */
export function usePaginatedListState<T extends { id: string }>(resetKey: string) {
  const [trackedKey, setTrackedKey] = useState(resetKey);
  const [appliedKey, setAppliedKey] = useState(resetKey);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);

  if (resetKey !== trackedKey) {
    setTrackedKey(resetKey);
    setPage(1);
    // Keep prior items until page-1 success replaces them (loading UX).
  }

  const awaitingCurrentKey = appliedKey !== resetKey;

  function onPageSuccess(result: Pick<Paginated<T>, "page" | "items">) {
    setItems((prev) => applyPaginatedPageSuccess(prev, result));
    if (result.page <= 1) {
      setAppliedKey(resetKey);
    }
  }

  /** Call from query `onError` so “Updating…” does not stick after failures. */
  function acknowledgeCurrentKey() {
    setAppliedKey(resetKey);
  }

  return {
    page,
    setPage,
    items,
    setItems,
    onPageSuccess,
    acknowledgeCurrentKey,
    awaitingCurrentKey,
  };
}
