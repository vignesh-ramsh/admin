import { useEffect, useState } from "react";
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
  IconFiles,
  IconLogout,
} from "./icons";
import { GlobalSearch } from "./GlobalSearch";
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
      { to: "/files", label: "File Manager", icon: IconFiles },
      { to: "/jobs", label: "Jobs", icon: IconJobs },
      { to: "/settings", label: "Settings & Secrets", icon: IconSettings },
    ],
  },
];

export function AppLayout() {
  const { email, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const initials = (email ?? "?").slice(0, 2);
  // Data Browser and Schema Builder each manage their own layout — a
  // side panel + content pane sharing exactly the page's own height
  // (.workspace, shared/shared.css) — so neither should be padded or
  // width-capped by the standard content wrapper; each owns its own
  // padding instead. Unaffected by removing the topbar above.
  const flush = location.pathname.startsWith("/schema") || location.pathname.startsWith("/data");

  // Below layout.css's mobile breakpoint, .sidebar becomes an off-canvas
  // drawer (docs/admin-ui-ux-review.md #1.3 — there was previously no
  // narrow-viewport story at all, a permanently fixed-width sidebar).
  // Irrelevant above the breakpoint: .sidebar-scrim/.mobile-menu-btn are
  // display:none there, so this state never visibly does anything.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  return (
    <div className="shell">
      <button
        type="button"
        className="mobile-menu-btn"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation menu"
      >
        <i className="ph ph-list" aria-hidden="true" />
      </button>
      {mobileNavOpen && <div className="sidebar-scrim" onClick={() => setMobileNavOpen(false)} />}

      <aside className={`sidebar ${mobileNavOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <Logo size={26} />
          <span className="sidebar__brand-text">Admin Desk</span>
          <button
            type="button"
            className="sidebar__close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <i className="ph ph-x" aria-hidden="true" />
          </button>
        </div>
        <div className="sidebar__search">
          <GlobalSearch />
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

        <div className="sidebar__footer">
          <div className="theme-toggle theme-toggle--sidebar">
            <i className={theme === "dark" ? "ph ph-moon-stars" : "ph ph-sun"} aria-hidden="true" />
            <span className="theme-toggle__label">{theme === "dark" ? "Dark mode" : "Light mode"}</span>
            <Switch
              checked={theme === "dark"}
              onChange={toggleTheme}
              size="sm"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            />
          </div>

          <div className="user-chip user-chip--sidebar" title={email ?? undefined}>
            <span className="user-chip__avatar">{initials}</span>
            <span className="user-chip__email">{email}</span>
          </div>

          <button className="btn btn--ghost btn--sm sidebar__signout" onClick={logout} title="Sign out">
            <IconLogout size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
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
