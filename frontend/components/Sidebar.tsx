"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Package,
  FileText,
  Receipt,
  CreditCard,
  Activity,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { isStaff } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: any;   // lucide-react components type as ForwardRefExoticComponent; keep loose
  staffOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/reports",    label: "Reports",    icon: BarChart3 },
  { href: "/inventory",  label: "Inventory",  icon: Package },
  { href: "/proposals",  label: "Proposals",  icon: FileText },
  { href: "/quotations", label: "Quotations", icon: FileText },
  { href: "/invoices",   label: "Invoices",   icon: Receipt },
  { href: "/payments",   label: "Payments",   icon: CreditCard },
  { href: "/audit-logs", label: "Audit Logs", icon: Activity, staffOnly: true },
  { href: "/users",      label: "Users",      icon: Users,    staffOnly: true },
];

const COLLAPSE_KEY = "ip_sidebar_collapsed";

export default function Sidebar() {
  const pathname = usePathname() || "";

  // Auth gating + collapsed state — both client-side to avoid hydration mismatch.
  const [staff, setStaff] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setStaff(isStaff());
    if (typeof window !== "undefined") {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    }
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  const visibleNav = NAV.filter((item) => !item.staffOnly || staff);

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex shrink-0 flex-col border-r border-[var(--separator-soft)] bg-[var(--bg-surface)] dark:bg-[#1C1C1E]"
    >
      {/* Brand */}
      <div className="flex h-[68px] items-center px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A84FF] to-[#0071E3] text-[15px] font-bold text-white shadow-soft">
          IP
        </div>
        {!collapsed && (
          <span className="ml-3 text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            InvoicePro
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 pb-3 pt-1">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={[
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-all duration-150",
                active
                  ? "bg-[var(--bg-subtle)] text-[var(--text-primary)] dark:bg-[#2C2C2E]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] dark:hover:bg-[#2C2C2E]",
                collapsed ? "justify-center" : "",
              ].join(" ")}
            >
              {/* Active indicator rail */}
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[#0071E3]" />
              )}
              <Icon
                size={18}
                className={
                  active
                    ? "text-[#0071E3]"
                    : "text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]"
                }
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer / collapse toggle */}
      <div className="border-t border-[var(--separator-soft)] p-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] dark:hover:bg-[#2C2C2E]"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : (
            <>
              <ChevronLeft size={14} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
