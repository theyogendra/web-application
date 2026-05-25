// Auth state lives in localStorage so the API client can attach the bearer
// token on every request and the LayoutShell can gate dashboard routes.

const TOKEN_KEY = "ip_token";
const USER_KEY = "ip_user";

export type AuthUser = {
  id: string;
  email: string;
  full_name?: string;
  is_superuser?: boolean;
  role?: { id: string; name: string; description?: string } | null;
  permissions?: string[];
  module_access?: Record<string, "view" | "edit"> | null;
  [k: string]: any;
};

const isBrowser = () => typeof window !== "undefined";

export function getToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function hasPermission(perm: string): boolean {
  const user = getUser();
  if (!user) return false;
  if (user.is_superuser) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

// Role helpers --------------------------------------------------------------
// These mirror the backend rules so the UI hides affordances the user can't
// use. The backend still enforces access; this is purely cosmetic.

export function isAdmin(): boolean {
  const user = getUser();
  if (!user) return false;
  if (user.is_superuser) return true;
  return user.role?.name === "Admin";
}

export function isManager(): boolean {
  const user = getUser();
  if (!user) return false;
  return user.role?.name === "Manager";
}

export function isStaff(): boolean {
  return isAdmin() || isManager();
}

// `canView` is intentionally permissive: any authenticated session can hit a
// module page; if the backend doesn't want them seeing the data it returns 403
// and the page renders an ErrorState. We don't try to hide whole pages here.
export function canView(_module: string): boolean {
  const user = getUser();
  return !!user;
}

// `canEdit` controls the create/edit/delete affordances on each module page.
// Admin/Manager always pass (Manager has full edit on these five modules).
// Employees need an explicit `module_access[m] === 'edit'`.
export function canEdit(module: string): boolean {
  const user = getUser();
  if (!user) return false;
  if (isStaff()) return true;
  const access = user.module_access || {};
  return access[module] === "edit";
}
