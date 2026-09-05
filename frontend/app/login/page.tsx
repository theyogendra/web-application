"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostForm } from "@/lib/api";
import { getToken, setSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@enterprise.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Already signed in? Send straight to the dashboard.
  useEffect(() => {
    if (getToken()) router.replace("/invoices");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("username", email);
      form.append("password", password);

      const data = await apiPostForm("/auth/login", form);

      if (!data || !data.access_token || !data.user) {
        throw new Error("Unexpected response from server.");
      }

      setSession(data.access_token, data.user);
      router.replace("/invoices");
    } catch (err: any) {
      setError(err?.message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 via-white to-brand-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white shadow-soft">
            I
          </div>
          <span className="text-xl font-semibold tracking-tight text-ink-900">
            InvoicePro
          </span>
        </div>

        <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-soft">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-ink-900">Welcome back</h1>
            <p className="mt-1 text-sm text-ink-500">
              Sign in to manage invoices, payments and reports.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
                Email
              </span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
                Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 pr-16 text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs font-medium text-ink-500 hover:text-ink-900"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-800 active:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="mt-6 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
            <p className="font-medium text-ink-700">
              Default admin credentials
            </p>
            <p>admin@enterprise.com / admin123</p>
            <p className="mt-1 text-ink-400">
              Seeded by the users/roles migration. Change in production.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          © {new Date().getFullYear()} InvoicePro
        </p>
      </div>
    </div>
  );
}
