import { Outlet } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { RouteTabs } from "../../components/Tabs";

export function FileManagerPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="File Manager" description="Uploaded files, storage, and antivirus scanning." />
      <RouteTabs
        items={[
          { to: "/files/browse", label: "Files" },
          { to: "/files/settings", label: "Settings" },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
