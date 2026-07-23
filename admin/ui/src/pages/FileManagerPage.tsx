import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Tabs } from "../components/Tabs";
import { FilerSettingsTab } from "./filer/FilerSettingsTab";
import { FilerFilesTab } from "./filer/FilerFilesTab";

// Settings first, Files second — deliberately, per how this page was
// asked for: an operator configuring a fresh instance wants antivirus/
// size limits sane BEFORE looking at what's already been uploaded.
const TABS = [
  { id: "settings", label: "Settings" },
  { id: "files", label: "Files" },
];

export function FileManagerPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "files" ? "files" : "settings";

  return (
    <>
      <PageHeader
        title="File Manager"
        subtitle="Attachment storage — antivirus/size settings, and every file filer has ever stored."
      />

      <Tabs tabs={TABS} active={tab} onChange={(id) => setParams({ tab: id })} />

      {tab === "settings" ? <FilerSettingsTab /> : <FilerFilesTab />}
    </>
  );
}
