import { RefreshCw, CheckCircle2, XCircle, CircleDot } from "lucide-react";
import { call } from "../api/client";
import type { HealthReport } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { PageHeader } from "../components/PageHeader";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { LoadingBlock, ErrorBlock } from "../components/States";

interface HealthData {
  health: HealthReport;
  plugins: string[];
}

type PluginStatus = "healthy" | "down" | "enabled";

interface PluginCard {
  name: string;
  status: PluginStatus;
  detail: Record<string, unknown> | null;
}

const STATUS_META: Record<PluginStatus, { label: string; tone: BadgeTone }> = {
  healthy: { label: "Healthy", tone: "success" },
  down: { label: "Down", tone: "danger" },
  enabled: { label: "Enabled", tone: "neutral" },
};

export function HealthPage() {
  const { data, loading, error, reload } = useAsync<HealthData>(async () => {
    const [health, plugins] = await Promise.all([
      call<HealthReport>("admin_health", {}, { method: "GET" }),
      call<string[]>("list_plugins", {}, { method: "GET" }),
    ]);
    return { health, plugins };
  });

  // Merge the full plugin roster with the health probe results, so EVERY
  // registered plugin appears — a plugin that exposes health() shows its
  // live status; one that doesn't still shows as "Enabled" (booted, no
  // probe) rather than silently missing from the page.
  const cards: PluginCard[] = (() => {
    if (!data) return [];
    const health = data.health;
    const names = new Set<string>([...data.plugins, ...Object.keys(health)]);
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const report = health[name];
        if (!report) return { name, status: "enabled" as const, detail: null };
        return {
          name,
          status: report.ok ? ("healthy" as const) : ("down" as const),
          detail: report,
        };
      });
  })();

  const probed = cards.filter((c) => c.status !== "enabled");
  const allOk = probed.length > 0 && probed.every((c) => c.status === "healthy");

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="System Health"
        description="Every registered plugin and the live status of any that report health."
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload} loading={loading}>
            Refresh
          </Button>
        }
      />

      {loading && !data && <LoadingBlock label="Checking capabilities…" />}
      {error && <ErrorBlock message={error} onRetry={reload} />}

      {data && (
        <>
          {/* Compact status pill — sized to its content, not a full-width bar. */}
          <div
            className={`mb-5 inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${
              allOk
                ? "border-success/25 bg-success-bg/50 text-success"
                : "border-danger/25 bg-danger-bg/50 text-danger"
            }`}
          >
            {allOk ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {allOk ? "All systems operational" : "One or more capabilities are unhealthy"}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => {
              const meta = STATUS_META[card.status];
              return (
                <div key={card.name} className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-text">{card.name}</h3>
                    <Badge tone={meta.tone} dot>
                      {meta.label}
                    </Badge>
                  </div>
                  {card.detail ? (
                    <dl className="flex flex-col gap-1.5">
                      {Object.entries(card.detail)
                        .filter(([k]) => k !== "ok")
                        .map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-3 text-[13px]">
                            <dt className="capitalize text-text-faint">{k.replace(/_/g, " ")}</dt>
                            <dd className="truncate font-mono text-[12px] text-text" title={String(v)}>
                              {String(v)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  ) : (
                    <p className="flex items-center gap-1.5 text-[13px] text-text-faint">
                      <CircleDot size={13} /> Booted — no health probe
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
