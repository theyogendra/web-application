// API client for the invoicing & payments backend.
// Base URL: ${NEXT_PUBLIC_API_URL}/api

import { clearSession, getToken } from "./auth";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/api";

export type Json = any;

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return API_BASE + (path.startsWith("/") ? path : "/" + path);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + escaped + "=([^;]*)"),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

function authHeaders(method?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Mirror the CSRF cookie back as a header for state-changing requests.
  // The backend only checks this when cookie auth was used, so Bearer
  // clients are unaffected.
  if (method && !/^(GET|HEAD|OPTIONS)$/i.test(method)) {
    const csrf = readCookie("csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  return headers;
}

async function parseResponse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  let body: any = null;
  if (contentType.includes("application/json")) {
    body = await res.json().catch(() => null);
  } else {
    body = await res.text().catch(() => null);
  }
  if (!res.ok) {
    // 401 from a non-login endpoint means our token is bad — drop it so the
    // layout redirects to /login on the next render. Skip for the login
    // endpoint itself so a bad password doesn't nuke an existing session.
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !res.url.includes("/auth/login")
    ) {
      clearSession();
      // Soft redirect: if the user is on a dashboard route, send them to login.
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    const message =
      (body &&
        typeof body === "object" &&
        (body.message || body.detail || body.error)) ||
      (typeof body === "string" && body) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body;
}

function handleNetworkError(err: any): never {
  if (err instanceof ApiError) throw err;
  throw new ApiError(
    "Cannot reach the server. Make sure the backend is running.",
    0,
    null,
  );
}

type CacheEntry = {
  data: any;
  timestamp: number;
};

const getCache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60 * 1000; // 60s default cache TTL

export function clearApiCache(prefix?: string): void {
  if (!prefix) {
    getCache.clear();
    return;
  }
  getCache.forEach((_, key) => {
    if (key.includes(prefix)) {
      getCache.delete(key);
    }
  });
}

export type ApiGetOptions = {
  useCache?: boolean;
  ttlMs?: number;
};

export async function apiGet(
  path: string,
  options?: ApiGetOptions,
): Promise<any> {
  const useCache = options?.useCache ?? true;
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const cacheKey = path;

  if (useCache) {
    const cached = getCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.data;
    }
  }

  try {
    const res = await fetch(buildUrl(path), {
      method: "GET",
      headers: { Accept: "application/json", ...authHeaders("GET") },
      credentials: "include",
      cache: "no-store",
    });
    const data = await parseResponse(res);
    if (useCache && data) {
      getCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    return data;
  } catch (err) {
    return handleNetworkError(err);
  }
}

export async function apiPost(path: string, body?: any): Promise<any> {
  try {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders("POST"),
      },
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await parseResponse(res);
    clearApiCache();
    return data;
  } catch (err) {
    return handleNetworkError(err);
  }
}

export async function apiPut(path: string, body?: any): Promise<any> {
  try {
    const res = await fetch(buildUrl(path), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders("PUT"),
      },
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await parseResponse(res);
    clearApiCache();
    return data;
  } catch (err) {
    return handleNetworkError(err);
  }
}

export async function apiDelete(path: string): Promise<any> {
  try {
    const res = await fetch(buildUrl(path), {
      method: "DELETE",
      headers: { Accept: "application/json", ...authHeaders("DELETE") },
      credentials: "include",
    });
    const data = await parseResponse(res);
    clearApiCache();
    return data;
  } catch (err) {
    return handleNetworkError(err);
  }
}

// Submit a FormData body (used for the login endpoint which speaks multipart).
export async function apiPostForm(path: string, form: FormData): Promise<any> {
  try {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: { Accept: "application/json", ...authHeaders("POST") },
      credentials: "include",
      body: form,
    });
    const data = await parseResponse(res);
    clearApiCache();
    return data;
  } catch (err) {
    return handleNetworkError(err);
  }
}

// Fetch a file endpoint as a blob and trigger a browser download.
//
// Parameters:
//   path        — API path (relative to API_BASE) or full URL.
//   filename    — Override the download filename. If omitted, derived from
//                 Content-Disposition or the URL path.
//   expectedMime — Optional. When provided, the function validates that the
//                 server's Content-Type starts with this string.  This is the
//                 main guard against the server accidentally returning a JSON
//                 error body or an HTML page instead of the file.
export async function downloadFile(
  path: string,
  filename?: string,
  expectedMime?: string,
): Promise<void> {
  // Build Accept header so intermediaries (proxies, CDNs) don't return HTML.
  const acceptHeader = expectedMime ? `${expectedMime}, */*;q=0.8` : "*/*";

  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: "GET",
      headers: { Accept: acceptHeader, ...authHeaders("GET") },
      credentials: "include",
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiError(
      "Cannot reach the server. Make sure the backend is running.",
      0,
      null,
    );
  }

  if (!res.ok) {
    // Try to surface the server error message even for binary endpoints.
    let message = `Download failed with status ${res.status}`;
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json().catch(() => ({}));
        message = j.message || j.error || message;
      } else {
        const txt = await res.text().catch(() => "");
        if (txt) message = txt;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status, null);
  }

  // ── Validate response Content-Type ───────────────────────────────────────
  // This catches the common bug where the server returns a JSON error (or an
  // HTML gateway error) but sets a 200 status code.
  const serverCt = res.headers.get("content-type") || "";
  if (expectedMime && !serverCt.includes(expectedMime)) {
    // Peek at the body to surface a meaningful error message.
    let detail = "";
    try {
      const txt = await res.text();
      if (txt.length < 2000) {
        const parsed = JSON.parse(txt);
        detail = parsed.message || parsed.error || txt;
      } else {
        detail = txt.slice(0, 300);
      }
    } catch {
      // ignore
    }
    throw new ApiError(
      `Server returned '${serverCt}' instead of '${expectedMime}'. ` +
        (detail ? `Detail: ${detail}` : "The file may be an error response."),
      res.status,
      null,
    );
  }

  // ── Read body as Blob ─────────────────────────────────────────────────────
  const blob = await res.blob();

  // Re-type the blob with the correct MIME so the browser opens it correctly.
  const mimeToUse =
    expectedMime || serverCt.split(";")[0].trim() || "application/octet-stream";
  const typedBlob = new Blob([blob], { type: mimeToUse });

  // ── Derive filename ───────────────────────────────────────────────────────
  let name = filename;
  if (!name) {
    const disp = res.headers.get("content-disposition") || "";
    const match = disp.match(
      /filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i,
    );
    if (match) name = decodeURIComponent(match[1].trim());
  }
  if (!name) {
    const parts = path.split("?")[0].split("/");
    name = parts[parts.length - 1] || "download";
  }

  // ── Trigger browser download ──────────────────────────────────────────────
  const url = window.URL.createObjectURL(typedBlob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  // Revoke after a short delay so the browser has time to start the download.
  setTimeout(() => {
    a.remove();
    window.URL.revokeObjectURL(url);
  }, 150);
}

/** Convenience wrapper: downloads a CSV file with MIME validation. */
export async function downloadCsv(
  path: string,
  filename?: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const name = filename || `Report_${today}.csv`;
  return downloadFile(path, name, "text/csv");
}

/** Convenience wrapper: downloads a PDF file with MIME validation. */
export async function downloadPdf(
  path: string,
  filename?: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const name = filename || `Report_${today}.pdf`;
  return downloadFile(path, name, "application/pdf");
}

export { API_BASE };
