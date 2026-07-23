/* ============================================================
   API client — talks to ARC Gateway.

   Every admin capability is a whitelisted function reached at
   /api/method/admin.<fn> (relay's RPC convention). call()'s `method`
   option picks both the HTTP verb and the payload shape:
     - "GET"   — args go in the query string, no body. Only survives
                 flat/scalar args cleanly (no nested objects/arrays) and
                 has no request-size ceiling to speak of beyond URL
                 length, but needs zero feature detection — works
                 everywhere, always has.
     - "QUERY" — a safe, idempotent verb like GET, but (unlike GET) can
                 carry a real JSON body — the IETF draft method built
                 for exactly this "safe read with a real payload" case.
                 Falls back to POST automatically when the browser's
                 fetch()/XHR won't send it (feature-detected once, see
                 queryMethodSupported() below) — every endpoint this
                 might fall back to is also registered for POST, so the
                 fallback always lands on a real route.
     - "POST"  — the default, unchanged from before: always a JSON body,
                 always works, but relay's dry-run safety net (GET/QUERY
                 only) never applies to it even for a read-only function.
   Callers choose per call site based on what the endpoint actually does
   and what shape its args are — see admin/api/*.py's read endpoints,
   now registered for GET+QUERY+POST rather than POST-only.

   The session lives entirely in an httpOnly `arc_session` cookie set by
   the server — this client never sees or stores the raw token, so it
   can't be read by an XSS payload the way a localStorage token could.
   Every request goes with `credentials: "same-origin"` so the browser
   attaches that cookie automatically. Mutating requests also send the
   paired, JS-readable `csrf_token` cookie's value back as an
   `X-CSRF-Token` header (the double-submit-cookie pattern gateway's
   csrf_middleware checks) — the cookie alone can't authorize a request
   since a cross-site page can't read it, only replay it blindly.
   ============================================================ */

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

/** The profile the server returns on a successful /login or /whoami —
 *  never a raw token, which only ever travels via Set-Cookie. */
export interface Profile {
  email: string;
  username: string | null;
  full_name: string | null;
  theme: "light" | "dark";
}

export async function login(
  email: string,
  password: string,
  sessionType: "Fixed" | "Extended" = "Fixed"
): Promise<Profile> {
  const res = await fetch("/login", {
    method: "POST",
    credentials: "same-origin",
    headers: headers(),
    body: JSON.stringify({ email, password, session_type: sessionType }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** GET /whoami — resolves the current session (if any) into its profile.
 *  A 401 here just means "not logged in", not a real error. */
export async function whoami(): Promise<Profile | null> {
  const res = await fetch("/whoami", { method: "GET", credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function setMyTheme(theme: "light" | "dark"): Promise<void> {
  const res = await fetch("/me/theme", {
    method: "POST",
    credentials: "same-origin",
    headers: headers(),
    body: JSON.stringify({ theme }),
  });
  if (!res.ok) throw await parseError(res);
}

/** POST /forgot-password — same-origin custom path, not the /api/method/
 *  admin.* RPC convention, matching login()/logout() above (authn's own
 *  whitelisted functions use explicit path= overrides, not the auto-derived
 *  one). Always resolves with the same generic message on the server side
 *  regardless of whether the email has an account — this call surfaces
 *  that message as-is, it doesn't add its own interpretation. */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch("/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** POST /reset-password — consumes a token minted by requestPasswordReset's
 *  emailed link. */
export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean }> {
  const res = await fetch("/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function logout(): Promise<void> {
  try {
    await fetch("/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: headers(),
    });
  } catch {
    /* best-effort — the server clears the cookies on its response either
       way; a network failure here just leaves stale cookies for the
       browser to overwrite on the next login */
  }
}

export type CallMethod = "GET" | "QUERY" | "POST";

let _queryMethodSupported: boolean | null = null;

/** Cheap, synchronous, no-network feature check — the Request()
 *  constructor validates its `method` eagerly and throws for anything a
 *  browser's fetch()/XHR implementation won't send (same reason
 *  `fetch(url, {method:'GET', body})` throws synchronously rather than
 *  failing over the network) — so this never needs an actual round trip
 *  to find out, and can't change mid-session once computed. */
function queryMethodSupported(): boolean {
  if (_queryMethodSupported === null) {
    try {
      new Request(window.location.href, { method: "QUERY" });
      _queryMethodSupported = true;
    } catch {
      _queryMethodSupported = false;
    }
  }
  return _queryMethodSupported;
}

/** Flat scalars pass through as-is; anything else (object/array) is
 *  JSON-encoded into its query value — relay's own query-param reader
 *  only ever hands a function a string per key regardless (no built-in
 *  coercion), so this is purely about producing a value that fits in a
 *  URL at all, not about round-tripping real types.
 *
 *  null/undefined are OMITTED, not encoded — a lot of call sites pass
 *  `{ role: roleFilter || null }` for "this optional filter isn't set",
 *  meaning "let the function's own default apply" (usually None). Adding
 *  the param anyway would send the literal 4-character string "null",
 *  which relay's kwarg binding hands straight to the function as a real
 *  (non-null, truthy) string value instead of the None it's supposed
 *  to fall back to — silently breaking every "unset" filter that made
 *  it through a GET call. POST already avoided this because
 *  JSON.stringify(undefined-or-null-valued-object) keeps real `null` as
 *  JSON `null`, decoded back to Python None on the other side. */
function buildQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function performCall<T>(
  fn: string,
  params: Record<string, unknown>,
  method: "GET" | "QUERY" | "POST"
): Promise<T> {
  const path = `/api/method/admin.${fn}`;
  const init: RequestInit = { credentials: "same-origin", method };
  if (method !== "GET") {
    init.headers = headers();
    init.body = JSON.stringify(params);
  }
  const url = method === "GET" ? `${path}${buildQueryString(params)}` : path;

  const res = await fetch(url, init);
  if (res.status === 401) throw await parseError(res);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** Call a whitelisted function: /api/method/admin.<fn>. `method` (see the
 *  module docstring) defaults to "POST" so existing call sites keep
 *  working unchanged; pass "GET" or "QUERY" explicitly for a read.
 *
 *  QUERY passing queryMethodSupported()'s synchronous check only proves
 *  THIS browser is willing to construct and send the request — it says
 *  nothing about whatever sits between here and the real server. Verified
 *  concretely: the local Vite dev proxy runs on Node.js, and Node's own
 *  HTTP parser doesn't recognize QUERY at all (not in `http.METHODS` as
 *  of Node 18) — it 400s the request with an empty, unparseable body
 *  before any application code, including this admin backend, ever sees
 *  it. The real production path (Granian serving everything directly,
 *  confirmed separately) has no such gap, but this client can't tell
 *  which environment it's running against ahead of time. So: try QUERY,
 *  and on ANY failure, retry once via POST — the identical handler, the
 *  identical params, hit through a transport that's never in question.
 *  A genuine application-level error (bad args, wrong role, ...) comes
 *  back through the POST retry with the same real, readable message; a
 *  transport-level rejection just quietly stops mattering. */
export async function call<T = unknown>(
  fn: string,
  params: Record<string, unknown> = {},
  options: { method?: CallMethod } = {}
): Promise<T> {
  let method = options.method ?? "POST";
  if (method === "QUERY" && !queryMethodSupported()) method = "POST";

  if (method !== "QUERY") {
    return performCall<T>(fn, params, method);
  }
  try {
    return await performCall<T>(fn, params, "QUERY");
  } catch {
    return performCall<T>(fn, params, "POST");
  }
}
