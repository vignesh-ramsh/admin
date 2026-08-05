import { useCallback, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Plus, Pencil, Trash2, Users as UsersIcon, Search } from "lucide-react";
import { call } from "../../api/client";
import type { Role } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { useCursorList, type CursorPage } from "../../hooks/useCursorList";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { DataTable, type Column } from "../../components/Table";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { ErrorBlock } from "../../components/States";

export function RolesPage() {
  const navigate = useNavigate();
  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const searchRef = usePageSearchFocus();

  // Roles are a small-cardinality, named-permission-group list by nature
  // (unlike Users/Sessions) — a generous per-page limit means the same
  // accumulated `rows` this page renders is also "everything" for the
  // by-id lookups RoleMembersRoute/EditRoleRoute/DeleteRoleRoute need via
  // outlet context, with no separate unbounded fetch.
  const fetchPage = useCallback(
    (cursor: string | null, limit: number) => call<CursorPage<Role>>("list_roles", { q: q || null, after: cursor, limit }, { method: "GET" }),
    [q],
  );
  const { rows: roles, loading, hasMore, loadingMore, total, error, reload, loadMore } = useCursorList<Role>({
    fetchPage,
    limit: 200,
    rowKey: (r) => r.id,
    deps: [q],
  });

  const { data: memberCounts } = useAsync<Record<string, number>>(
    () => call<Record<string, number>>("count_users_by_role", {}, { method: "GET" }),
  );

  const columns: Column<Role>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "description", header: "Description", render: (r) => r.description || <span className="text-text-faint">—</span> },
    {
      key: "members",
      header: "Members",
      render: (r) => {
        const count = memberCounts?.[r.name] ?? 0;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`${r.id}/members`);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 text-accent-600 hover:underline dark:text-accent-400"
          >
            <UsersIcon size={13} />
            {count} {count === 1 ? "user" : "users"}
          </button>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            label="Edit role"
            icon={<Pencil size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`${r.id}/edit`);
            }}
          />
          <IconButton
            label="Delete role"
            icon={<Trash2 size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`${r.id}/delete`);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Roles"
        description="Define named permission groups referenced by users and access keys."
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate("new")}>
            New role
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <TextInput
            ref={searchRef}
            placeholder="Search by name or description…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="text-[13px] text-text-faint">{total !== null ? `${roles.length} of ${total}` : `${roles.length} roles`}</span>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={columns}
            rows={roles}
            rowKey={(r) => r.id}
            loading={loading}
            emptyLabel="No roles found."
            fillHeight
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
        </div>
      )}

      <Outlet context={{ reload, roles }} />
    </div>
  );
}
