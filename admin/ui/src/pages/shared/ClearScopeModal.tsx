import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { User } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Banner } from "../../components/agni/feedback/Banner";
import { Select } from "../../components/Field";
import { RadioGroup } from "../../components/agni/forms/Radio";
import { useToast } from "../../components/Toast";

/* Shared by Sessions and Access Keys: both clear_sessions/clear_access_keys
   hard-require an explicit scope (an email or all_users=true) — "never
   runs unscoped", the same rule `arc psqldb clear` enforces — so the modal
   makes that choice explicit rather than defaulting to "everyone". */

export function ClearScopeModal({
  resource,
  fn,
  users,
  onClose,
  onDone,
}: {
  resource: string; // "sessions" | "access keys" — for copy only
  fn: string; // "clear_sessions" | "clear_access_keys"
  users: User[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"user" | "all">("user");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (mode === "user" && !email) {
      toast.error("Pick a user, or choose “every user”.");
      return;
    }
    setBusy(true);
    try {
      const res = await call<{ revoked: number }>(
        fn,
        mode === "all" ? { all_users: true } : { email }
      );
      toast.success(`Revoked ${res.revoked} active ${resource}.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to clear ${resource}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Clear ${resource}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={busy}>
            Revoke
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <p style={{ margin: 0, fontSize: 13.5 }}>
          Revokes every currently-active {resource}. This does not delete anything — a revoked
          record can still be pruned later, but never used again.
        </p>

        <RadioGroup
          value={mode}
          onChange={(v) => setMode(v as "user" | "all")}
          direction="row"
          options={[
            { value: "user", label: "One user" },
            { value: "all", label: "Every user" },
          ]}
        />

        {mode === "user" ? (
          <Select value={email} onChange={(e) => setEmail(e.target.value)}>
            <option value="">Pick a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {u.email}
              </option>
            ))}
          </Select>
        ) : (
          <Banner tone="error">
            This revokes {resource} for <strong>every user in the system</strong>, including your
            own. Anyone currently signed in will need to log in again.
          </Banner>
        )}
      </div>
    </Modal>
  );
}
