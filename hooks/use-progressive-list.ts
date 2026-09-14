"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Initial / incremental chunk size for admin list tables. */
export const LIST_PAGE_SIZE = 32;
/** When this visible row index enters the viewport, reveal the next chunk. */
export const LIST_PRELOAD_AT = 22;

type UseProgressiveListOptions = {
  pageSize?: number;
  preloadAt?: number;
};

/**
 * Progressively reveal items from a full (or filtered) list.
 * Shows `pageSize` rows first; when the row at `preloadAt` scrolls into view,
 * appends the next `pageSize` rows automatically.
 */
export function useProgressiveList<T>(
  items: T[],
  options: UseProgressiveListOptions = {}
) {
  const pageSize = options.pageSize ?? LIST_PAGE_SIZE;
  const preloadAt = options.preloadAt ?? LIST_PRELOAD_AT;

  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [sentinelNode, setSentinelNode] = useState<HTMLElement | null>(null);
  const loadingMoreRef = useRef(false);

  // Reset when the source list changes (new data or new search filter).
  const itemsKey = items.length;
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [itemsKey, items, pageSize]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );

  const hasMore = visibleCount < items.length;

  /** Keep the trigger near the end of the latest chunk (~row 22 of that page). */
  const sentinelIndex = useMemo(() => {
    if (visibleItems.length === 0) return -1;
    const fromEnd = pageSize - preloadAt; // ~10
    return Math.min(
      visibleItems.length - 1,
      Math.max(preloadAt, visibleItems.length - fromEnd)
    );
  }, [visibleItems.length, pageSize, preloadAt]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    setVisibleCount((count) => {
      if (count >= items.length) return count;
      loadingMoreRef.current = true;
      const next = Math.min(count + pageSize, items.length);
      queueMicrotask(() => {
        loadingMoreRef.current = false;
      });
      return next;
    });
  }, [items.length, pageSize]);

  useEffect(() => {
    if (!sentinelNode || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root: null, rootMargin: "120px 0px", threshold: 0 }
    );

    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [sentinelNode, hasMore, loadMore, visibleCount]);

  return {
    visibleItems,
    hasMore,
    totalCount: items.length,
    visibleCount,
    preloadAt,
    sentinelIndex,
    setSentinelNode,
    loadMore,
  };
}

type UseInfiniteScrollOptions = {
  enabled: boolean;
  onLoadMore: () => void;
  /** Re-bind observer when this changes (e.g. loaded row count). */
  deps?: unknown[];
};

/**
 * Observe a sentinel element and call `onLoadMore` when it enters the viewport.
 * Used for server-paginated lists (e.g. stock products).
 */
export function useInfiniteScrollSentinel({
  enabled,
  onLoadMore,
  deps = [],
}: UseInfiniteScrollOptions) {
  const [sentinelNode, setSentinelNode] = useState<HTMLElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!sentinelNode || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { root: null, rootMargin: "160px 0px", threshold: 0 }
    );

    observer.observe(sentinelNode);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps passed by caller
  }, [sentinelNode, enabled, ...deps]);

  return { setSentinelNode };
}
