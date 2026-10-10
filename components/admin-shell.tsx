"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ThemeToggle } from "@/app/components/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  clearSession,
  getStoredUser,
  getToken,
  isAdminUser,
  type AuthUser,
} from "@/app/lib/client-auth";
import { clearListCache } from "@/app/lib/admin-cache";
import {
  logoutSession,
  refreshAccessToken,
  registerAuthFailureHandler,
} from "@/app/lib/admin-auth-fetch";

type AdminPageHeaderState = {
  title: string;
  subtitle?: string;
};

type AdminPageHeaderContextValue = {
  header: AdminPageHeaderState;
  setHeader: Dispatch<SetStateAction<AdminPageHeaderState>>;
};

const AdminPageHeaderContext = createContext<AdminPageHeaderContextValue | null>(
  null
);

type AdminPageProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Layout chrome: auth once, sidebar + header stay mounted across navigations. */
export function AdminChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [header, setHeader] = useState<AdminPageHeaderState>({ title: "" });

  useEffect(() => {
    registerAuthFailureHandler(() => {
      clearListCache();
      clearSession();
      router.replace("/login?session=expired");
    });
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      let token = getToken();
      let stored = getStoredUser();

      // New tab may have empty sessionStorage while the refresh cookie is still
      // valid — attempt one silent refresh before forcing login.
      if (!token) {
        const outcome = await refreshAccessToken();
        if (cancelled) return;
        if (outcome.status === "refreshed") {
          token = getToken();
          stored = getStoredUser();
        } else if (outcome.status === "transient") {
          // Keep the refresh cookie; send to login without wiping session storage
          // so a retry can succeed when the network recovers.
          router.replace("/login");
          return;
        }
      }

      if (!token || !isAdminUser(stored)) {
        clearSession();
        router.replace("/login");
        return;
      }

      setUser(stored);
      setReady(true);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    clearListCache();
    await logoutSession();
    router.replace("/login");
  }

  const headerContext = useMemo(
    () => ({ header, setHeader }),
    [header]
  );

  return (
    <AdminPageHeaderContext.Provider value={headerContext}>
      {!ready ? (
        <main className="admin-loading" suppressHydrationWarning>
          <p suppressHydrationWarning>Loading…</p>
        </main>
      ) : (
        <SidebarProvider
          style={{ "--sidebar-width": "17.5rem" } as CSSProperties}
        >
          <AdminSidebar pathname={pathname} />
          <SidebarInset className="admin-page min-h-svh bg-(--brand-background)">
            <header className="admin-header sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="text-(--brand-text)" />
                <div className="hidden sm:block">
                  {header.title ? (
                    <p className="text-sm font-semibold text-(--brand-text)">
                      {header.title}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-(--brand-text-muted)">
                      &nbsp;
                    </p>
                  )}
                  {header.subtitle ? (
                    <p className="text-xs text-(--brand-text-muted)">
                      {header.subtitle}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="admin-header-actions">
                <ThemeToggle />
                <p className="admin-user">{user?.name || user?.email}</p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="auth-button-outline"
                >
                  Log out
                </button>
              </div>
            </header>

            <div className="relative z-10 flex flex-1 flex-col p-4 sm:p-6">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      )}
    </AdminPageHeaderContext.Provider>
  );
}

/** Sets header title/subtitle for the persistent chrome without remounting it. */
export function AdminPage({ title, subtitle, children }: AdminPageProps) {
  const ctx = useContext(AdminPageHeaderContext);
  const setHeader = ctx?.setHeader;

  useEffect(() => {
    if (!setHeader) return;
    setHeader((prev) => {
      if (prev.title === title && prev.subtitle === subtitle) return prev;
      return { title, subtitle };
    });
  }, [title, subtitle, setHeader]);

  return <>{children}</>;
}

/** @deprecated Use AdminChrome in layout + AdminPage on each page. */
export function AdminShell({ title, subtitle, children }: AdminPageProps) {
  return (
    <AdminPage title={title} subtitle={subtitle}>
      {children}
    </AdminPage>
  );
}
