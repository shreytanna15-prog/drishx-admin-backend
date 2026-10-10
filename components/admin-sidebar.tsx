"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  Bell,
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
  Receipt,
  RotateCcw,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";

import { BrandMark } from "@/app/components/brand-logo";
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
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  icon: LucideIcon;
  href?: string;
  badge?: string;
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ title: "Dashboard", icon: Home, href: "/" }],
  },
  {
    title: "Order Management",
    items: [
      { title: "Orders", icon: ShoppingCart, href: "/orders" },
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
        title: "Reorder Rules",
        icon: Gauge,
        href: "/inventory/power-wise-stock",
      },
      {
        title: "Procurement Requests",
        icon: ClipboardList,
        href: "/procurement/requests",
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
        title: "GST & Reports",
        icon: BarChart3,
        href: "/finance/reports",
      },
      {
        title: "Finance Settings",
        icon: Settings,
        href: "/finance/settings",
      },
    ],
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

function resolveActiveTitle(pathname: string) {
  if (pathname.startsWith("/finance/payments")) return "Payments & Claims";
  if (pathname.startsWith("/finance/receivables")) return "Receivables";
  if (pathname.startsWith("/finance/purchases")) return "Purchases";
  if (pathname.startsWith("/finance/payables")) return "Payables";
  if (pathname.startsWith("/finance/reports")) return "GST & Reports";
  if (pathname.startsWith("/finance/settings")) return "Finance Settings";
  if (
    pathname === "/finance/expenses" ||
    pathname.startsWith("/finance/expenses/")
  ) {
    return "Expenses";
  }
  if (
    pathname === "/finance/invoices" ||
    pathname.startsWith("/finance/invoices/")
  ) {
    return "Sales & Invoices";
  }
  if (pathname === "/employees/roles" || pathname.startsWith("/employees/roles/")) {
    return "Roles & Permissions";
  }
  if (pathname === "/employees" || pathname.startsWith("/employees/")) {
    return "Employees";
  }
  if (pathname === "/clients" || pathname.startsWith("/clients/")) {
    return "Clients";
  }
  if (pathname.startsWith("/loyalty/settings")) return "Loyalty Settings";
  if (pathname.startsWith("/loyalty/customers")) return "Loyalty & Wallet";
  if (pathname.startsWith("/loyalty")) return "Loyalty & Wallet";
  if (
    pathname === "/inventory/stock-overview" ||
    pathname.startsWith("/inventory/stock-overview/")
  ) {
    return "Stock Overview";
  }
  if (
    pathname === "/inventory/power-wise-stock" ||
    pathname.startsWith("/inventory/power-wise-stock/")
  ) {
    return "Power wise stock";
  }
  if (
    pathname === "/inventory/products-catalog" ||
    pathname.startsWith("/inventory/products-catalog/")
  ) {
    return "Products & catalog";
  }
  if (pathname === "/orders/rx-lab" || pathname.startsWith("/orders/rx-lab/")) {
    return "Rx Orders";
  }
  if (
    pathname === "/orders/dispatch" ||
    pathname.startsWith("/orders/dispatch/")
  ) {
    return "Dispatch Management";
  }
  if (
    pathname === "/orders/procurement" ||
    pathname.startsWith("/orders/procurement/")
  ) {
    return "Procurement";
  }
  if (pathname === "/returns" || pathname.startsWith("/returns/")) {
    return "Returns & Replacements";
  }
  if (pathname === "/orders" || pathname.startsWith("/orders/")) {
    return "Orders";
  }
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href && item.href !== "/" && pathname.startsWith(item.href)) {
        return item.title;
      }
    }
  }
  return "Dashboard";
}

type AdminSidebarProps = {
  pathname?: string;
  activeItem?: string;
};

export function AdminSidebar({
  pathname = "/",
  activeItem,
}: AdminSidebarProps) {
  const current = activeItem ?? resolveActiveTitle(pathname);

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
                {section.items.map((item) => {
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
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-4 py-3">
        <p className="text-[11px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
          © 2025 DrishX ERP
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
