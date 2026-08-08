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
  /** Whatever else rode along on this error body beyond {error, code} —
   *  relay's RelayError.extra (arc/plugins/relay/relay/__init__.py), e.g.
   *  login's max_sessions_reached handing back the caller's own active
   *  sessions. Absent for every ordinary error; callers that don't know
   *  to look for a specific key just never see this at all. */
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  let details: Record<string, unknown> | undefined;
  try {
    const body = await res.json();
    message = body.error || body.detail || message;
    code = body.code;
    const { error: _error, code: _code, detail: _detail, ...rest } = body;
    if (Object.keys(rest).length > 0) details = rest;
  } catch {
    /* non-JSON body — keep the generic message */
  }
  return new ApiError(message, res.status, code, details);
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
  // Open-ended theme PRESET name (e.g. "Late Night") — not a fixed
  // "light"|"dark" enum. theme/presets.ts owns the actual known set.
  theme: string | null;
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

/** authn's own active-session summary (auth_api.py's
 *  _active_sessions_summary) — rides along on a max_sessions_reached
 *  ApiError.details.sessions, never fetched as its own separate call. No
 *  token_hash — nothing here is a credential, just enough to tell one
 *  session from another. */
export interface ActiveSessionSummary {
  id: string;
  session_type: "Fixed" | "Extended";
  ip_address: string | null;
  user_agent: string | null;
  expires_at: string | null;
}

export function login(params: {
  email?: string;
  username?: string;
  password: string;
  session_type: "Fixed" | "Extended";
}): Promise<Profile> {
  return authFetch<Profile>("/login", { method: "POST", body: JSON.stringify(params) });
}

/** The "you're already signed in elsewhere" flow's second step — re-sends
 *  the SAME credentials (there's no session yet to authenticate this call
 *  any other way) alongside which of the caller's own sessions (from a
 *  max_sessions_reached error's details.sessions) to end. Callers should
 *  retry login() right after this resolves. */
export function terminateLoginSession(params: {
  email?: string;
  username?: string;
  password: string;
  session_id: string;
}): Promise<{ ok: true }> {
  return authFetch("/login/terminate-session", { method: "POST", body: JSON.stringify(params) });
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

export function setMyTheme(theme: string): Promise<{ ok: true; theme: string }> {
  return authFetch("/me/theme", { method: "POST", body: JSON.stringify({ theme }) });
}

export function requestPasswordReset(email: string): Promise<{ ok: true; message: string }> {
  return authFetch("/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, new_password: string): Promise<{ ok: true }> {
  return authFetch("/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) });
}
