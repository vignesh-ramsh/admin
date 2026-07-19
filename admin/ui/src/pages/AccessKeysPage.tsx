import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { call, ApiError } from "../api/client";
import type { AccessKey } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Select } from "../components/Field";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { DataTable } from "../components/agni/data/DataTable";
import { IconPlus, IconRefresh } from "../layout/icons";
import { useUserDirectory } from "./shared/useUserDirectory";
import { ClearScopeModal } from "./shared/ClearScopeModal";
import { PruneModal } from "./shared/PruneModal";
import { lifecycleOf, lifecycleTone, lifecycleLabel } from "./shared/lifecycle";
import { CreateAccessKeyModal } from "./access-keys/CreateAccessKeyModal";
import { formatWhen } from "./users/userUtils";
import "./shared/shared.css";
import "./access-keys.css";

export function AccessKeysPage() {
  const { onUnauthorized } = useAuth();
  const dir = useUserDirectory();
  const [params, setParams] = useSearchParams();
  const emailFilter = params.get("email") ?? "";

  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingPrefix, setRevokingPrefix] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [showPrune, setShowPrune] = useState(false);

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
    call<AccessKey[]>("list_access_keys", { email: emailFilter || null })
      .then(setKeys)
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load access keys");
      })
      .finally(() => setLoading(false));
  }, [emailFilter, handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (prefix: string) => {
    setRevokingPrefix(prefix);
    try {
      await call("revoke_access_key", { key_prefix: prefix });
      load();
    } catch (err) {
      if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to revoke");
    } finally {
      setRevokingPrefix(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Access Keys"
        subtitle="API keys issued to users — each carries a subset of its owner’s roles."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              <IconRefresh /> Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowPrune(true)}>
              Prune…
            </Button>
            <Button variant="danger" size="sm" onClick={() => setShowClear(true)}>
              Clear…
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <IconPlus /> New key
            </Button>
          </>
        }
      />

      <div className="keys-toolbar">
        <label className="keys-toolbar__label">Filter by user</label>
        <Select
          value={emailFilter}
          onChange={(e) => setParams(e.target.value ? { email: e.target.value } : {}, { replace: true })}
          style={{ width: 260 }}
        >
          <option value="">All users</option>
          {dir.users.map((u) => (
            <option key={u.id} value={u.email}>
              {u.email}
            </option>
          ))}
        </Select>
      </div>

      <div className="card">
        {loading || dir.loading ? (
          <Loading message="Loading access keys…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : keys.length === 0 ? (
          <EmptyState
            title="No access keys"
            message={emailFilter ? "This user has no access keys." : "No access keys exist yet."}
          />
        ) : (
          <DataTable
            rowKey="id"
            rows={keys}
            columns={[
              { key: "user", label: "User", render: (v: string) => <span className="mono" style={{ fontSize: 12.5 }}>{dir.emailFor(v)}</span> },
              { key: "key_prefix", label: "Prefix", width: 110, render: (v: string) => <span className="mono">{v}</span> },
              { key: "label", label: "Label", render: (v: string) => v || <span className="muted">—</span> },
              {
                key: "scopes",
                label: "Scopes",
                sortable: false,
                render: (v: string[]) => (
                  <div className="role-cell">
                    {(v ?? []).length === 0 ? <span className="muted">—</span> : (v ?? []).map((s) => <Badge key={s}>{s}</Badge>)}
                  </div>
                ),
              },
              {
                key: "_status",
                label: "Status",
                width: 110,
                sortable: false,
                render: (_v: unknown, k: AccessKey) => {
                  const state = lifecycleOf(k);
                  return (
                    <Badge tone={lifecycleTone(state)} dot>
                      {lifecycleLabel(state)}
                    </Badge>
                  );
                },
              },
              { key: "last_used_at", label: "Last used", width: 150, render: (v: string) => <span className="muted">{formatWhen(v)}</span> },
              { key: "expires_at", label: "Expires", width: 150, render: (v: string | null) => <span className="muted">{v ? formatWhen(v) : "never"}</span> },
              {
                key: "_actions",
                label: "",
                width: 90,
                sortable: false,
                render: (_v: unknown, k: AccessKey) => {
                  const state = lifecycleOf(k);
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={state !== "active"}
                      loading={revokingPrefix === k.key_prefix}
                      onClick={() => revoke(k.key_prefix)}
                    >
                      Revoke
                    </Button>
                  );
                },
              },
            ]}
          />
        )}
      </div>

      {creating && (
        <CreateAccessKeyModal
          users={dir.users}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {showClear && (
        <ClearScopeModal
          resource="access keys"
          fn="clear_access_keys"
          users={dir.users}
          onClose={() => setShowClear(false)}
          onDone={() => {
            setShowClear(false);
            load();
          }}
        />
      )}
      {showPrune && (
        <PruneModal
          resource="access keys"
          fn="prune_access_keys"
          onClose={() => setShowPrune(false)}
          onDone={() => {
            setShowPrune(false);
            load();
          }}
        />
      )}

    </>
  );
}
