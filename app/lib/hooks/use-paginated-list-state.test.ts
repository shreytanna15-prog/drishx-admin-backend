import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPaginatedPageSuccess,
  mergePaginatedItems,
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
