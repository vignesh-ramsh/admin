import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { Button } from "../components/Button";
import { TextInput } from "../components/Field";
import { requestPasswordReset, ApiError } from "../api/client";
import { ARC_LOGO_URL } from "../lib/assets";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={ARC_LOGO_URL} alt="" className="mb-3 h-11 w-11 rounded-xl shadow-sm" />
          <h1 className="text-lg font-semibold text-text">Reset your password</h1>
          <p className="mt-1 text-sm text-text-muted">We'll email you a link if the account exists.</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
          {sent ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <MailCheck size={26} className="text-success" />
              <p className="text-sm text-text">If an account exists for <strong>{email}</strong>, a reset link is on its way.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <TextInput
                label="Email"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <p className="text-[13px] text-danger">{error}</p>}
              <Button type="submit" variant="primary" loading={busy} className="w-full">
                Send reset link
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
