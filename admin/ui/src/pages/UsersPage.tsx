import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Select } from "../components/Field";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { DataTable } from "../components/agni/data/DataTable";
import { IconPlus, IconRefresh, IconSearch } from "../layout/icons";
import { CreateUserModal } from "./users/CreateUserModal";
import { UserDetailModal } from "./users/UserDetailModal";
import { formatWhen, isLocked, statusTone } from "./users/userUtils";
import "./shared/shared.css";
import "./users.css";

export function UsersPage() {
  const { onUnauthorized } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);

  const handleErr = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      call<User[]>("list_users", { role: roleFilter || null, q: q || null }, { method: "GET" }),
      call<Role[]>("list_roles", {}, { method: "GET" }),
    ])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
        // Keep an open detail modal in sync with freshly loaded data.
        setSelected((cur) => (cur ? (u.find((x) => x.id === cur.id) ?? null) : null));
      })
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load users");
      })
      .finally(() => setLoading(false));
  }, [q, roleFilter, handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Accounts, roles, status, and password resets."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              <IconRefresh /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <IconPlus /> New user
            </Button>
          </>
        }
      />

      <div className="users-toolbar">
        <div className="search">
          <IconSearch />
          <input
            className="search__input"
            placeholder="Search by email prefix…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 190 }}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.id ?? r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="card">
        {loading ? (
          <Loading message="Loading users…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : users.length === 0 ? (
          <EmptyState
            title="No users"
            message={q || roleFilter ? "No users match this search." : "Create the first user to get started."}
          />
        ) : (
          <DataTable
            rowKey="id"
            rows={users}
            onRowClick={(u: User) => setSelected(u)}
            columns={[
              { key: "email", label: "Email" },
              {
                key: "full_name",
                label: "Name / username",
                width: 160,
                render: (_v: unknown, u: User) => (
                  <>
                    {u.full_name && <div>{u.full_name}</div>}
                    {u.username ? (
                      <div className="mono muted" style={{ fontSize: 12 }}>@{u.username}</div>
                    ) : (
                      !u.full_name && <span className="muted">—</span>
                    )}
                  </>
                ),
              },
              {
                key: "status",
                label: "Status",
                width: 130,
                render: (_v: unknown, u: User) => (
                  <Badge tone={statusTone(u)} dot>
                    {isLocked(u) ? "Locked out" : u.status}
                  </Badge>
                ),
              },
              {
                key: "has_roles",
                label: "Roles",
                sortable: false,
                render: (v: string[]) => (
                  <div className="role-cell">
                    {(v ?? []).length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      (v ?? []).map((r) => (
                        <Badge key={r} tone={r === "Superuser" ? "danger" : "neutral"}>
                          {r}
                        </Badge>
                      ))
                    )}
                  </div>
                ),
              },
              { key: "max_sessions", label: "Sessions", width: 110, render: (v: number | null) => <span className="muted">{v ?? "unlimited"}</span> },
              { key: "last_login_at", label: "Last login", width: 150, render: (v: string) => <span className="muted">{formatWhen(v)}</span> },
              { key: "_actions", label: "", width: 70, sortable: false, render: () => <span className="row-open">Manage</span> },
            ]}
          />
        )}
      </div>

      {creating && (
        <CreateUserModal
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {selected && (
        <UserDetailModal
          user={selected}
          roles={roles}
          users={users}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}

    </>
  );
}
