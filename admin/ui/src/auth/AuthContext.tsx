import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "../api/client";
import { useTheme } from "../theme/ThemeContext";

interface AuthApi {
  /** True once the initial whoami() bootstrap has resolved — until then,
   *  authenticated is neither true nor false, it's simply unknown. */
  loading: boolean;
  authenticated: boolean;
  email: string | null;
  username: string | null;
  fullName: string | null;
  login: (email: string, password: string, sessionType: "Fixed" | "Extended") => Promise<void>;
  logout: () => Promise<void>;
  onUnauthorized: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<api.Profile | null>(null);

  // The session itself lives in an httpOnly cookie the browser attaches
  // automatically — there's nothing in localStorage to read synchronously
  // on mount, so "am I logged in" starts unknown and resolves via whoami().
  useEffect(() => {
    let cancelled = false;
    api
      .whoami()
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        if (result) setTheme(result.theme);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string, sessionType: "Fixed" | "Extended") => {
    const result = await api.login(email, password, sessionType);
    setProfile(result);
    setTheme(result.theme);
  };

  const logout = async () => {
    await api.logout();
    setProfile(null);
  };

  // Called when any API call returns 401 (session expired/revoked) — the
  // cookie is already invalid/cleared server-side, so just drop local state
  // to bounce back to the login screen.
  const onUnauthorized = () => {
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        authenticated: profile !== null,
        email: profile?.email ?? null,
        username: profile?.username ?? null,
        fullName: profile?.full_name ?? null,
        login,
        logout,
        onUnauthorized,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
