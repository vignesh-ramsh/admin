import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../components/Button";
import { TextInput } from "../components/Field";
import { resetPassword, ApiError } from "../api/client";
import { ARC_LOGO_URL } from "../lib/assets";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "This reset link is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={ARC_LOGO_URL} alt="" className="mb-3 h-11 w-11 rounded-xl shadow-sm" />
          <h1 className="text-lg font-semibold text-text">Set a new password</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 size={26} className="text-success" />
              <p className="text-sm text-text">Your password has been reset. All existing sessions were signed out.</p>
              <Button variant="primary" onClick={() => navigate("/login")} className="mt-1 w-full">
                Continue to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <TextInput
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <TextInput
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {error && <p className="text-[13px] text-danger">{error}</p>}
              <Button type="submit" variant="primary" loading={busy} className="w-full">
                Reset password
              </Button>
            </form>
          )}
          <Link to="/login" className="mt-4 block text-center text-[13px] text-text-muted hover:text-accent-700 dark:hover:text-accent-300">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
