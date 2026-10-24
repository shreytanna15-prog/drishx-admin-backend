/**
 * Resolves which sidebar item title should appear active for a pathname.
 * More specific child routes must be checked before parent prefixes.
 */

export function pathMatchesRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveActiveTitle(
  pathname: string,
  fallbackItems: { title: string; href?: string }[] = []
): string {
  if (pathMatchesRoute(pathname, "/finance/payments")) return "Payments & Claims";
  if (pathMatchesRoute(pathname, "/finance/receivables")) return "Receivables";
  if (pathMatchesRoute(pathname, "/finance/purchases")) return "Purchases";
  if (pathMatchesRoute(pathname, "/finance/payables")) return "Payables";
  if (
    pathname === "/reports" ||
    pathname.startsWith("/reports/") ||
    pathname.startsWith("/finance/reports")
  ) {
    return "Reports";
  }
  if (pathMatchesRoute(pathname, "/finance/pricing-tiers")) return "Pricing tiers";
  if (pathMatchesRoute(pathname, "/finance/settings")) return "Finance Settings";
  if (pathMatchesRoute(pathname, "/finance/expenses")) return "Expenses";
  if (pathMatchesRoute(pathname, "/finance/invoices")) return "Sales & Invoices";
  if (pathMatchesRoute(pathname, "/employees/roles")) return "Roles & Permissions";
  if (pathMatchesRoute(pathname, "/employees")) return "Employees";
  if (pathMatchesRoute(pathname, "/clients")) return "Clients";
  if (pathMatchesRoute(pathname, "/loyalty/settings")) return "Loyalty Settings";
  if (pathMatchesRoute(pathname, "/loyalty/customers")) return "Loyalty & Wallet";
  if (pathMatchesRoute(pathname, "/loyalty")) return "Loyalty & Wallet";
  if (pathMatchesRoute(pathname, "/inventory/stock-overview")) {
    return "Stock Overview";
  }
  if (pathMatchesRoute(pathname, "/inventory/power-wise-stock")) {
    return "Reorder Rules";
  }
  if (pathMatchesRoute(pathname, "/inventory/stock-matrix")) return "Stock Matrix";
  if (pathMatchesRoute(pathname, "/procurement/suppliers")) return "Suppliers";
  if (pathMatchesRoute(pathname, "/inventory/products-catalog")) {
    return "Products & catalog";
  }
  if (pathMatchesRoute(pathname, "/procurement/purchase-orders")) {
    return "Purchase Orders";
  }
  if (pathMatchesRoute(pathname, "/procurement/requests")) {
    return "Procurement Requests";
  }
  if (pathMatchesRoute(pathname, "/orders/new")) return "Create Order";
  if (pathMatchesRoute(pathname, "/orders/overview")) return "Orders overview";
  if (pathMatchesRoute(pathname, "/orders/rx-lab")) return "Rx Orders";
  if (pathMatchesRoute(pathname, "/orders/dispatch")) {
    return "Dispatch Management";
  }
  if (pathMatchesRoute(pathname, "/orders/procurement")) return "Procurement";
  if (pathMatchesRoute(pathname, "/returns")) return "Returns & Replacements";
  // Parent Orders only — after all /orders/* siblings above.
  if (pathMatchesRoute(pathname, "/orders")) return "Orders";

  // Longest matching href wins so /orders does not steal /orders/overview
  // if a caller relies on the generic fallback list.
  let best: { title: string; href: string } | null = null;
  for (const item of fallbackItems) {
    if (!item.href || item.href === "/") continue;
    if (!pathMatchesRoute(pathname, item.href.split("?")[0]!)) continue;
    if (!best || item.href.length > best.href.length) {
      best = { title: item.title, href: item.href };
    }
  }
  if (best) return best.title;

  return "Dashboard";
}
