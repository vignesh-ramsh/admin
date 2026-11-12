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

/* The cache is only a convenience, so it is kept small and short-lived: the newest MAX_ETAG_ENTRIES responses, at
 * most MAX_ETAG_BYTES of JSON between them (the oldest are dropped first), written to sessionStorage at most once
 * per PERSIST_DELAY_MS (it used to be rewritten, bodies and all, after EVERY response), and emptied on logout, on
 * login and on any 401/403, so one user's lists and settings are not left in the tab's storage for the next. */
const MAX_ETAG_ENTRIES = 50;
const MAX_ETAG_BYTES = 1_000_000;
const PERSIST_DELAY_MS = 500;

interface EtagEntry {
  etag: string;
  body: unknown;
  /** length of the JSON the body arrived as, to bound the cache by size */
  size: number;
}

function loadEtagCache(): Map<string, EtagEntry> {
  try {
    const raw = sessionStorage.getItem(ETAG_STORAGE_KEY);
    if (!raw) return new Map();
    const stored = JSON.parse(raw) as Record<string, { etag: string; body: unknown; size?: number }>;
    return new Map(
      Object.entries(stored).map(([key, v]) => [key, { etag: v.etag, body: v.body, size: v.size ?? JSON.stringify(v.body).length }]),
    );
  } catch {
    // Corrupted JSON, storage disabled, or anything else — degrade to
    // "no cache yet", never let a bad stored value break the app.
    return new Map();
  }
}

const etagCache = loadEtagCache();
let etagCacheBytes = [...etagCache.values()].reduce((sum, e) => sum + e.size, 0);
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Drops the oldest entries (a Map iterates in insertion order) until both bounds hold. */
function trimEtagCache(): void {
  for (const key of etagCache.keys()) {
    if (etagCache.size <= MAX_ETAG_ENTRIES && etagCacheBytes <= MAX_ETAG_BYTES) return;
    etagCacheBytes -= etagCache.get(key)?.size ?? 0;
    etagCache.delete(key);
  }
}
trimEtagCache();

function forgetEtag(key: string): void {
  const old = etagCache.get(key);
  if (old) {
    etagCacheBytes -= old.size;
    etagCache.delete(key);
  }
}

/** Records the entry as the NEWEST one, so the oldest are the first to go. */
function rememberEtag(key: string, entry: EtagEntry): void {
  forgetEtag(key);
  etagCache.set(key, entry);
  etagCacheBytes += entry.size;
  trimEtagCache();
}

function persistEtagCache(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    if (etagCache.size === 0) sessionStorage.removeItem(ETAG_STORAGE_KEY);
    else sessionStorage.setItem(ETAG_STORAGE_KEY, JSON.stringify(Object.fromEntries(etagCache)));
  } catch {
    // Quota exceeded or storage disabled — the in-memory Map (this tab's
    // own lifetime) still works fine; only cross-reload persistence is
    // lost, never a hard failure.
  }
}

/** At most one write per PERSIST_DELAY_MS, however many responses arrive in between. */
function schedulePersist(): void {
  if (persistTimer === null) persistTimer = setTimeout(persistEtagCache, PERSIST_DELAY_MS);
}

// A reload or a closed tab must not lose what a pending write was about to save.
if (typeof window !== "undefined") window.addEventListener("pagehide", persistEtagCache);

/** Forgets every cached response, in memory and in sessionStorage. Called on logout, on login and on any 401/403. */
export function clearEtagCache(): void {
  etagCache.clear();
  etagCacheBytes = 0;
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    sessionStorage.removeItem(ETAG_STORAGE_KEY);
  } catch {
    // storage disabled — nothing to remove
  }
}

/** The error to throw for a failed response; a 401/403 also empties the cache (the user is no longer who it was
 *  filled for, or no longer allowed to see it). */
async function failure(res: Response): Promise<Error> {
  if (res.status === 401 || res.status === 403) clearEtagCache();
  return parseError(res);
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
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  const body = JSON.parse(text);
  const etag = res.headers.get("etag");
  if (etag) {
    rememberEtag(key, { etag, body, size: text.length });
  } else {
    forgetEtag(key);
  }
  schedulePersist();
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
  if (!res.ok) throw await failure(res);
  return res.json();
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw await failure(res);
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

export async function login(params: {
  email?: string;
  username?: string;
  password: string;
  session_type: "Fixed" | "Extended";
}): Promise<Profile> {
  const profile = await authFetch<Profile>("/login", { method: "POST", body: JSON.stringify(params) });
  clearEtagCache(); // whatever an earlier user left in this tab is not for this one
  return profile;
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
  } finally {
    clearEtagCache();
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
