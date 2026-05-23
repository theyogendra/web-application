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
