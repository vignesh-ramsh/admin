/* API client — talks to the same ARC Gateway backend as admin-desk.
 * Every admin capability is a whitelisted function reached at
 * /api/method/admin.<fn> (relay's RPC convention); auth uses its own
 * hand-rolled paths (/login, /whoami, ...) served by the authn plugin.
 * Session lives in an httpOnly `arc_session` cookie; mutating requests
 * echo the JS-readable `csrf_token` cookie back as X-CSRF-Token
 * (double-submit CSRF pattern). */

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  try {
    const body = await res.json();
    message = body.error || body.detail || message;
    code = body.code;
  } catch {
    /* non-JSON body — keep the generic message */
  }
  return new ApiError(message, res.status, code);
}

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function headers(): Record<string, string> {
  const token = csrfToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { "X-CSRF-Token": token } : {}),
  };
}

export interface Profile {
  email: string;
  username: string | null;
  full_name: string | null;
  theme: "light" | "dark" | null;
}

export type CallMethod = "GET" | "QUERY" | "POST";

let queryMethodSupportedCache: boolean | null = null;
function queryMethodSupported(): boolean {
  if (queryMethodSupportedCache !== null) return queryMethodSupportedCache;
  try {
    new Request("https://example.com", { method: "QUERY" as string });
    queryMethodSupportedCache = true;
  } catch {
    queryMethodSupportedCache = false;
  }
  return queryMethodSupportedCache;
}

function buildQueryString(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    sp.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export async function call<T = unknown>(
  fn: string,
  params: Record<string, unknown> = {},
  options: { method?: CallMethod } = {},
): Promise<T> {
  const method = options.method ?? "POST";
  const base = `/api/method/admin.${fn}`;

  if (method === "GET") {
    const res = await fetch(base + buildQueryString(params), { credentials: "same-origin" });
    if (!res.ok) throw await parseError(res);
    return res.json();
  }

  if (method === "QUERY" && queryMethodSupported()) {
    try {
      const res = await fetch(base, {
        method: "QUERY",
        credentials: "same-origin",
        headers: headers(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw await parseError(res);
      return res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // fall through to POST — every QUERY endpoint is also POST-registered
    }
  }

  const res = await fetch(base, {
    method: "POST",
    credentials: "same-origin",
    headers: headers(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export function login(params: {
  email?: string;
  username?: string;
  password: string;
  session_type: "Fixed" | "Extended";
}): Promise<Profile> {
  return authFetch<Profile>("/login", { method: "POST", body: JSON.stringify(params) });
}

export async function whoami(): Promise<Profile | null> {
  try {
    return await authFetch<Profile>("/whoami");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function logout(): Promise<void> {
  try {
    await authFetch("/logout", { method: "POST" });
  } catch {
    /* best-effort */
  }
}

export function setMyTheme(theme: "light" | "dark"): Promise<{ ok: true; theme: string }> {
  return authFetch("/me/theme", { method: "POST", body: JSON.stringify({ theme }) });
}

export function requestPasswordReset(email: string): Promise<{ ok: true; message: string }> {
  return authFetch("/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, new_password: string): Promise<{ ok: true }> {
  return authFetch("/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) });
}
