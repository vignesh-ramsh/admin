import { useCallback, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Plus, Search, FlaskConical } from "lucide-react";
import { call } from "../../api/client";
import type { User } from "../../api/types";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { useCursorList, type CursorPage } from "../../hooks/useCursorList";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { DataTable, type Column } from "../../components/Table";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { Badge, StatusBadge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";
import { formatDateTime, isTestAccount } from "../shared/datetime";

export function UsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const searchRef = usePageSearchFocus();

  const fetchPage = useCallback(
    (cursor: string | null, limit: number) =>
      call<CursorPage<User>>("list_users", { q: debouncedSearch || null, after: cursor, limit }, { method: "GET" }),
    [debouncedSearch],
  );
  const { rows, loading, hasMore, loadingMore, total, error, reload, loadMore } = useCursorList<User>({
    fetchPage,
    rowKey: (u) => u.id,
    deps: [debouncedSearch],
  });

  const columns: Column<User>[] = [
    {
      key: "email",
      header: "Email",
      render: (u) => (
        <div className="flex items-center gap-2">
          <span>{u.email}</span>
          {isTestAccount(u.email, u.username) && (
            <Badge tone="neutral" dot>
              <FlaskConical size={10} />
              Test account
            </Badge>
          )}
        </div>
      ),
    },
    { key: "username", header: "Username", render: (u) => u.username ?? <span className="text-text-faint">—</span> },
    { key: "full_name", header: "Full name", render: (u) => u.full_name ?? <span className="text-text-faint">—</span> },
    { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
    {
      key: "roles",
      header: "Roles",
      render: (u) =>
        u.has_roles && u.has_roles.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {u.has_roles.map((r) => (
              <Badge key={r} tone="accent">
                {r}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-text-faint">—</span>
        ),
    },
    { key: "last_login_at", header: "Last login", render: (u) => formatDateTime(u.last_login_at) },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Users"
        description="Manage accounts, roles, and access."
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate("new")}>
            New user
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <TextInput
            ref={searchRef}
            placeholder="Search by email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="text-[13px] text-text-faint">{total !== null ? `${rows.length} of ${total}` : `${rows.length} users`}</span>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(u) => u.id}
            loading={loading}
            emptyLabel="No users found."
            onRowClick={(u) => navigate(u.id)}
            fillHeight
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
        </div>
      )}

      <Outlet context={{ reload }} />
    </div>
  );
}
