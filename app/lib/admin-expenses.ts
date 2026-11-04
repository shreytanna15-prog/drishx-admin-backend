import { adminFetch } from "@/app/lib/admin-api";

export type ExpenseStaff = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export type ProcurementExpense = {
  id: string;
  reference: string;
  amount: number | string;
  currency: string;
  description: string | null;
  status: string;
  createdAt: string;
  user?: ExpenseStaff | null;
};

export type ParsedStockLine = {
  product: string;
  quantity: number | null;
  costPrice: number | null;
  sellingPrice: number | null;
  newQty: number | null;
  notes: string | null;
  raw: string;
};

export function formatExpenseMoney(value: number | string | null | undefined) {
  const amount = Number(value);
  if (value == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatExpenseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function staffLabel(user?: ExpenseStaff | null) {
  if (!user) return "Unknown staff";
  return user.name?.trim() || user.email;
}

/**
 * Parses stock-intake descriptions written by /api/expenses/procurement.
 * Example:
 * "Stock intake: BRC · SPH -1.00 (+2 units, cost ₹120/unit, sell ₹250, new qty 14) | Batch note"
 */
export function parseStockDescription(
  description: string | null | undefined
): ParsedStockLine {
  const raw = description?.trim() || "";
  if (!raw) {
    return {
      product: "—",
      quantity: null,
      costPrice: null,
      sellingPrice: null,
      newQty: null,
      notes: null,
      raw: "",
    };
  }

  const [main, ...noteParts] = raw.split(" | ");
  const notes = noteParts.join(" | ").trim() || null;

  const match = main.match(
    /^Stock intake:\s*(.+?)\s*\(\+(\d+(?:\.\d+)?)\s*units,\s*cost\s*₹([\d.]+)\/unit,\s*sell\s*₹([\d.]+),\s*new qty\s*(\d+)/i
  );

  if (!match) {
    return {
      product: main,
      quantity: null,
      costPrice: null,
      sellingPrice: null,
      newQty: null,
      notes,
      raw,
    };
  }

  return {
    product: match[1].trim(),
    quantity: Number(match[2]),
    costPrice: Number(match[3]),
    sellingPrice: Number(match[4]),
    newQty: Number(match[5]),
    notes,
    raw,
  };
}

export type FinanceExpenseRequestRow = {
  id: string;
  category: string;
  amount: number | string;
  status: string;
  billAvailable: boolean;
  noBillReason: string | null;
  employee: { name: string | null; email: string };
};

export async function listProcurementExpenses(): Promise<ProcurementExpense[]> {
  const data = await adminFetch<ProcurementExpense[]>(
    "/api/expenses/procurement"
  );
  return Array.isArray(data) ? data : [];
}

export async function listPendingFinanceExpenseRequests(): Promise<{
  items: FinanceExpenseRequestRow[];
  hasMore: boolean;
}> {
  const pending = await adminFetch<
    | { items?: FinanceExpenseRequestRow[]; hasMore?: boolean }
    | FinanceExpenseRequestRow[]
  >("/api/finance/expenses?status=PENDING&page=1&limit=100").catch(
    () => [] as FinanceExpenseRequestRow[]
  );
  if (Array.isArray(pending)) {
    return { items: pending, hasMore: false };
  }
  return {
    items: Array.isArray(pending.items) ? pending.items : [],
    hasMore: Boolean(pending.hasMore),
  };
}

export async function reviewFinanceExpenseRequest(
  id: string,
  action: "approve" | "reject"
): Promise<void> {
  await adminFetch("/api/finance/expenses", {
    method: "POST",
    body: JSON.stringify({ action, id }),
  });
}

export function matchesExpenseSearch(
  expense: ProcurementExpense,
  query: string
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const parsed = parseStockDescription(expense.description);

  return [
    expense.reference,
    expense.description,
    expense.status,
    expense.user?.name,
    expense.user?.email,
    parsed.product,
    parsed.notes,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}
