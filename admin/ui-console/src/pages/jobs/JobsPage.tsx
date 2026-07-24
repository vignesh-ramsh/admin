import { Outlet } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { RouteTabs } from "../../components/Tabs";

export function JobsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Jobs" description="Scheduled tasks and their execution history." />
      <RouteTabs
        items={[
          { to: "/jobs/scheduled", label: "Scheduled Jobs" },
          { to: "/jobs/log", label: "Execution Log" },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
