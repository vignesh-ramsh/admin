import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Field, Input } from "../components/Field";
import { ApiError } from "../api/client";
import { Logo } from "../components/Logo";
import "./login.css";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password, remember ? "Extended" : "Fixed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
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
            <div className="login__title">ARC Admin Desk</div>
            <div className="login__subtitle">Sign in to your workspace</div>
          </div>
        </div>

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
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <label className="login__remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in (extended session)
          </label>

          {error && <div className="login__error">{error}</div>}

          <Button type="submit" variant="primary" block loading={busy}>
            Sign in
          </Button>
          <Link className="login__link" to="/forgot-password">
            Forgot password?
          </Link>
        </form>
      </div>
      <div className="login__footnote">ARC — capability-based platform</div>
    </div>
  );
}
