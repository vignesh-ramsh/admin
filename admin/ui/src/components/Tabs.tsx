import { Tabs as AgniTabs } from "./agni/navigation/Tabs";

/**
 * Thin adapter over the copied AgniUI Tabs (agni/navigation/Tabs.tsx) —
 * keeps this app's existing {id,label}[]/active/onChange vocabulary
 * (AgniUI's own uses {key,label}[]/value/onChange) so its one call site
 * (JobsPage) didn't need touching.
 */
export interface TabItem {
  id: string;
  label: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <AgniTabs
      tabs={tabs.map((t) => ({ key: t.id, label: t.label }))}
      value={active}
      onChange={onChange}
    />
  );
}
