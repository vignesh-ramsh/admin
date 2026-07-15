import { useState } from "react";
import { call, ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field, Input } from "../../components/Field";
import { useToast } from "../../components/Toast";

/* Shared by Sessions and Access Keys: prune_sessions/prune_access_keys is a
   genuine hard DELETE (unlike everywhere else in this admin, where delete
   means soft-delete-to-_trash) — these are "system": true tables with no
   soft-delete at all. It only ever touches rows already revoked or expired
   and older than the cutoff; a still-active record is never eligible,
   which is why this doesn't need the same "type to confirm" friction a
   real destructive action on live data would. */

export function PruneModal({
  resource,
  fn,
  onClose,
  onDone,
}: {
  resource: string; // "sessions" | "access keys"
  fn: string; // "prune_sessions" | "prune_access_keys"
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a non-negative number of days.");
      return;
    }
    setBusy(true);
    try {
      const res = await call<{ deleted: number }>(fn, { older_than_days: n });
      toast.success(`Permanently deleted ${res.deleted} ${resource}.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to prune ${resource}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Prune ${resource}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={busy}>
            Permanently delete
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <div className="danger-note">
          This is a <strong>permanent, unrecoverable delete</strong> — unlike everywhere else in
          this admin, {resource} have no soft-delete / trash to recover from. Only rows already
          revoked or expired, and older than the cutoff, are ever eligible; a still-active record
          is never touched.
        </div>
        <Field label="Older than (days)" hint="Revoked or expired before this many days ago.">
          <Input
            type="number"
            min={0}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
