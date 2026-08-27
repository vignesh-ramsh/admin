/* API client — talks to the same ARC Gateway backend as admin-desk.
 * Every admin capability is a whitelisted function reached at
 * /api/v1/admin.<fn> (relay's RPC convention); auth uses its own
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

/* Conditional-request cache — one ETag + the body it was issued for, per
 * (method, url, params) key. Entirely this client's own doing: the
 * server sets no cache policy via ETag (gateway/__init__.py's own
 * send_json_with_etag docstring is explicit about that), so nothing
 * happens here unless THIS code deliberately tracks a tag and resends
 * it. Layered on top of the existing `cache: "no-store"` below, not a
 * replacement for it — that still stops the BROWSER's own HTTP cache
 * from serving something stale; this is a separate, explicit
 * If-None-Match round-trip this module manages itself, purely to avoid
 * re-downloading a body that's still identical (server confirms via a
 * bodyless 304 — the request itself, and the handler's own work behind
 * it, still happen every time, same as if this cache didn't exist).
 *
 * Backed by sessionStorage, not just an in-memory Map — a PLAIN module-
 * level Map is wiped on every full page reload (a fresh page load re-
 * executes this whole module from scratch), which is exactly how a real
 * user actually exercises this: hit refresh, and every request looked
 * like the cache never existed at all — confirmed live, every request
 * came back 200 with no If-None-Match sent, right after a reload, even
 * though the SPA-internal-navigation case (no reload) already worked.
 * sessionStorage survives a reload but clears when the tab closes —
 * deliberately not localStorage (this app's own existing use of it, see
 * theme/ThemeContext.tsx, is for a real cross-session PREFERENCE; this is
 * a transient response cache that can carry admin data, which shouldn't
 * linger indefinitely on disk once the tab's gone). */
const ETAG_STORAGE_KEY = "arc_admin_etag_cache";

function loadEtagCache(): Map<string, { etag: string; body: unknown }> {
  try {
    const raw = sessionStorage.getItem(ETAG_STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    // Corrupted JSON, storage disabled, or anything else — degrade to
    // "no cache yet", never let a bad stored value break the app.
    return new Map();
  }
}

const etagCache = loadEtagCache();

function persistEtagCache(): void {
  try {
    sessionStorage.setItem(ETAG_STORAGE_KEY, JSON.stringify(Object.fromEntries(etagCache)));
  } catch {
    // Quota exceeded or storage disabled — the in-memory Map (this tab's
    // own lifetime) still works fine; only cross-reload persistence is
    // lost, never a hard failure.
  }
}

function etagCacheKey(method: string, base: string, paramsKey: string): string {
  return `${method}:${base}:${paramsKey}`;
}

/** Attaches If-None-Match when this key has a cached ETag; on a 304,
 *  returns the cached body without ever calling res.json() (a 304 has no
 *  body to parse). On a fresh 200, records the new ETag (or drops any
 *  stale entry if this response didn't carry one — e.g. the endpoint
 *  opted out of etag= server-side). `res` must not have had its body
 *  consumed yet. */
async function withEtagCache<T>(
  key: string,
  fetchFn: (ifNoneMatch: string | null) => Promise<Response>,
): Promise<T> {
  const cached = etagCache.get(key);
  const res = await fetchFn(cached?.etag ?? null);
  if (res.status === 304 && cached) {
    return cached.body as T;
  }
  if (!res.ok) throw await parseError(res);
  const body = await res.json();
  const etag = res.headers.get("etag");
  if (etag) {
    etagCache.set(key, { etag, body });
  } else {
    etagCache.delete(key);
  }
  persistEtagCache();
  return body;
}

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
  const base = `/api/v1/admin.${fn}`;

  if (method === "GET") {
    // cache: "no-store" — a whitelisted GET is a live, per-request read
    // (a connectivity check, current settings), not a static resource;
    // without this, fetch()'s default cache mode can silently serve a
    // stale response on reload instead of hitting the server again. The
    // server now also sends Cache-Control: no-store on every route
    // response (gateway/__init__.py's _dispatch), but that alone doesn't
    // retroactively invalidate whatever a browser already cached from
    // before that existed — this forces a real network request every
    // time regardless of what's sitting in the cache already.
    //
    // withEtagCache layers a SEPARATE, explicit If-None-Match round-trip
    // on top of that — this module's own decision, not the browser's;
    // the request above still always reaches the server, this only ever
    // saves re-downloading a body the server confirms is unchanged.
    const qs = buildQueryString(params);
    return withEtagCache<T>(etagCacheKey("GET", base, qs), (ifNoneMatch) =>
      fetch(base + qs, {
        credentials: "same-origin",
        cache: "no-store",
        headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
      }),
    );
  }

  if (method === "QUERY" && queryMethodSupported()) {
    try {
      const paramsKey = JSON.stringify(params);
      return await withEtagCache<T>(etagCacheKey("QUERY", base, paramsKey), (ifNoneMatch) =>
        fetch(base, {
          method: "QUERY",
          credentials: "same-origin",
          headers: { ...headers(), ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}) },
          body: JSON.stringify(params),
        }),
      );
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
