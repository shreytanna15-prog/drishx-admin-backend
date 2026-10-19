import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPaginatedPageSuccess,
  mergePaginatedItems,
  resolvePaginatedListUi,
} from "./use-paginated-list-state";

describe("usePaginatedListState helpers", () => {
  it("page 1 replaces accumulated items", () => {
    assert.deepEqual(
      mergePaginatedItems([{ id: "a" }, { id: "b" }], {
        page: 1,
        items: [{ id: "c" }],
      }),
      [{ id: "c" }]
    );
  });

  it("later pages append and dedupe by id", () => {
    assert.deepEqual(
      mergePaginatedItems([{ id: "a" }, { id: "b" }], {
        page: 2,
        items: [{ id: "b" }, { id: "c" }],
      }).map((r) => r.id),
      ["a", "b", "c"]
    );
  });

  it("ignores stale page>1 after reset", () => {
    assert.deepEqual(
      applyPaginatedPageSuccess([], { page: 3, items: [{ id: "stale" }] }),
      []
    );
  });

  it("accepts page 1 after reset", () => {
    assert.deepEqual(
      applyPaginatedPageSuccess([], { page: 1, items: [{ id: "fresh" }] }),
      [{ id: "fresh" }]
    );
  });
});

describe("resolvePaginatedListUi", () => {
  it("initial load: skeleton + banner, never empty copy", () => {
    const ui = resolvePaginatedListUi({
      loading: true,
      refreshing: false,
      itemCount: 0,
      hasActiveFilters: false,
      entityLabel: "orders",
    });
    assert.equal(ui.showPendingPlaceholder, true);
    assert.equal(ui.showEmpty, false);
    assert.equal(ui.showStaleContent, false);
    assert.equal(ui.statusBanner, "Updating orders…");
  });

  it("awaitingCurrentKey alone shows Updating immediately (before fetch flag)", () => {
    const ui = resolvePaginatedListUi({
      loading: false,
      refreshing: false,
      itemCount: 20,
      hasActiveFilters: true,
      awaitingCurrentKey: true,
      entityLabel: "orders",
    });
    assert.equal(ui.isPending, true);
    assert.equal(ui.showStaleContent, true);
    assert.equal(ui.showEmpty, false);
    assert.equal(ui.statusBanner, "Updating orders…");
  });

  it("search pending with no retained rows: Searching… + skeleton", () => {
    const ui = resolvePaginatedListUi({
      loading: false,
      refreshing: true,
      itemCount: 0,
      hasActiveFilters: true,
      awaitingCurrentKey: true,
      entityLabel: "orders",
    });
    assert.equal(ui.showPendingPlaceholder, true);
    assert.equal(ui.showEmpty, false);
    assert.equal(ui.statusBanner, "Searching…");
  });

  it("filter transition keeps prior rows as stale with Updating banner", () => {
    const ui = resolvePaginatedListUi({
      loading: false,
      refreshing: true,
      itemCount: 12,
      hasActiveFilters: true,
      awaitingCurrentKey: true,
      entityLabel: "orders",
    });
    assert.equal(ui.showPendingPlaceholder, false);
    assert.equal(ui.showEmpty, false);
    assert.equal(ui.showStaleContent, true);
    assert.equal(ui.statusBanner, "Updating orders…");
    assert.equal(ui.pendingLabel, "Updating orders…");
  });

  it("error stops updating claim even if awaiting", () => {
    const ui = resolvePaginatedListUi({
      loading: false,
      refreshing: false,
      itemCount: 5,
      hasActiveFilters: true,
      awaitingCurrentKey: true,
      error: true,
      entityLabel: "orders",
    });
    assert.equal(ui.isPending, false);
    assert.equal(ui.showStaleContent, false);
    assert.equal(ui.statusBanner, null);
  });

  it("genuine empty only when settled with zero rows", () => {
    const ui = resolvePaginatedListUi({
      loading: false,
      refreshing: false,
      itemCount: 0,
      hasActiveFilters: true,
      awaitingCurrentKey: false,
      entityLabel: "orders",
    });
    assert.equal(ui.showPendingPlaceholder, false);
    assert.equal(ui.showEmpty, true);
    assert.equal(ui.statusBanner, null);
  });

  it("settled with rows: ready state", () => {
    const ui = resolvePaginatedListUi({
      loading: false,
      refreshing: false,
      itemCount: 3,
      hasActiveFilters: false,
      awaitingCurrentKey: false,
      entityLabel: "orders",
    });
    assert.equal(ui.showPendingPlaceholder, false);
    assert.equal(ui.showEmpty, false);
    assert.equal(ui.showStaleContent, false);
    assert.equal(ui.isPending, false);
  });
});
