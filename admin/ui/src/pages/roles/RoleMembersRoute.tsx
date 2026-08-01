import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { call } from "../../api/client";
import type { Role, User } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { DataTable, type Column } from "../../components/Table";
import { StatusBadge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";

export function RoleMembersRoute() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const { roles } = useOutletContext<{ roles: Role[] }>();

  const role = roles.find((r) => r.id === roleId) ?? null;
  const close = () => navigate("/roles");

  const { data, loading, error, reload } = useAsync<User[]>(
    () => (role ? call<User[]>("list_users", { role: role.name }, { method: "GET" }) : Promise.resolve([])),
    [role?.name],
  );

  if (!role) {
    return (
      <Modal title="Role not found" onClose={close}>
        <p className="text-sm text-text-muted">This role could not be found — it may have been deleted.</p>
      </Modal>
    );
  }

  const columns: Column<User>[] = [
    { key: "email", header: "Email", render: (u) => u.email },
    { key: "username", header: "Username", render: (u) => u.username ?? <span className="text-text-faint">—</span> },
    { key: "full_name", header: "Full name", render: (u) => u.full_name ?? <span className="text-text-faint">—</span> },
    { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
  ];

  return (
    <Modal title={`Members of ${role.name}`} subtitle={`${(data ?? []).length} user(s) with this role`} size="lg" onClose={close}>
      {error && <ErrorBlock message={error} onRetry={reload} />}
      {!error && (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(u) => u.id}
          loading={loading}
          emptyLabel="No users have this role."
          onRowClick={(u) => navigate(`/users/${u.id}`)}
        />
      )}
    </Modal>
  );
}
