import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Logo } from "../components/Logo";
import { Switch } from "../components/agni/forms/Switch";
import { useTheme } from "../theme/ThemeContext";
import {
  IconHealth,
  IconData,
  IconUsers,
  IconRoles,
  IconSessions,
  IconKeys,
  IconSchema,
  IconSettings,
  IconJobs,
  IconLogout,
} from "./icons";
import "./layout.css";

interface NavEntry {
  to: string;
  label: string;
  icon: (props: { size?: number }) => JSX.Element;
}

const NAV: { section: string; items: NavEntry[] }[] = [
  {
    section: "Overview",
    items: [{ to: "/health", label: "Health", icon: IconHealth }],
  },
  {
    section: "Data",
    items: [
      { to: "/data", label: "Data Browser", icon: IconData },
      { to: "/schema", label: "Schema Builder", icon: IconSchema },
    ],
  },
  {
    section: "Access",
    items: [
      { to: "/users", label: "Users", icon: IconUsers },
      { to: "/roles", label: "Roles", icon: IconRoles },
      { to: "/sessions", label: "Sessions", icon: IconSessions },
      { to: "/access-keys", label: "Access Keys", icon: IconKeys },
    ],
  },
  {
    section: "System",
    items: [
      { to: "/jobs", label: "Jobs", icon: IconJobs },
      { to: "/settings", label: "Settings & Secrets", icon: IconSettings },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/health": "System Health",
  "/data": "Data Browser",
  "/schema": "Schema Builder",
  "/users": "Users",
  "/roles": "Roles",
  "/sessions": "Sessions",
  "/access-keys": "Access Keys",
  "/settings": "Settings & Secrets",
  "/jobs": "Jobs",
};

export function AppLayout() {
  const { email, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const title =
    Object.entries(TITLES).find(([path]) => location.pathname.startsWith(path))?.[1] ?? "Admin";
  const initials = (email ?? "?").slice(0, 2);
  // The Schema Builder manages its own layout: its file list sits flush
  // against the nav drawer as a second panel, so the page must not be
  // padded or width-capped by the standard content wrapper.
  const flush = location.pathname.startsWith("/schema");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Logo size={26} />
          <span className="sidebar__brand-text">Admin Desk</span>
        </div>
        <nav className="sidebar__nav">
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="sidebar__section">{group.section}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                  >
                    <Icon />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__title">{title}</div>
          <div className="topbar__right">
            <label className="theme-toggle" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <i className={theme === "dark" ? "ph ph-moon-stars" : "ph ph-sun"} style={{ fontSize: 16, color: "var(--text-secondary)" }} />
              <Switch checked={theme === "dark"} onChange={toggleTheme} size="sm" />
            </label>
            <div className="user-chip">
              <span className="user-chip__avatar">{initials}</span>
              <span>{email}</span>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={logout} title="Sign out">
              <IconLogout size={16} />
              Sign out
            </button>
          </div>
        </header>
        <main className={`content ${flush ? "content--flush" : ""}`}>
          {flush ? (
            <Outlet />
          ) : (
            <div className="content__inner">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
