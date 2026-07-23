import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { call, ApiError } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { DataTable } from "../components/agni/data/DataTable";
import { IconPlus, IconRefresh } from "../layout/icons";
import { CreateRoleModal } from "./roles/CreateRoleModal";
import { EditRoleModal } from "./roles/EditRoleModal";
import { DeleteRoleModal } from "./roles/DeleteRoleModal";
import "./shared/shared.css";
import "./roles.css";

export function RolesPage() {
  const { onUnauthorized } = useAuth();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
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
    Promise.all([
      call<Role[]>("list_roles", {}, { method: "GET" }),
      call<User[]>("list_users", {}, { method: "GET" }),
    ])
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
          <DataTable
            rowKey="name"
            rows={roles}
            columns={[
              {
                key: "name",
                label: "Name",
                width: 200,
                render: (v: string) => <Badge tone={v === "Superuser" ? "danger" : "accent"}>{v}</Badge>,
              },
              { key: "description", label: "Description", render: (v: string) => v || <span className="muted">—</span> },
              {
                key: "_holders",
                label: "Users",
                width: 150,
                sortable: false,
                render: (_v: unknown, r: Role) => {
                  const holders = holdersOf(r.name);
                  if (holders.length === 0) return <span className="muted">unused</span>;
                  // Was inert text (docs/admin-ui-ux-review.md #4.2) —
                  // now a real link into Users, pre-filtered to this role,
                  // so "who actually holds this" is one click, not a
                  // manual scan of every user's Roles column.
                  return (
                    <button
                      type="button"
                      className="role-users-link"
                      title={holders.map((u) => u.email).join(", ")}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/users?role=${encodeURIComponent(r.name)}`);
                      }}
                    >
                      {holders.length} user{holders.length === 1 ? "" : "s"}
                    </button>
                  );
                },
              },
              {
                key: "_actions",
                label: "",
                width: 140,
                sortable: false,
                render: (_v: unknown, r: Role) => (
                  <div className="inline" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(r)}>
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
          />
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

      {editing && (
        <EditRoleModal
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
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
