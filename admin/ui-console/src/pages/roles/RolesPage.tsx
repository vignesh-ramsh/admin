import { useMemo, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Plus, Pencil, Trash2, Users as UsersIcon, Search } from "lucide-react";
import { call } from "../../api/client";
import type { Role, User } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { DataTable, type Column } from "../../components/Table";
import { ErrorBlock } from "../../components/States";

interface RoleRow extends Role {
  memberCount: number;
}

export function RolesPage() {
  const navigate = useNavigate();

  const { data: roles, loading: rolesLoading, error, reload } = useAsync<Role[]>(
    () => call<Role[]>("list_roles", {}, { method: "GET" }),
  );
  const { data: users } = useAsync<User[]>(() => call<User[]>("list_users", {}, { method: "GET" }));
  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const searchRef = usePageSearchFocus();

  const allRows: RoleRow[] = useMemo(
    () => (roles ?? []).map((r) => ({ ...r, memberCount: (users ?? []).filter((u) => (u.has_roles ?? []).includes(r.name)).length })),
    [roles, users],
  );
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((r) => r.name.toLowerCase().includes(needle) || (r.description ?? "").toLowerCase().includes(needle));
  }, [allRows, q]);

  const columns: Column<RoleRow>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "description", header: "Description", render: (r) => r.description || <span className="text-text-faint">—</span> },
    {
      key: "members",
      header: "Members",
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`${r.id}/members`);
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 text-accent-600 hover:underline dark:text-accent-400"
        >
          <UsersIcon size={13} />
          {r.memberCount} {r.memberCount === 1 ? "user" : "users"}
        </button>
      ),
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

      <div className="relative mb-4 max-w-xs">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
        <TextInput
          ref={searchRef}
          placeholder="Search by name or description…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="pl-8"
        />
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={rolesLoading} emptyLabel="No roles found." fillHeight />
        </div>
      )}

      <Outlet context={{ reload, roles: roles ?? [], users: users ?? [] }} />
    </div>
  );
}
