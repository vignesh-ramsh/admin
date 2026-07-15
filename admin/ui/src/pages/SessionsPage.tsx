import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { call, ApiError } from "../api/client";
import type { Session } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Select } from "../components/Field";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { IconRefresh } from "../layout/icons";
import { useUserDirectory } from "./shared/useUserDirectory";
import { ClearScopeModal } from "./shared/ClearScopeModal";
import { PruneModal } from "./shared/PruneModal";
import { lifecycleOf, lifecycleTone, lifecycleLabel } from "./shared/lifecycle";
import { formatWhen } from "./users/userUtils";
import "./shared/shared.css";
import "./sessions.css";

export function SessionsPage() {
  const { onUnauthorized } = useAuth();
  const dir = useUserDirectory();
  const [params, setParams] = useSearchParams();
  const emailFilter = params.get("email") ?? "";

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
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
    call<Session[]>("list_sessions", { email: emailFilter || null })
      .then(setSessions)
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load sessions");
      })
      .finally(() => setLoading(false));
  }, [emailFilter, handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string) => {
    setRevokingId(id);
    try {
      await call("revoke_session", { session_id: id });
      load();
    } catch (err) {
      if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Sessions"
        subtitle="Active and past login sessions across every user."
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
          </>
        }
      />

      <div className="sessions-toolbar">
        <label className="sessions-toolbar__label">Filter by user</label>
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
          <Loading message="Loading sessions…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No sessions"
            message={emailFilter ? "This user has no sessions." : "No sessions exist yet."}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th>IP address</th>
                  <th style={{ width: 150 }}>Last seen</th>
                  <th style={{ width: 150 }}>Expires</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const state = lifecycleOf(s);
                  return (
                    <tr key={s.id}>
                      <td className="mono" style={{ fontSize: 12.5 }}>{dir.emailFor(s.user)}</td>
                      <td>{s.session_type}</td>
                      <td>
                        <Badge tone={lifecycleTone(state)} dot>
                          {lifecycleLabel(state)}
                        </Badge>
                      </td>
                      <td className="muted">{s.ip_address ?? "—"}</td>
                      <td className="muted">{formatWhen(s.last_seen_at)}</td>
                      <td className="muted">{formatWhen(s.expires_at)}</td>
                      <td>
                        <div className="table__actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={state !== "active"}
                            loading={revokingId === s.id}
                            onClick={() => revoke(s.id)}
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

      {showClear && (
        <ClearScopeModal
          resource="sessions"
          fn="clear_sessions"
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
          resource="sessions"
          fn="prune_sessions"
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
