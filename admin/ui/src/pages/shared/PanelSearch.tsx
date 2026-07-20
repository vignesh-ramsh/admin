import { useEffect, useRef, useState } from "react";

/**
 * Search box + a filter icon (opens a small plugin-picker popover) for the
 * top of a browse panel (Data Browser's table list, Schema Builder's file
 * list). Shared so both panels look and behave identically.
 */
export function PanelSearch({
  value,
  onChange,
  plugins,
  activePlugin,
  onPluginChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  plugins: string[];
  activePlugin: string; // "" = All plugins
  onPluginChange: (plugin: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="browse-panel__search" ref={ref}>
      <i className="ph ph-magnifying-glass browse-panel__search-icon" />
      <input
        className="browse-panel__search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className={`browse-panel__filter ${activePlugin ? "browse-panel__filter--on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={activePlugin ? `Filtered to ${activePlugin}` : "Filter by plugin"}
        aria-label="Filter by plugin"
      >
        <i className="ph ph-funnel" />
      </button>
      {open && (
        <div className="browse-panel__filter-menu">
          <button
            type="button"
            className={`browse-panel__filter-item ${!activePlugin ? "browse-panel__filter-item--on" : ""}`}
            onClick={() => {
              onPluginChange("");
              setOpen(false);
            }}
          >
            All plugins
          </button>
          {plugins.map((p) => (
            <button
              type="button"
              key={p}
              className={`browse-panel__filter-item ${activePlugin === p ? "browse-panel__filter-item--on" : ""}`}
              onClick={() => {
                onPluginChange(p);
                setOpen(false);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
