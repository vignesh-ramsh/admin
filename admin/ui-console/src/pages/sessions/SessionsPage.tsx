import { useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Trash2, LogOut } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Session, User } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { DataTable, type Column } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";
import { ConfirmModal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { formatDateTime } from "../shared/datetime";

export function SessionsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const { data: sessions, loading, error, reload } = useAsync<Session[]>(() => call<Session[]>("list_sessions", {}));
  const { data: users } = useAsync<User[]>(() => call<User[]>("list_users", {}, { method: "GET" }));
  const emailById = new Map((users ?? []).map((u) => [u.id, u.email]));

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doRevoke = async () => {
    if (!revokeId) return;
    setBusy(true);
    try {
      await call("revoke_session", { session_id: revokeId });
      toast.success("Session revoked.");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke session.");
    } finally {
      setBusy(false);
      setRevokeId(null);
    }
  };

  const columns: Column<Session>[] = [
    { key: "user", header: "User", render: (s) => emailById.get(s.user) ?? <span className="font-mono text-[12px]">{s.user}</span> },
    { key: "session_type", header: "Type", render: (s) => s.session_type },
    { key: "ip_address", header: "IP", mono: true, render: (s) => s.ip_address ?? "—" },
    { key: "expires_at", header: "Expires", render: (s) => formatDateTime(s.expires_at) },
    { key: "last_seen_at", header: "Last seen", render: (s) => formatDateTime(s.last_seen_at) },
    {
      key: "status",
      header: "Status",
      render: (s) => (s.revoked_at ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) =>
        !s.revoked_at && (
          <IconButton
            label="Revoke session"
            icon={<LogOut size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              setRevokeId(s.id);
            }}
          />
        ),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Sessions"
        description="Active and historical login sessions across all users."
        actions={
          <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={() => navigate("prune")}>
            Prune expired
          </Button>
        }
      />

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable columns={columns} rows={sessions ?? []} rowKey={(s) => s.id} loading={loading} emptyLabel="No sessions found." fillHeight />
        </div>
      )}

      {revokeId && (
        <ConfirmModal
          title="Revoke session"
          message="This session will no longer be usable. The user will need to sign in again on that device."
          confirmLabel="Revoke"
          danger
          loading={busy}
          onConfirm={doRevoke}
          onClose={() => setRevokeId(null)}
        />
      )}

      <Outlet context={{ reload }} />
    </div>
  );
}
