"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  Bell,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock,
  FileSearch,
  FileText,
  FlaskConical,
  Gauge,
  Home,
  LayoutGrid,
  Layers,
  List,
  Package,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  TrendingUp,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";

import { BrandMark } from "@/app/components/brand-logo";
import { resolveActiveTitle } from "@/app/lib/admin-nav-active";
import {
  getReportDefinition,
  groupReportsForNav,
  listReportDefinitions,
  reportNavCategory,
} from "@/app/lib/reports/registry";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  icon: LucideIcon;
  href?: string;
  badge?: string;
};

type NavSection = {
  title?: string;
  items: NavItem[];
  /** When true, render expandable report categories instead of flat items. */
  reportsExpandable?: boolean;
};

/** All shipped reports; power reports fold into Inventory for sidebar discoverability. */
const REPORT_CATEGORY_NAV = groupReportsForNav(
  listReportDefinitions({ phaseMax: 4 })
).map((group) => ({
  category: group.category,
  label: group.label,
  firstKey: group.reports[0]!.key,
  href: `/reports?report=${group.reports[0]!.key}`,
}));

/** Default Reports entry: Financial → GST Summary. */
const REPORTS_DEFAULT_HREF = "/reports?report=gst-summary";

const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ title: "Dashboard", icon: Home, href: "/" }],
  },
  {
    title: "Order Management",
    items: [
      { title: "Orders", icon: ShoppingCart, href: "/orders" },
      {
        title: "Create Order",
        icon: Plus,
        href: "/orders/new",
      },
      {
        title: "Orders overview",
        icon: LayoutGrid,
        href: "/orders/overview",
      },
      { title: "Rx Orders", icon: FlaskConical, href: "/orders/rx-lab" },
      {
        title: "Dispatch Management",
        icon: Truck,
        href: "/orders/dispatch",
      },
      {
        title: "Procurement",
        icon: FileSearch,
        href: "/orders/procurement",
      },
      { title: "Returns & Replacements", icon: RotateCcw, href: "/returns" },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        title: "Stock Overview",
        icon: Package,
        href: "/inventory/stock-overview",
      },
      {
        title: "Power-wise Inventory",
        icon: Gauge,
        href: "/inventory/power-wise-stock",
      },
      {
        title: "Stock Transactions",
        icon: FileText,
        href: "/inventory/stock-transactions",
      },
      {
        title: "Stock Adjustments",
        icon: Pencil,
        href: "/inventory/stock-adjustments",
      },
      {
        title: "Stock Checks",
        icon: FlaskConical,
        href: "/inventory/stock-checks",
      },
      {
        title: "Procurement Requests",
        icon: ClipboardList,
        href: "/procurement/requests",
      },
      {
        title: "Purchase Orders",
        icon: FileText,
        href: "/procurement/purchase-orders",
      },
      {
        title: "Suppliers",
        icon: Store,
        href: "/procurement/suppliers",
      },
      {
        title: "Attributes",
        icon: Tags,
        href: "/inventory/attributes",
      },
      {
        title: "Products & catalog",
        icon: Layers,
        href: "/inventory/products-catalog",
      },
      { title: "Smart Alerts", icon: Bell },
    ],
  },
  {
    title: "Client & CRM",
    items: [
      { title: "Clients", icon: User, href: "/clients?tab=pending" },
      { title: "Loyalty & Wallet", icon: Wallet, href: "/loyalty/customers" },
    ],
  },
  {
    title: "Employee & HR",
    items: [
      { title: "Employees", icon: Users, href: "/employees" },
      { title: "Roles & Permissions", icon: Shield, href: "/employees/roles" },
      { title: "Attendance", icon: Clock, href: "/employees/attendance" },
      { title: "Performance", icon: TrendingUp },
      { title: "Payroll & Incentives", icon: Banknote },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        title: "Sales & Invoices",
        icon: Receipt,
        href: "/finance/invoices",
      },
      {
        title: "Payments & Claims",
        icon: Banknote,
        href: "/finance/payments",
      },
      {
        title: "Receivables",
        icon: CircleDollarSign,
        href: "/finance/receivables",
      },
      {
        title: "Purchases",
        icon: Package,
        href: "/finance/purchases",
      },
      {
        title: "Payables",
        icon: FileText,
        href: "/finance/payables",
      },
      { title: "Expenses", icon: List, href: "/finance/expenses" },
      {
        title: "Pricing tiers",
        icon: CircleDollarSign,
        href: "/finance/pricing-tiers",
      },
      {
        title: "Finance Settings",
        icon: Settings,
        href: "/finance/settings",
      },
    ],
  },
  {
    title: "Reports",
    reportsExpandable: true,
    items: [],
  },
  {
    title: "System",
    items: [
      { title: "Settings", icon: Settings, href: "/settings" },
      { title: "Delivery Services", icon: Truck, href: "/settings/delivery" },
      { title: "Audit Logs", icon: FileSearch, href: "/audit" },
    ],
  },
  {
    title: "Upcoming",
    items: [
      { title: "AI Center", icon: Sparkles, badge: "New" },
    ],
  },
];

