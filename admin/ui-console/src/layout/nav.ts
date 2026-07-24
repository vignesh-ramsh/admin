import {
  Activity,
  Database,
  FileCode2,
  Users,
  ShieldCheck,
  KeyRound,
  Clock,
  FolderOpen,
  ListChecks,
  Settings2,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ to: "/health", label: "Health", icon: Activity }] },
  {
    label: "Data",
    items: [
      { to: "/data", label: "Data Browser", icon: Database },
      { to: "/schema", label: "Schema Builder", icon: FileCode2 },
    ],
  },
  {
    label: "Access",
    items: [
      { to: "/users", label: "Users", icon: Users },
      { to: "/roles", label: "Roles", icon: ShieldCheck },
      { to: "/sessions", label: "Sessions", icon: Clock },
      { to: "/access-keys", label: "Access Keys", icon: KeyRound },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/files", label: "File Manager", icon: FolderOpen },
      { to: "/jobs", label: "Jobs", icon: ListChecks },
      { to: "/settings", label: "Settings & Secrets", icon: Settings2 },
    ],
  },
  {
    label: "Lab",
    items: [{ to: "/theme-lab", label: "Theme Lab", icon: FlaskConical }],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
