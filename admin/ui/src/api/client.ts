/* ============================================================
   API client — talks to ARC Gateway.

   Every admin capability is a whitelisted function reached at
   POST /api/method/admin.<fn> with a JSON body (relay's RPC convention).
   All admin endpoints are POST so the browser can carry arguments in a
   body — relay's whitelisted GET path reads args from the JSON body too,
   but browser fetch() forbids a body on GET, so admin exposes everything
   as POST.

   The session token from /login is held in localStorage and sent as a
   Bearer header. A 401 anywhere clears it and bubbles up so the app can
   route back to the login screen.
   ============================================================ */

const TOKEN_KEY = "arc_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

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

/** Log in and persist the session token. */
export interface LoginResult {
  token: string;
  session_type: string;
  expires_at: string;
}

export async function login(
  email: string,
  password: string,
  sessionType: "Fixed" | "Extended" = "Fixed"
): Promise<LoginResult> {
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, session_type: sessionType }),
  });
  if (!res.ok) throw await parseError(res);
  const result: LoginResult = await res.json();
  setToken(result.token);
  return result;
}

export async function logout(): Promise<void> {
  const token = getToken();
  clearToken();
  if (!token) return;
  try {
    await fetch("/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* best-effort — the local token is already cleared */
  }
}

/** Call an admin whitelisted function: POST /api/method/admin.<fn>. */
export async function call<T = unknown>(
  fn: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/method/admin.${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });
  if (res.status === 401) {
    clearToken();
    throw await parseError(res);
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}
