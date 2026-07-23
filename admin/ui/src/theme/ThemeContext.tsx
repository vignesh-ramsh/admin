import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "../api/client";

/**
 * Real light/dark toggle, AgniUI-style: mode switch is a token-level swap via
 * data-theme on the document root — no duplicated component code, every
 * copied AgniUI component already reads the paired light/dark token value.
 * Default is light, with an explicit opt-in to dark (matches AgniUI's own
 * stated default, README "OPEN DECISIONS" — system-matched prefers-color-
 * scheme is left as a possible later choice, not assumed here).
 */

type Theme = "light" | "dark";

const STORAGE_KEY = "arc-admin-theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  /** Sync the theme from the server (login/whoami) without re-persisting
   *  it back — avoids a redundant write of the value we just read. */
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    // Best-effort — persists across devices once the server has a value to
    // return from whoami()/login(). Silently ignored while logged out (the
    // call 401s) since local/data-theme still applies either way.
    api.setMyTheme(next).catch(() => {});
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>.");
  return ctx;
}
