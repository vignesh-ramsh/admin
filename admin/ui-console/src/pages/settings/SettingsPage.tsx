import { useCallback, useMemo, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Eye, EyeOff, Info, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { call } from "../../api/client";
import type { SettingEntry } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { ErrorBlock, EmptyState } from "../../components/States";

/** Group by the key's prefix before the first `_` (docs/admin-ui-ux-
 *  review.md §7.1 — the old app was a flat, ungrouped, unsearchable
 *  22-row list). */
function groupOf(key: string): string {
  const idx = key.indexOf("_");
  return idx === -1 ? key : key.slice(0, idx);
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  const loader = useCallback(() => call<SettingEntry[]>("list_settings"), []);
  const { data, loading, error, reload } = useAsync(loader, []);
  const rows = data ?? [];

  const filtered = useMemo(
    () => rows.filter((r) => r.key.toLowerCase().includes(q.trim().toLowerCase())),
    [rows, q],
  );

  const groups = useMemo(() => {
    const byGroup: Record<string, SettingEntry[]> = {};
    for (const row of filtered) {
      const g = groupOf(row.key);
      (byGroup[g] ??= []).push(row);
    }
    return Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleGroup = (g: string) => setCollapsed((c) => ({ ...c, [g]: !c[g] }));

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
    } catch {
      /* row simply stays masked on failure */
    } finally {
      setRevealing(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Settings & Secrets"
        description="Every key any plugin has declared via arc.settings — the one place that answers what exists across the whole system."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate("/settings/__new__/edit")}>
              Add setting
            </Button>
          </>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
        <input
          className="h-9 w-full rounded-md border border-border-strong bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
          placeholder="Search by key…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center py-14 text-center text-sm text-text-faint">Loading settings…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing declared yet" description="No plugin has set a setting or secret." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description={`Nothing matches "${q}".`} />
      ) : (
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1">
          {groups.map(([group, groupRows]) => (
            <div key={group} className="overflow-hidden rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full cursor-pointer items-center gap-2 border-b border-border bg-neutral-50 px-3.5 py-2.5 text-left dark:bg-neutral-900/60"
              >
                {collapsed[group] ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <span className="text-[13px] font-semibold text-text">{group}</span>
                <span className="text-xs text-text-faint">({groupRows.length})</span>
              </button>
              {!collapsed[group] && (
                <div>
                  {group === "filer" && (
                    <div className="flex items-start gap-2 border-b border-border bg-info-bg px-3.5 py-2.5 text-[13px] text-info">
                      <Info size={14} className="mt-0.5 shrink-0" />
                      <span>
                        Also editable, grouped and unit-converted, on{" "}
                        <Link to="/files/settings" className="cursor-pointer font-medium underline underline-offset-2">
                          File Manager → Settings
                        </Link>
                        .
                      </span>
                    </div>
                  )}
                  {groupRows.map((row) => {
                    const isSecret = row.kind === "secret";
                    const shown = revealed[row.key];
                    return (
                      <div
                        key={row.key}
                        className="flex cursor-pointer items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                        onClick={() => navigate(`/settings/${encodeURIComponent(row.key)}/edit`)}
                      >
                        <span className="min-w-[220px] truncate font-mono text-[13px] text-text" title={row.key}>
                          {row.key}
                        </span>
                        <Badge tone={isSecret ? "danger" : "accent"}>{isSecret ? "Secret" : "Setting"}</Badge>
                        <span className="flex-1 truncate font-mono text-[12.5px] text-text-muted" title={isSecret ? shown : row.value ?? undefined}>
                          {isSecret ? shown ?? "••••••••" : row.value ?? "—"}
                        </span>
                        {isSecret && (
                          <IconButton
                            label={shown !== undefined ? "Hide value" : "Reveal value"}
                            icon={shown !== undefined ? <EyeOff size={14} /> : <Eye size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReveal(row.key);
                            }}
                            disabled={revealing === row.key}
                          />
                        )}
                        <IconButton
                          label={`Edit ${row.key}`}
                          icon={<Pencil size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/settings/${encodeURIComponent(row.key)}/edit`);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Outlet context={{ reload }} />
    </div>
  );
}
