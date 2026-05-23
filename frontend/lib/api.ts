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
    new RegExp("(?:^|; )" + escaped + "=([^;]*)")
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
      (body && typeof body === "object" && (body.message || body.detail || body.error)) ||
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
    null
  );
}

export async function apiGet(path: string): Promise<any> {
  try {
    const res = await fetch(buildUrl(path), {
      method: "GET",
      headers: { Accept: "application/json", ...authHeaders("GET") },
      credentials: "include",
      cache: "no-store",
    });
    return await parseResponse(res);
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
    return await parseResponse(res);
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
    return await parseResponse(res);
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
    return await parseResponse(res);
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
    return await parseResponse(res);
  } catch (err) {
    return handleNetworkError(err);
  }
}

// Fetch a file endpoint as a blob and trigger a browser download.
export async function downloadFile(
  path: string,
  filename?: string
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: "GET",
      headers: { ...authHeaders("GET") },
      credentials: "include",
    });
  } catch (err) {
    throw new ApiError(
      "Cannot reach the server. Make sure the backend is running.",
      0,
      null
    );
  }
  if (!res.ok) {
    let message = `Download failed with status ${res.status}`;
    try {
      const txt = await res.text();
      if (txt) message = txt;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status, null);
  }

  const blob = await res.blob();

  // Try to derive a filename from the Content-Disposition header.
  let name = filename;
  if (!name) {
    const disp = res.headers.get("content-disposition") || "";
    const match = disp.match(/filename="?([^"]+)"?/i);
    if (match) name = match[1];
  }
  if (!name) {
    const parts = path.split("?")[0].split("/");
    name = parts[parts.length - 1] || "download";
  }

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export { API_BASE };
