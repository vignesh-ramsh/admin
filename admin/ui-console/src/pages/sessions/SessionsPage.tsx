import { useMemo, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Trash2, LogOut, Search } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Session, User } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { TextInput } from "../../components/Field";
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

  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const searchRef = usePageSearchFocus();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = sessions ?? [];
    if (!needle) return all;
    return all.filter((s) => (emailById.get(s.user) ?? s.user).toLowerCase().includes(needle) || (s.ip_address ?? "").toLowerCase().includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, q, users]);

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

      <div className="relative mb-4 max-w-xs">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
        <TextInput
          ref={searchRef}
          placeholder="Search by user or IP…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="pl-8"
        />
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} loading={loading} emptyLabel="No sessions found." fillHeight />
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
