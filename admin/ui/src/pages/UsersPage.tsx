import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Select } from "../components/Field";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { IconPlus, IconRefresh, IconSearch } from "../layout/icons";
import { CreateUserModal } from "./users/CreateUserModal";
import { UserDetailModal } from "./users/UserDetailModal";
import { formatWhen, isLocked, statusTone } from "./users/userUtils";
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
      call<User[]>("list_users", { role: roleFilter || null, q: q || null }),
      call<Role[]>("list_roles"),
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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th>Roles</th>
                  <th style={{ width: 110 }}>Sessions</th>
                  <th style={{ width: 150 }}>Last login</th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="row-clickable" onClick={() => setSelected(u)}>
                    <td>{u.email}</td>
                    <td>
                      <Badge tone={statusTone(u)} dot>
                        {isLocked(u) ? "Locked out" : u.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="role-cell">
                        {(u.has_roles ?? []).length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          (u.has_roles ?? []).map((r) => (
                            <Badge key={r} tone={r === "Superuser" ? "danger" : "neutral"}>
                              {r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="muted">{u.max_sessions ?? "unlimited"}</td>
                    <td className="muted">{formatWhen(u.last_login_at)}</td>
                    <td>
                      <div className="table__actions">
                        <span className="row-open">Manage</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </>
  );
}
