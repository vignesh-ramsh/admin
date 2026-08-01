import { NavLink } from "react-router-dom";
import clsx from "clsx";

export interface TabItem {
  to: string;
  label: string;
  end?: boolean;
}

/** URL-driven tabs — each tab is a real route, so the active tab survives
 *  refresh/back-forward/deep-linking instead of living in local state. */
export function RouteTabs({ items }: { items: TabItem[] }) {
  return (
    <div className="mb-5 flex items-center gap-1 border-b border-border">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              "relative -mb-px cursor-pointer px-3 py-2.5 text-[13px] font-medium transition-colors",
              isActive ? "text-accent-700 dark:text-accent-300" : "text-text-muted hover:text-text",
            )
          }
        >
          {({ isActive }) => (
            <>
              {item.label}
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-600" />}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
