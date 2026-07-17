import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Field, Input } from "../components/Field";
import { ApiError, resetPassword } from "../api/client";
import { Logo } from "../components/Logo";
import "./login.css";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token!, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <Logo size={34} />
          <div>
            <div className="login__title">Set a new password</div>
            <div className="login__subtitle">
              {token ? "Choose a new password for your account" : "This reset link is missing its token"}
            </div>
          </div>
        </div>

        {!token ? (
          <>
            <div className="login__error">
              This link is missing its reset token — copy the full link from your email, or request a new one.
            </div>
            <Link className="login__link" to="/forgot-password">
              Request a new link
            </Link>
          </>
        ) : done ? (
          <>
            <div className="login__success">
              Your password has been updated. Every existing session was signed out — sign in again with your new
              password.
            </div>
            <Link className="login__link" to="/">
              Back to sign in
            </Link>
          </>
        ) : (
          <form className="login__form" onSubmit={submit}>
            <Field label="New password">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>

            {error && <div className="login__error">{error}</div>}

            <Button type="submit" variant="primary" block loading={busy}>
              Reset password
            </Button>
            <Link className="login__link" to="/">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
      <div className="login__footnote">ARC — capability-based platform</div>
    </div>
  );
}
