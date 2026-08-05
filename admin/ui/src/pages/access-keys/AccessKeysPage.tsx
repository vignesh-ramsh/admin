import { useCallback, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Plus, Trash2, Ban, Search } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { AccessKey } from "../../api/types";
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

export function AccessKeysPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const searchRef = usePageSearchFocus();

  const fetchPage = useCallback(
    (cursor: string | null, limit: number) => call<CursorPage<AccessKey>>("list_access_keys", { q: q || null, after: cursor, limit }, { method: "GET" }),
    [q],
  );
  const { rows: keys, loading, hasMore, loadingMore, total, error, reload, loadMore, patchByIds } = useCursorList<AccessKey>({
    fetchPage,
    rowKey: (k) => k.id,
    deps: [q],
  });

  // id -> email, for every user in the system — same reasoning
  // SessionsPage's own lookup gives (list_users itself is paginated now).
  const { data: userEmails } = useAsync<{ id: string; email: string }[]>(
    () => call<{ id: string; email: string }[]>("list_user_emails", {}, { method: "GET" }),
  );
  const emailById = new Map((userEmails ?? []).map((u) => [u.id, u.email]));

  const [revokePrefix, setRevokePrefix] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doRevoke = async () => {
    if (!revokePrefix) return;
    setBusy(true);
    try {
      await call("revoke_access_key", { key_prefix: revokePrefix });
      const target = keys.find((k) => k.key_prefix === revokePrefix);
      if (target) patchByIds([target.id], { revoked_at: new Date().toISOString() });
      toast.success("Access key revoked.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke access key.");
    } finally {
      setBusy(false);
      setRevokePrefix(null);
    }
  };

  const columns: Column<AccessKey>[] = [
    { key: "label", header: "Label", render: (k) => k.label || <span className="text-text-faint">—</span> },
    { key: "key_prefix", header: "Key prefix", mono: true, render: (k) => k.key_prefix },
    { key: "user", header: "User", render: (k) => emailById.get(k.user) ?? <span className="font-mono text-[12px]">{k.user}</span> },
    {
      key: "scopes",
      header: "Scopes",
      render: (k) =>
        k.scopes && k.scopes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {k.scopes.map((s) => (
              <Badge key={s} tone="accent">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-text-faint">—</span>
        ),
    },
    { key: "expires_at", header: "Expires", render: (k) => formatDateTime(k.expires_at) },
    { key: "last_used_at", header: "Last used", render: (k) => formatDateTime(k.last_used_at) },
    {
      key: "status",
      header: "Status",
      render: (k) => (k.revoked_at ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (k) =>
        !k.revoked_at && (
          <IconButton
            label="Revoke access key"
            icon={<Ban size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              setRevokePrefix(k.key_prefix);
            }}
          />
        ),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Access Keys"
        description="Programmatic API keys scoped to a subset of their owner's roles."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={() => navigate("prune")}>
              Prune
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate("new")}>
              New key
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <TextInput
            ref={searchRef}
            placeholder="Search by label, prefix, or user…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="text-[13px] text-text-faint">{total !== null ? `${keys.length} of ${total}` : `${keys.length} keys`}</span>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={columns}
            rows={keys}
            rowKey={(k) => k.id}
            loading={loading}
            emptyLabel="No access keys found."
            fillHeight
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
        </div>
      )}

      {revokePrefix && (
        <ConfirmModal
          title="Revoke access key"
          message="This key will stop working immediately. This cannot be undone."
          confirmLabel="Revoke"
          danger
          loading={busy}
          onConfirm={doRevoke}
          onClose={() => setRevokePrefix(null)}
        />
      )}

      <Outlet context={{ reload }} />
    </div>
  );
}
