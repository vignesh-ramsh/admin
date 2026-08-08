import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { TextInput, Checkbox } from "../components/Field";
import { ApiError, type ActiveSessionSummary } from "../api/client";
import { ARC_LOGO_URL } from "../lib/assets";

/** Deliberately not a real user-agent parser (no dependency, no attempt at
 *  precision) — just enough to tell the caller's own devices apart in the
 *  picker below, the same bar a human glancing at "which one is my
 *  phone" needs. */
function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/ipad/i.test(ua)) return "iPad";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return "Android device";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/macintosh|mac os/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux PC";
  return "Unknown device";
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <img src={ARC_LOGO_URL} alt="" className="mb-3 h-11 w-11 rounded-xl shadow-sm" />
      <h1 className="text-lg font-semibold text-text">{title}</h1>
      <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg/60 px-3 py-2 text-[13px] text-danger">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      {message}
    </div>
  );
}

export function LoginPage() {
  const { login, terminateSession } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set only when login() comes back with code="max_sessions_reached" —
  // its details.sessions is what populates this (api/client.ts's
  // ApiError.details, sourced from authn's RelayError.extra). Non-null is
  // what switches the whole page over to the picker view below.
  const [sessionPicker, setSessionPicker] = useState<ActiveSessionSummary[] | null>(null);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);

  // Shared by the form's own submit AND the picker's "log this one out,
  // then retry" step — same identifier/password either way, just
  // sometimes called a second time right after a session was freed up.
  const attemptLogin = async () => {
    try {
      await login(identifier, password, remember ? "Extended" : "Fixed");
    } catch (err) {
      if (err instanceof ApiError && err.code === "max_sessions_reached" && err.details?.sessions) {
        setSessionPicker(err.details.sessions as ActiveSessionSummary[]);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await attemptLogin();
    } finally {
      setBusy(false);
    }
  };

  const pickSession = async (sessionId: string) => {
    setTerminatingId(sessionId);
    setError(null);
    try {
      await terminateSession(identifier, password, sessionId);
      setSessionPicker(null);
      setBusy(true);
      await attemptLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't end that session. Please try again.");
    } finally {
      setTerminatingId(null);
      setBusy(false);
    }
  };

  if (sessionPicker) {
    return (
      <AuthCard>
        <AuthHeader
          title="Too many active sessions"
          subtitle="Sign out of one of these to continue on this device."
        />
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            {sessionPicker.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSession(s.id)}
                disabled={terminatingId !== null}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-3 text-left transition-colors hover:border-danger/50 hover:bg-danger-bg/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{summarizeUserAgent(s.user_agent)}</p>
                  <p className="truncate text-xs text-text-faint">
                    {s.session_type} session{s.ip_address ? ` — ${s.ip_address}` : ""}
                    {s.expires_at ? ` — expires ${new Date(s.expires_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-danger">
                  {terminatingId === s.id ? "Ending…" : "Log out"}
                </span>
              </button>
            ))}
          </div>

          {error && <ErrorBanner message={error} />}

          <Button
            variant="secondary"
            className="w-full"
            disabled={terminatingId !== null}
            onClick={() => {
              setSessionPicker(null);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthHeader title="Admin Console" subtitle="Sign in to your workspace" />

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
        <TextInput
          label="Email or username"
          type="text"
          autoComplete="username"
          placeholder="you@example.com"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoFocus
        />
        <TextInput
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          endAdornment={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="flex cursor-pointer items-center px-2.5 text-text-faint transition-colors hover:text-text-muted"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} label="Keep me signed in" />

        {error && <ErrorBanner message={error} />}

        <Button type="submit" variant="primary" loading={busy} className="w-full">
          Sign in
        </Button>
        <Link to="/forgot-password" className="text-center text-[13px] text-text-muted hover:text-accent-700 dark:hover:text-accent-300">
          Forgot password?
        </Link>
      </form>
    </AuthCard>
  );
}
