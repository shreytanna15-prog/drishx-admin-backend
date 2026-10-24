import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import {
  getOrCreateWallet,
  isPrismaUniqueConstraintError,
} from "./wallet";

function p2002Error(target: string[] = ["customerId"]) {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`customerId`)",
    { code: "P2002", clientVersion: "test", meta: { target } }
  );
}

type WalletRow = {
  id: string;
  customerId: string;
  availablePoints: number;
  pendingPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  totalExpired: number;
  totalReversed: number;
};

function mockWalletDb(options: {
  initial?: WalletRow | null;
  /** When true, create always throws P2002 (simulates lost race). */
  createAlwaysConflicts?: boolean;
  /** Shared in-memory row for concurrent creators. */
  store?: { row: WalletRow | null; createCount: number };
}) {
  const store = options.store ?? {
    row: options.initial ?? null,
    createCount: 0,
  };

  return {
    store,
    db: {
      loyaltyWallet: {
        findUnique: async ({ where }: { where: { customerId: string } }) => {
          if (store.row && store.row.customerId === where.customerId) {
            return store.row;
          }
          return null;
        },
        create: async ({ data }: { data: { customerId: string } }) => {
          store.createCount += 1;
          if (options.createAlwaysConflicts || store.row) {
            throw p2002Error();
          }
          store.row = {
            id: `w_${store.createCount}`,
            customerId: data.customerId,
            availablePoints: 0,
            pendingPoints: 0,
            totalEarned: 0,
            totalRedeemed: 0,
            totalExpired: 0,
            totalReversed: 0,
          };
          return store.row;
        },
      },
    },
  };
}

describe("isPrismaUniqueConstraintError", () => {
  it("detects Prisma P2002", () => {
    assert.equal(isPrismaUniqueConstraintError(p2002Error()), true);
  });

  it("ignores other errors", () => {
    assert.equal(isPrismaUniqueConstraintError(new Error("boom")), false);
    assert.equal(
      isPrismaUniqueConstraintError(
        new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "test",
        })
      ),
      false
    );
  });
});

describe("getOrCreateWallet", () => {
  it("returns existing wallet without creating", async () => {
    const existing: WalletRow = {
      id: "w1",
      customerId: "c1",
      availablePoints: 42,
      pendingPoints: 3,
      totalEarned: 50,
      totalRedeemed: 5,
      totalExpired: 0,
      totalReversed: 0,
    };
    const { db, store } = mockWalletDb({ initial: existing });
    const result = await getOrCreateWallet("c1", db as never);
    assert.equal(result.id, "w1");
    assert.equal(Number(result.availablePoints), 42);
    assert.equal(store.createCount, 0);
  });

  it("creates wallet when missing", async () => {
    const { db, store } = mockWalletDb({ initial: null });
    const result = await getOrCreateWallet("c-new", db as never);
    assert.equal(result.customerId, "c-new");
    assert.equal(store.createCount, 1);
    assert.ok(store.row);
  });

  it("recovers from P2002 by refetching the winner wallet", async () => {
    const winner: WalletRow = {
      id: "w-winner",
      customerId: "c-race",
      availablePoints: 17,
      pendingPoints: 0,
      totalEarned: 17,
      totalRedeemed: 0,
      totalExpired: 0,
      totalReversed: 0,
    };
    const store = { row: null as WalletRow | null, createCount: 0 };
    const db = {
      loyaltyWallet: {
        findUnique: async () => store.row,
        create: async () => {
          store.createCount += 1;
          // Peer already inserted — surface unique violation then expose row.
          store.row = winner;
          throw p2002Error();
        },
      },
    };
    const result = await getOrCreateWallet("c-race", db as never);
    assert.equal(result.id, "w-winner");
    assert.equal(Number(result.availablePoints), 17);
    assert.equal(store.createCount, 1);
  });

  it("rethrows non-unique create failures", async () => {
    const db = {
      loyaltyWallet: {
        findUnique: async () => null,
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError("db down", {
            code: "P1001",
            clientVersion: "test",
          });
        },
      },
    };
    await assert.rejects(
      () => getOrCreateWallet("c1", db as never),
      (err: unknown) =>
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P1001"
    );
  });

  it("handles simultaneous initialization without surfacing P2002", async () => {
    const store = { row: null as WalletRow | null, createCount: 0 };
    const db = {
      loyaltyWallet: {
        findUnique: async ({ where }: { where: { customerId: string } }) => {
          if (store.row?.customerId === where.customerId) return store.row;
          return null;
        },
        create: async ({ data }: { data: { customerId: string } }) => {
          // Simulate both callers passing findUnique before either inserts.
          store.createCount += 1;
          if (store.row) {
            throw p2002Error();
          }
          // Tiny delay so the other create can also enter and conflict.
          await new Promise((r) => setTimeout(r, 5));
          if (store.row) {
            throw p2002Error();
          }
          store.row = {
            id: "w_shared",
            customerId: data.customerId,
            availablePoints: 9,
            pendingPoints: 1,
            totalEarned: 10,
            totalRedeemed: 0,
            totalExpired: 0,
            totalReversed: 0,
          };
          return store.row;
        },
      },
    };

    const [a, b] = await Promise.all([
      getOrCreateWallet("same-customer", db as never),
      getOrCreateWallet("same-customer", db as never),
    ]);

    assert.equal(a.customerId, "same-customer");
    assert.equal(b.customerId, "same-customer");
    assert.equal(a.id, b.id);
    assert.equal(Number(a.availablePoints), 9);
    assert.equal(Number(b.availablePoints), 9);
    assert.ok(store.createCount >= 1);
  });
});
