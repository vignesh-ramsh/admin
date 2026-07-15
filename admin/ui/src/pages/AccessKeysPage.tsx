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
import { IconPlus, IconRefresh } from "../layout/icons";
import { useUserDirectory } from "./shared/useUserDirectory";
import { ClearScopeModal } from "./shared/ClearScopeModal";
import { PruneModal } from "./shared/PruneModal";
import { lifecycleOf, lifecycleTone, lifecycleLabel } from "./shared/lifecycle";
import { CreateAccessKeyModal } from "./access-keys/CreateAccessKeyModal";
import { AuditHistoryModal } from "./data/AuditHistoryModal";
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
  const [showAudit, setShowAudit] = useState(false);

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
            <Button variant="secondary" size="sm" onClick={() => setShowAudit(true)}>
              Audit history
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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th style={{ width: 110 }}>Prefix</th>
                  <th>Label</th>
                  <th>Scopes</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 150 }}>Last used</th>
                  <th style={{ width: 150 }}>Expires</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const state = lifecycleOf(k);
                  return (
                    <tr key={k.id}>
                      <td className="mono" style={{ fontSize: 12.5 }}>{dir.emailFor(k.user)}</td>
                      <td className="mono">{k.key_prefix}</td>
                      <td className={k.label ? "" : "muted"}>{k.label || "—"}</td>
                      <td>
                        <div className="role-cell">
                          {(k.scopes ?? []).length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            (k.scopes ?? []).map((s) => <Badge key={s}>{s}</Badge>)
                          )}
                        </div>
                      </td>
                      <td>
                        <Badge tone={lifecycleTone(state)} dot>
                          {lifecycleLabel(state)}
                        </Badge>
                      </td>
                      <td className="muted">{formatWhen(k.last_used_at)}</td>
                      <td className="muted">{k.expires_at ? formatWhen(k.expires_at) : "never"}</td>
                      <td>
                        <div className="table__actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={state !== "active"}
                            loading={revokingPrefix === k.key_prefix}
                            onClick={() => revoke(k.key_prefix)}
                          >
                            Revoke
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

      {showAudit && (
        <AuditHistoryModal plugin="authn" table="_access_keys" onClose={() => setShowAudit(false)} />
      )}
    </>
  );
}
