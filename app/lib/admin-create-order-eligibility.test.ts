import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  filterEligibleCreateOrderCustomers,
  formatCustomerPickerLabel,
  isEligibleCreateOrderCustomer,
  matchesCustomerSearch,
  resolveCatalogLensSearchUi,
  type CreateOrderCustomerCandidate,
} from "./admin-create-order-eligibility";

const approved: CreateOrderCustomerCandidate = {
  id: "c1",
  role: "CUSTOMER",
  name: "Riya",
  email: "riya@shop.test",
  businessName: "Riya Optics",
  shopName: "Riya Store",
  mobileNumber: "9876543210",
  isActive: true,
  isApproved: true,
  approvalStatus: "APPROVED",
};

describe("admin create-order customer eligibility (RW-10 / RW-04)", () => {
  it("allows approved active customers", () => {
    assert.equal(isEligibleCreateOrderCustomer(approved), true);
  });

  it("blocks suspended, rejected, and pending customers", () => {
    assert.equal(
      isEligibleCreateOrderCustomer({ ...approved, isActive: false }),
      false
    );
    assert.equal(
      isEligibleCreateOrderCustomer({
        ...approved,
        isApproved: false,
        approvalStatus: "REJECTED",
        isActive: false,
      }),
      false
    );
    assert.equal(
      isEligibleCreateOrderCustomer({
        ...approved,
        isApproved: false,
        approvalStatus: "PENDING_REVIEW",
      }),
      false
    );
  });

  it("blocks non-customers", () => {
    assert.equal(
      isEligibleCreateOrderCustomer({ ...approved, role: "ADMIN" }),
      false
    );
  });

  it("searches name, business, email, and mobile", () => {
    assert.equal(matchesCustomerSearch(approved, "riya optics"), true);
    assert.equal(matchesCustomerSearch(approved, "98765"), true);
    assert.equal(matchesCustomerSearch(approved, "shop.test"), true);
    assert.equal(matchesCustomerSearch(approved, "zzz"), false);
  });

  it("formats picker label preferring business name", () => {
    assert.equal(formatCustomerPickerLabel(approved), "Riya Optics");
  });

  it("filters eligible customers for create-order accumulation", () => {
    const rows = filterEligibleCreateOrderCustomers([
      approved,
      { ...approved, id: "admin", role: "ADMIN" },
      { ...approved, id: "off", isActive: false },
    ]);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["c1"]
    );
  });

  it("hides lens hits until search is ready (no sync clear needed)", () => {
    const hits = [{ id: "l1" }];
    assert.deepEqual(
      resolveCatalogLensSearchUi({ search: "a", hits, loading: true }),
      { queryReady: false, hits: [], loading: false }
    );
    assert.deepEqual(
      resolveCatalogLensSearchUi({ search: "ab", hits, loading: true }),
      { queryReady: true, hits, loading: true }
    );
  });
});

describe("admin-create-order-panel state patterns", () => {
  it("avoids set-state-in-effect for page reset, customer accumulate, and lens clear", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin-create-order-panel.tsx"),
      "utf8"
    );
    assert.match(src, /usePaginatedListState/);
    assert.match(src, /filterEligibleCreateOrderCustomers/);
    assert.match(src, /resolveCatalogLensSearchUi/);
    assert.match(src, /orderTotalFromPairPrice/);
    assert.equal(
      /useEffect\(\(\) => \{\s*setCustomerPage\(1\);\s*\}, \[debouncedCustomerQ\]\)/.test(
        src
      ),
      false
    );
    assert.equal(src.includes("setCustomers((prev)"), false);
    assert.equal(
      /if \(q\.length < 2\) \{\s*setLensHits\(\[\]\)/.test(src),
      false
    );
  });
});