function isReportsPath(pathname: string) {
  return (
    pathname === "/reports" ||
    pathname.startsWith("/reports/") ||
    pathname.startsWith("/finance/reports")
  );
}

const NAV_FALLBACK_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

function ReportsNavSection({ onReportsPath }: { onReportsPath: boolean }) {
  const { state } = useSidebar();
  const searchParams = useSearchParams();
  const reportKey = searchParams.get("report")?.trim() || "";
  const activeCategory = useMemo(() => {
    if (!onReportsPath || !reportKey) return null;
    const def = getReportDefinition(reportKey);
    return def ? reportNavCategory(def.category) : null;
  }, [onReportsPath, reportKey]);

  const [open, setOpen] = useState(onReportsPath);
  const iconCollapsed = state === "collapsed";

  useEffect(() => {
    if (onReportsPath) setOpen(true);
  }, [onReportsPath]);

  const activeClass = onReportsPath
    ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  return (
    <SidebarMenuItem>
      {iconCollapsed ? (
        <SidebarMenuButton
          asChild
          isActive={onReportsPath}
          tooltip="Reports"
          className={activeClass}
        >
          <Link href={REPORTS_DEFAULT_HREF}>
            <BarChart3 />
            <span>Reports</span>
          </Link>
        </SidebarMenuButton>
      ) : (
        <>
          <div className="relative flex w-full min-w-0 items-center">
            <SidebarMenuButton
              asChild
              isActive={onReportsPath}
              tooltip="Reports"
              className={cn(activeClass, "pr-8")}
            >
              <Link
                href={REPORTS_DEFAULT_HREF}
                onClick={() => setOpen(true)}
              >
                <BarChart3 />
                <span>Reports</span>
              </Link>
            </SidebarMenuButton>
            <button
              type="button"
              aria-label={
                open ? "Collapse report categories" : "Expand report categories"
              }
              aria-expanded={open}
              aria-controls="sidebar-reports-categories"
              onClick={() => setOpen((prev) => !prev)}
              className="absolute top-1/2 right-1 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200",
                  open ? "rotate-0" : "-rotate-90"
                )}
              />
            </button>
          </div>
          {open ? (
            <SidebarMenuSub id="sidebar-reports-categories">
              {REPORT_CATEGORY_NAV.map((item) => {
                const isActive =
                  onReportsPath && activeCategory === item.category;
                return (
                  <SidebarMenuSubItem key={item.category}>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      isActive={isActive}
                      className={
                        isActive
                          ? "bg-sidebar-primary/20 font-semibold text-sidebar-primary data-active:bg-sidebar-primary/20 data-active:text-sidebar-primary"
                          : undefined
                      }
                    >
                      <Link href={item.href}>{item.label}</Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          ) : null}
        </>
      )}
    </SidebarMenuItem>
  );
}

type AdminSidebarProps = {
  pathname?: string;
  activeItem?: string;
};

export function AdminSidebar({
  pathname = "/",
  activeItem,
}: AdminSidebarProps) {
  const current =
    activeItem ?? resolveActiveTitle(pathname, NAV_FALLBACK_ITEMS);
  const onReportsPath = isReportsPath(pathname);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border [--admin-topbar-height:4rem]"
    >
      <SidebarHeader className="h-(--admin-topbar-height) min-h-(--admin-topbar-height) justify-center gap-0 border-b border-sidebar-border px-4 py-0">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <BrandMark size="sm" />
          <div className="flex flex-col justify-center gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="text-lg font-extrabold leading-tight tracking-tight text-sidebar-foreground">
              DrishX
            </span>
            <span className="text-[11px] font-medium leading-none tracking-wide text-sidebar-foreground/55">
              Optical ERP
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <SidebarGroup
            key={section.title ?? `section-${sectionIndex}`}
            className="py-1"
          >
            {section.title ? (
              <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {section.title}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.reportsExpandable ? (
                  <Suspense
                    fallback={
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={onReportsPath}
                          tooltip="Reports"
                          className={
                            onReportsPath
                              ? "bg-sidebar-primary text-sidebar-primary-foreground"
                              : "text-sidebar-foreground/80"
                          }
                        >
                          <Link href={REPORTS_DEFAULT_HREF}>
                            <BarChart3 />
                            <span>Reports</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    }
                  >
                    <ReportsNavSection onReportsPath={onReportsPath} />
                  </Suspense>
                ) : (
                  section.items.map((item) => {
                    const isActive = item.title === current;
                    const hasRoute = Boolean(item.href);

                    return (
                      <SidebarMenuItem key={item.title}>
                        {hasRoute ? (
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.title}
                            className={
                              isActive
                                ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            }
                          >
                            <Link href={item.href!}>
                              <item.icon />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton
                            isActive={isActive}
                            tooltip={item.title}
                            className="cursor-default text-sidebar-foreground/80 opacity-80"
                          >
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        )}
                        {item.badge ? (
                          <SidebarMenuBadge className="bg-sidebar-primary text-[10px] font-bold text-sidebar-primary-foreground">
                            {item.badge}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-4 py-3">
        <p className="text-[11px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
          © {new Date().getFullYear()} DrishX ERP
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
