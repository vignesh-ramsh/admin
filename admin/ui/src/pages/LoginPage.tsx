import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { TextInput, Checkbox } from "../components/Field";
import { ApiError } from "../api/client";
import { ARC_LOGO_URL } from "../lib/assets";

export function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(identifier, password, remember ? "Extended" : "Fixed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={ARC_LOGO_URL} alt="" className="mb-3 h-11 w-11 rounded-xl shadow-sm" />
          <h1 className="text-lg font-semibold text-text">Admin Console</h1>
          <p className="mt-1 text-sm text-text-muted">Sign in to your workspace</p>
        </div>

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
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} label="Keep me signed in" />

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg/60 px-3 py-2 text-[13px] text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" loading={busy} className="w-full">
            Sign in
          </Button>
          <Link to="/forgot-password" className="text-center text-[13px] text-text-muted hover:text-accent-700 dark:hover:text-accent-300">
            Forgot password?
          </Link>
        </form>
      </div>
    </div>
  );
}
