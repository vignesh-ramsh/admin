import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { IconPlus, IconRefresh } from "../layout/icons";
import { CreateRoleModal } from "./roles/CreateRoleModal";
import { DeleteRoleModal } from "./roles/DeleteRoleModal";
import "./roles.css";

export function RolesPage() {
  const { onUnauthorized } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

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
    // Users are fetched alongside roles purely to answer "who holds this
    // role" — JSONB array membership has no Query Engine filter operator
    // (docs/arc.MD §3.4), so counting client-side is the established
    // pattern (authn's own `list-users --role` does the same).
    Promise.all([call<Role[]>("list_roles"), call<User[]>("list_users")])
      .then(([r, u]) => {
        setRoles(r);
        setUsers(u);
      })
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load roles");
      })
      .finally(() => setLoading(false));
  }, [handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  const holdersOf = (name: string) => users.filter((u) => (u.has_roles ?? []).includes(name));

  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="Role names referenced by whitelisted endpoints’ roles=[…] declarations."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              <IconRefresh /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <IconPlus /> New role
            </Button>
          </>
        }
      />

      <div className="card">
        {loading ? (
          <Loading message="Loading roles…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : roles.length === 0 ? (
          <EmptyState title="No roles" message="Create a role to start granting access." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Name</th>
                  <th>Description</th>
                  <th style={{ width: 150 }}>Users</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const holders = holdersOf(r.name);
                  return (
                    <tr key={r.id ?? r.name}>
                      <td>
                        <Badge tone={r.name === "Superuser" ? "danger" : "accent"}>{r.name}</Badge>
                      </td>
                      <td className={r.description ? "" : "muted"}>{r.description || "—"}</td>
                      <td>
                        {holders.length === 0 ? (
                          <span className="muted">unused</span>
                        ) : (
                          <span className="holders" title={holders.map((u) => u.email).join(", ")}>
                            {holders.length} user{holders.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="table__actions">
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(r)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateRoleModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {deleting && (
        <DeleteRoleModal
          role={deleting}
          holders={holdersOf(deleting.name)}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      )}
    </>
  );
}
