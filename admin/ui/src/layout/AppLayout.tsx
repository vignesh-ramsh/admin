import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, Search, Palette, LogOut } from "lucide-react";
import clsx from "clsx";
import { NAV } from "./nav";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { ThemePickerModal } from "../components/ThemePickerModal";
import { CommandPalette } from "./CommandPalette";
import { IconButton } from "../components/Button";
import { ARC_LOGO_URL } from "../lib/assets";

/** Bare-letter shortcuts (no modifier) must never fire while the user is
 *  actually typing somewhere — the same guard a Gmail-style "c"-for-
 *  compose shortcut needs. Cmd/Ctrl+K doesn't need this (that chord is
 *  vanishingly unlikely mid-typing and browsers already reserve it). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function initials(name: string | null, email: string | null): string {
  const src = name || email || "?";
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function AppLayout() {
  const { fullName, email, logout } = useAuth();
  const { presetName } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "t" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setThemeModalOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // One delegated listener for the whole app — every .scrollbar-thin region
  // (sidebars, tables, modal bodies, the new row-preview panels, ...) gets
  // "thumb only visible while actually scrolling" for free, no per-
  // component wiring. `scroll` doesn't bubble, so this has to listen in
  // the CAPTURE phase to see it at all; it still fires once per scrolled
  // element regardless of where in the tree that element lives (including
  // a Modal's portaled content, which renders under document.body, outside
  // this component's own DOM subtree).
  useEffect(() => {
    const timers = new WeakMap<Element, ReturnType<typeof window.setTimeout>>();
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof Element) || !el.classList.contains("scrollbar-thin")) return;
      el.classList.add("is-scrolling");
      const prev = timers.get(el);
      if (prev !== undefined) window.clearTimeout(prev);
      timers.set(
        el,
        window.setTimeout(() => el.classList.remove("is-scrolling"), 800),
      );
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2 px-4 py-4">
        <img src={ARC_LOGO_URL} alt="" className="h-7 w-7 shrink-0 rounded-md" />
        <span className="text-[15px] font-semibold text-text">Admin Console</span>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="mx-3 mb-3 flex cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-text-faint hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <Search size={14} />
        Search
        <kbd className="ml-auto rounded border border-border px-1 text-[10px]">⌘K</kbd>
      </button>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors",
                      isActive
                        ? "bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"
                        : "text-text-muted hover:bg-neutral-100 hover:text-text dark:hover:bg-neutral-800",
                    )
                  }
                >
                  <item.icon size={16} className="shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Theme control — moved here from the (now removed) top header. */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <IconButton
          label="Choose a theme"
          icon={<Palette size={15} />}
          onClick={() => setThemeModalOpen(true)}
          className="border border-border-strong bg-surface"
        />
        <span className="ml-1 truncate text-[12px] text-text-faint">{presetName}</span>
        <kbd className="ml-auto rounded border border-border px-1 text-[10px] text-text-faint">T</kbd>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[12px] font-semibold text-accent-700 dark:bg-accent-900 dark:text-accent-300">
            {initials(fullName, email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-text">{fullName || email}</p>
            <p className="truncate text-[12px] text-text-faint">{email}</p>
          </div>
          <IconButton
            label="Sign out"
            icon={<LogOut size={15} />}
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">{sidebarContent}</aside>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-neutral-950/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex w-72 max-w-[80vw] flex-col border-r border-border bg-surface">{sidebarContent}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only nav trigger (the desktop header is gone). */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="absolute left-3 top-3 z-30 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-text-muted shadow-sm md:hidden"
        >
          <Menu size={18} />
        </button>
        <main className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto p-5 pt-14 md:p-6 md:pt-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ThemePickerModal open={themeModalOpen} onClose={() => setThemeModalOpen(false)} />
    </div>
  );
}
