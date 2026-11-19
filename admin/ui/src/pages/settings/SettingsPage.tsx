import { useCallback, useMemo, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Info, Plus, RefreshCw, Search } from "lucide-react";
import { call } from "../../api/client";
import type { SettingEntry } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { ErrorBlock, EmptyState } from "../../components/States";
import { formatDefault } from "./settingTypes";

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
  const searchRef = usePageSearchFocus();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Settings"
        description="Every setting any plugin declares. Secrets are CLI-only (arc settings)."
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate("/settings/__new__/edit")}>
            New setting
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            ref={searchRef}
            className="h-9 w-full rounded-md border border-border-strong bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
            placeholder="Search by key…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center py-14 text-center text-sm text-text-faint">Loading settings…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing declared yet" description="No plugin has declared or set a setting." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description={`Nothing matches "${q}".`} />
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "54%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/60">
                <th className="px-3.5 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Key</th>
                <th className="px-3.5 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Type</th>
                <th className="px-3.5 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Value</th>
              </tr>
            </thead>
            {groups.map(([group, groupRows]) => (
              <tbody key={group}>
                <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/60">
                  <td colSpan={3} className="p-0">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-left"
                    >
                      {collapsed[group] ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      <span className="text-[13px] font-semibold text-text">{group}</span>
                      <span className="text-xs text-text-faint">({groupRows.length})</span>
                    </button>
                  </td>
                </tr>
                {!collapsed[group] && group === "filer" && (
                  <tr className="border-b border-border bg-info-bg">
                    <td colSpan={3} className="px-3.5 py-2.5">
                      <div className="flex items-start gap-2 text-[13px] text-info">
                        <Info size={14} className="mt-0.5 shrink-0" />
                        <span>
                          Also editable, grouped and unit-converted, on{" "}
                          <Link to="/files/settings" className="cursor-pointer font-medium underline underline-offset-2">
                            File Manager → Settings
                          </Link>
                          .
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {!collapsed[group] &&
                  groupRows.map((row) => {
                    const defaultText = formatDefault(row.default);
                    return (
                      <tr
                        key={row.key}
                        onClick={() => navigate(`/settings/${encodeURIComponent(row.key)}/edit`)}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                      >
                        <td className="truncate px-3.5 py-2 font-mono text-[13px] text-text" title={row.key}>
                          {row.key}
                        </td>
                        <td className="px-3.5 py-2">
                          {row.type ? (
                            <Badge tone="neutral" className="font-mono uppercase">
                              {row.type}
                            </Badge>
                          ) : (
                            <span className="text-text-faint">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2">
                          <span className="block truncate font-mono text-[12.5px] text-text-muted" title={row.value ?? undefined}>
                            {row.value ?? "—"}
                          </span>
                          {defaultText !== null && (
                            <span className="block truncate font-mono text-[11.5px] text-text-faint" title={defaultText}>
                              Default: {defaultText}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <Outlet context={{ reload }} />
    </div>
  );
}
