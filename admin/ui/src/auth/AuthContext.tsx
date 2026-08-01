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
  login: (identifier: string, password: string, sessionType: "Fixed" | "Extended") => Promise<void>;
  logout: () => Promise<void>;
  onUnauthorized: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

function applyServerTheme(
  theme: string | null,
  setPresetName: (name: string, opts?: { persist?: boolean }) => void,
) {
  // setPresetName itself resolves an unrecognized/legacy value down to a
  // real preset (theme/ThemeContext.tsx's resolvePresetName) — this only
  // needs to skip the call entirely when there's no server value at all.
  if (theme) setPresetName(theme, { persist: false });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setPresetName } = useTheme();
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
        if (result) applyServerTheme(result.theme, setPresetName);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (identifier: string, password: string, sessionType: "Fixed" | "Extended") => {
    const isEmail = identifier.includes("@");
    const result = await api.login({
      [isEmail ? "email" : "username"]: identifier,
      password,
      session_type: sessionType,
    });
    setProfile(result);
    applyServerTheme(result.theme, setPresetName);
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
