"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import TopNavbar from "./TopNavbar";
import { getToken } from "@/lib/auth";

// Public routes that render their own layout (no chrome, no auth required).
const PUBLIC_ROUTES = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPublic(pathname)) {
      setReady(true);
      return;
    }
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (isPublic(pathname)) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-page)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--separator)] border-t-[#0071E3]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-page)]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNavbar />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
