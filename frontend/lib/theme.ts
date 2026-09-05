// Tiny client-side theme manager. Persists choice in localStorage, applies the
// `.dark` class to <html> so Tailwind's `dark:` variants kick in.

export type Theme = "light" | "dark";

const STORAGE_KEY = "ip_theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : null;
}

export function getEffectiveTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Temporarily disable CSS transitions during class toggle to prevent
  // intermediate color interpolation (white flash) across contrasting themes.
  const css = document.createElement("style");
  css.appendChild(
    document.createTextNode(
      "* { -webkit-transition: none !important; -moz-transition: none !important; -o-transition: none !important; -ms-transition: none !important; transition: none !important; }",
    ),
  );
  document.head.appendChild(css);

  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  // Force synchronous reflow so theme class change applies immediately
  window.getComputedStyle(root).opacity;

  document.head.removeChild(css);
}

export function setTheme(t: Theme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, t);
  applyTheme(t);
  // Notify listeners so the navbar icon updates without a full reload.
  window.dispatchEvent(new CustomEvent("theme:changed", { detail: t }));
}

export function toggleTheme(): Theme {
  const next: Theme = getEffectiveTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
