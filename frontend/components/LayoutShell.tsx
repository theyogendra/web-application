"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { clearSession, getToken, getUser } from "@/lib/auth";

// Public routes that render their own layout (no sidebar, no auth required).
const PUBLIC_ROUTES = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ full_name?: string; email?: string } | null>(null);

  // Soft auth gate: dashboard routes redirect to /login if there is no token.
  useEffect(() => {
    if (isPublic(pathname)) {
      setReady(true);
      return;
    }
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    setReady(true);
  }, [pathname, router]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (isPublic(pathname)) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-50">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
      </div>
    );
  }

  const initial = (user?.full_name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink-200 bg-white px-8">
          <div>
            <h2 className="text-base font-semibold text-ink-800">Dashboard</h2>
            <p className="text-xs text-ink-400">Invoicing &amp; Payments Console</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium text-ink-800">
                {user?.full_name || user?.email || "Account"}
              </p>
              <p className="text-xs text-ink-400">{user?.email}</p>
            </div>
            <div
              aria-label="User avatar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-semibold text-white shadow-soft"
            >
              {initial}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
