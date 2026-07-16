import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../api/client";
import type { SettingEntry } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { IconPlus, IconRefresh, IconEye, IconEyeOff, IconSearch } from "../layout/icons";
import { SetSettingModal } from "./settings/SetSettingModal";
import "./shared/shared.css";

export function SettingsPage() {
  const { onUnauthorized } = useAuth();
  const [rows, setRows] = useState<SettingEntry[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SettingEntry | null | undefined>(undefined); // undefined = closed
  // Revealed secret values live only here, client-side — never merged back
  // into `rows`, so a refresh (or leaving the page) forgets them; hiding
  // one again is a pure local toggle, no server call needed for that half.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    call<SettingEntry[]>("list_settings")
      .then(setRows)
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, [handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleReveal = async (key: string) => {
    if (revealed[key] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealing(key);
    try {
      const res = await call<{ key: string; value: string }>("reveal_secret", { key });
      setRevealed((prev) => ({ ...prev, [key]: res.value }));
    } catch (err) {
      if (!handleErr(err)) {
        // A transient failure here isn't worth a toast import just for this —
        // the row simply stays masked, same as before the click.
      }
    } finally {
      setRevealing(null);
    }
  };

  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
  };

  const filtered = rows.filter((r) => r.key.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Settings & Secrets"
        subtitle="Every key any plugin has declared via arc.settings — the one place that answers “what exists” across the whole system."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              <IconRefresh /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setEditing(null)}>
              <IconPlus /> Add setting
            </Button>
          </>
        }
      />

      <div className="list-toolbar">
        <div className="search">
          <IconSearch />
          <input
            className="search__input"
            placeholder="Search by key…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <Loading message="Loading settings…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing declared yet" message="No plugin has set a setting or secret." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" message={`Nothing matches “${q}”.`} />
        ) : (
          <div className="table-wrap">
            {/* table-layout: fixed (below) is what actually keeps this
                table's columns stable once a long secret is revealed —
                without it, the browser's auto layout re-measures every
                column's "natural" width from the widest cell in the whole
                table, so revealing one long DSN visibly reflows/"jumps"
                every other row too, not just the one being revealed. */}
            <table className="table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "26%" }} />
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 170 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Kind</th>
                  <th>Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isSecret = row.kind === "secret";
                  const shown = revealed[row.key];
                  const displayValue = isSecret ? shown : row.value ?? undefined;
                  return (
                    <tr key={row.key}>
                      <td className="mono truncate" title={row.key}>
                        {row.key}
                      </td>
                      <td>
                        <Badge tone={isSecret ? "danger" : "accent"}>{isSecret ? "Secret" : "Setting"}</Badge>
                      </td>
                      <td>
                        <span className="mono truncate" title={displayValue ?? undefined}>
                          {isSecret ? shown ?? "••••••••" : row.value ?? "—"}
                        </span>
                      </td>
                      <td>
                        <div className="table__actions">
                          {isSecret && shown !== undefined && (
                            <Button variant="ghost" size="sm" onClick={() => copyValue(row.key, shown)}>
                              {copiedKey === row.key ? "Copied" : "Copy"}
                            </Button>
                          )}
                          {isSecret && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleReveal(row.key)}
                              loading={revealing === row.key}
                            >
                              {shown !== undefined ? <IconEyeOff /> : <IconEye />}
                              {shown !== undefined ? "Hide" : "Reveal"}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                            Edit
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

      {editing !== undefined && (
        <SetSettingModal
          existing={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            load();
          }}
        />
      )}
    </>
  );
}
