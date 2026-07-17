import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Field, Input } from "../components/Field";
import { ApiError, requestPasswordReset } from "../api/client";
import { Logo } from "../components/Logo";
import "./login.css";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The server always returns the same generic message whether or not the
  // email has an account (docs/arc.MD's authn design — a distinct message
  // per case would itself be an account-enumeration oracle) — this page
  // just displays whatever that message says, it never infers anything.
  const [sent, setSent] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      setSent(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send reset link. Please try again.");
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
            <div className="login__title">Reset your password</div>
            <div className="login__subtitle">We'll email you a link to set a new one</div>
          </div>
        </div>

        {sent ? (
          <>
            <div className="login__success">{sent}</div>
            <Link className="login__link" to="/">
              Back to sign in
            </Link>
          </>
        ) : (
          <form className="login__form" onSubmit={submit}>
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Field>

            {error && <div className="login__error">{error}</div>}

            <Button type="submit" variant="primary" block loading={busy}>
              Send reset link
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
