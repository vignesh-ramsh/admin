import { call } from "../api/client";
import type { HealthReport } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Loading, ErrorState } from "../components/States";
import { IconRefresh } from "../layout/icons";
import "./health.css";

export function HealthPage() {
  const { data, loading, error, reload } = useAsync<HealthReport>(() => call("admin_health"));

  const allOk = data ? Object.values(data).every((c) => c.ok) : false;

  return (
    <>
      <PageHeader
        title="System Health"
        subtitle="Live status of every registered capability."
        actions={
          <Button variant="secondary" size="sm" onClick={reload}>
            <IconRefresh /> Refresh
          </Button>
        }
      />

      {loading && <Loading message="Checking capabilities…" />}
      {error && <ErrorState message={error} />}

      {data && (
        <>
          <div className={`health-banner ${allOk ? "health-banner--ok" : "health-banner--bad"}`}>
            <span className="health-banner__dot" />
            {allOk ? "All systems operational" : "One or more capabilities are unhealthy"}
          </div>

          <div className="health-grid">
            {Object.entries(data).map(([name, report]) => (
              <div key={name} className="card health-card">
                <div className="health-card__top">
                  <span className="health-card__name">{name}</span>
                  <Badge tone={report.ok ? "success" : "danger"} dot>
                    {report.ok ? "Healthy" : "Down"}
                  </Badge>
                </div>
                <dl className="health-card__meta">
                  {Object.entries(report)
                    .filter(([k]) => k !== "ok")
                    .map(([k, v]) => (
                      <div key={k} className="health-card__row">
                        <dt>{k.replace(/_/g, " ")}</dt>
                        <dd title={String(v)}>{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
