"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  User as UserIcon,
  Settings,
} from "lucide-react";
import { clearSession, getUser } from "@/lib/auth";
import {
  getEffectiveTheme,
  setTheme,
  toggleTheme,
  type Theme,
} from "@/lib/theme";

type AuthUserLite = {
  full_name?: string;
  email?: string;
  role?: { name?: string } | null;
};

export default function TopNavbar() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUserLite | null>(null);
  const [theme, setLocalTheme] = useState<Theme>("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState([
    {
      id: "1",
      title: "New Invoice #INV-1004",
      description: "Created draft invoice for client Acme Corp.",
      time: "5m ago",
      read: false,
    },
    {
      id: "2",
      title: "Payment approved",
      description: "Payment of ₹15,000 for #INV-1002 approved.",
      time: "1h ago",
      read: false,
    },
    {
      id: "3",
      title: "Stock warning",
      description: "Product 'Server Rack' is low on stock (2 items left).",
      time: "2h ago",
      read: true,
    },
  ]);

  useEffect(() => {
    setUser(getUser());
    setLocalTheme(getEffectiveTheme());

    function onThemeChanged(e: any) {
      if (e.detail === "dark" || e.detail === "light") setLocalTheme(e.detail);
    }
    window.addEventListener("theme:changed", onThemeChanged as EventListener);
    return () =>
      window.removeEventListener(
        "theme:changed",
        onThemeChanged as EventListener,
      );
  }, []);

  // Close the user menu on outside click.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  // Close the notification menu on outside click.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [notifOpen]);

  // Keyboard accessibility: Escape closes dropdowns
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleToggleTheme() {
    setLocalTheme(toggleTheme());
  }

  function handleSignOut() {
    clearSession();
    setMenuOpen(false);
    router.replace("/login");
  }

  function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleClearAll() {
    setNotifications([]);
  }

  const initial = (user?.full_name || user?.email || "?")
    .charAt(0)
    .toUpperCase();
  const isDark = theme === "dark";

  return (
    <header className="glass sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[var(--separator-soft)] px-6">
      {/* Search */}
      <div className="flex flex-1 items-center">
        <div className="relative w-full max-w-[420px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            type="search"
            placeholder="Search invoices, customers, products..."
            className="w-full rounded-lg border border-[var(--separator)] bg-[var(--bg-subtle)] py-2 pl-9 pr-3 text-[13.5px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:bg-[var(--bg-surface)] focus:border-[#0071E3] focus:shadow-[0_0_0_3px_rgba(10,132,255,0.12)]"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleToggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            aria-label="Notifications"
            aria-haspopup="true"
            aria-expanded={notifOpen}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <Bell size={17} />
            {notifications.some((n) => !n.read) && (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#FF3B30]" />
            )}
          </button>

          {notifOpen && (
            <div className="surface-elevated animate-fade-in-up absolute right-0 mt-2 w-80 rounded-xl border border-[var(--separator-soft)] py-2 shadow-soft z-50">
              <div className="flex items-center justify-between border-b border-[var(--separator-soft)] px-4 py-2">
                <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                  Notifications
                </span>
                {notifications.some((n) => !n.read) && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-medium text-[#0071E3] hover:underline"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[13px] text-[var(--text-tertiary)]">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleMarkRead(n.id)}
                      className={`flex flex-col gap-0.5 border-b border-[var(--separator-soft)]/50 px-4 py-2.5 last:border-b-0 cursor-pointer transition-colors ${
                        n.read
                          ? "hover:bg-[var(--bg-subtle)]"
                          : "bg-[#0071E3]/5 hover:bg-[#0071E3]/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[12.5px] font-medium ${
                            n.read
                              ? "text-[var(--text-primary)]"
                              : "text-[#0071E3]"
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
                          {n.time}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-[var(--text-secondary)] leading-normal">
                        {n.description}
                      </p>
                    </div>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="flex justify-end border-t border-[var(--separator-soft)] px-4 pt-1.5">
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mx-2 h-6 w-px bg-[var(--separator)]" />

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-lg p-1 pr-3 transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#0A84FF] to-[#0071E3] text-[13px] font-semibold text-white">
              {initial}
            </span>
            <span className="hidden text-left md:block">
              <span className="block text-[13px] font-medium text-[var(--text-primary)] leading-tight">
                {user?.full_name || user?.email || "Account"}
              </span>
              <span className="block text-[11px] text-[var(--text-tertiary)] leading-tight">
                {user?.role?.name || "Member"}
              </span>
            </span>
          </button>

          {menuOpen && (
            <div className="surface-elevated animate-fade-in-up absolute right-0 mt-2 w-60 rounded-xl border border-[var(--separator-soft)] py-1.5 shadow-soft">
              <div className="border-b border-[var(--separator-soft)] px-3.5 py-2.5">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">
                  {user?.full_name || "Account"}
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)] truncate">
                  {user?.email}
                </p>
              </div>
              <MenuItem
                icon={<UserIcon size={14} />}
                label="Profile"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/users");
                }}
              />
              <MenuItem
                icon={<Settings size={14} />}
                label="Settings"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/settings");
                }}
              />
              <div className="my-1 h-px bg-[var(--separator-soft)]" />
              <MenuItem
                icon={<LogOut size={14} />}
                label="Sign out"
                onClick={handleSignOut}
                danger
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex w-full items-center gap-2.5 px-3.5 py-1.5 text-[13px] transition-colors",
        danger
          ? "text-[#FF3B30] hover:bg-[#FF3B30]/8"
          : "text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <span
        className={danger ? "text-[#FF3B30]" : "text-[var(--text-tertiary)]"}
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
