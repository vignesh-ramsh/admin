import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>.");
  return ctx;
}
