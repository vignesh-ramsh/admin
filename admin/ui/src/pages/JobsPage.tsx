import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Tabs } from "../components/Tabs";
import { ScheduledJobsTab } from "./jobs/ScheduledJobsTab";
import { ExecutionLogTab } from "./jobs/ExecutionLogTab";

const TABS = [
  { id: "scheduled", label: "Scheduled Jobs" },
  { id: "log", label: "Execution Log" },
];

export function JobsPage() {
  // Selection lives in the URL, same convention Data Browser/Schema
  // Builder already use — a refresh lands back on the same tab.
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "log" ? "log" : "scheduled";

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Scheduled jobs (live config) and the execution log (history) — background work, however it ran."
      />

      <Tabs tabs={TABS} active={tab} onChange={(id) => setParams({ tab: id })} />

      {tab === "scheduled" ? <ScheduledJobsTab /> : <ExecutionLogTab />}
    </>
  );
}
