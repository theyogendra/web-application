"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isStaff } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  staffOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/reports", label: "Reports", icon: "barChart" },
  { href: "/inventory", label: "Inventory", icon: "package" },
  { href: "/proposals", label: "Proposals", icon: "fileText" },
  { href: "/quotations", label: "Quotations", icon: "fileText" },
  { href: "/invoices", label: "Invoices", icon: "receipt" },
  { href: "/payments", label: "Payments", icon: "creditCard" },
  { href: "/audit-logs", label: "Audit Logs", icon: "activity", staffOnly: true },
  { href: "/users", label: "Users", icon: "users", staffOnly: true },
];

// Inline outline icons (Lucide-style strokes) — no extra dependencies.
const ICONS = {
  package: (
    <>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
      <path d="M12 22.08V12" />
    </>
  ),
  fileText: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </>
  ),
  receipt: (
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </>
  ),
  creditCard: (
    <>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </>
  ),
  activity: (
    <>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </>
  ),
  barChart: (
    <>
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
} as const;

function Icon({ name }: { name: NavItem["icon"] }) {
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname() || "";
  // Avoid hydration mismatch — auth state lives in localStorage, which is only
  // available on the client. Render the staff-only links after mount.
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    setStaff(isStaff());
  }, [pathname]);

  const visibleNav = NAV.filter((item) => !item.staffOnly || staff);

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-ink-900 text-ink-100">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white shadow-soft">
          I
        </div>
        <span className="text-base font-semibold tracking-tight">
          InvoicePro
        </span>
      </div>

      <div className="px-3">
        <div className="h-px bg-white/10" />
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {visibleNav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white text-ink-900 shadow-soft"
                  : "text-ink-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="text-xs font-medium text-ink-200">InvoicePro v1.0</p>
        <p className="text-[11px] text-ink-400">
          Invoicing &amp; Payments
        </p>
      </div>
    </aside>
  );
}
