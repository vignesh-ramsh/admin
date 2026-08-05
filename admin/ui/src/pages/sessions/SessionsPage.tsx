import { useCallback, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Trash2, LogOut, Search } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Session } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { useCursorList, type CursorPage } from "../../hooks/useCursorList";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { DataTable, type Column } from "../../components/Table";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { Badge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";
import { ConfirmModal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { formatDateTime } from "../shared/datetime";

export function SessionsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const searchRef = usePageSearchFocus();

  const fetchPage = useCallback(
    (cursor: string | null, limit: number) => call<CursorPage<Session>>("list_sessions", { q: q || null, after: cursor, limit }),
    [q],
  );
  const { rows, loading, hasMore, loadingMore, total, error, reload, loadMore, patchByIds } = useCursorList<Session>({
    fetchPage,
    rowKey: (s) => s.id,
    deps: [q],
  });

  // id -> email, for every user in the system (not just the loaded page) —
  // list_users itself is now cursor-paginated, so a per-page fetch would
  // mislabel any session owner past the first page as a bare UUID.
  const { data: userEmails } = useAsync<{ id: string; email: string }[]>(
    () => call<{ id: string; email: string }[]>("list_user_emails", {}, { method: "GET" }),
  );
  const emailById = new Map((userEmails ?? []).map((u) => [u.id, u.email]));

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doRevoke = async () => {
    if (!revokeId) return;
    setBusy(true);
    try {
      await call("revoke_session", { session_id: revokeId });
      patchByIds([revokeId], { revoked_at: new Date().toISOString() });
      toast.success("Session revoked.");
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

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <TextInput
            ref={searchRef}
            placeholder="Search by user or IP…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="text-[13px] text-text-faint">{total !== null ? `${rows.length} of ${total}` : `${rows.length} sessions`}</span>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            loading={loading}
            emptyLabel="No sessions found."
            fillHeight
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
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
