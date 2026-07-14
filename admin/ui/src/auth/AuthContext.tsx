import { createContext, useContext, useState, type ReactNode } from "react";
import * as api from "../api/client";

const EMAIL_KEY = "arc_admin_email";

interface AuthApi {
  token: string | null;
  email: string | null;
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
  const [token, setTokenState] = useState<string | null>(api.getToken());
  const [email, setEmailState] = useState<string | null>(localStorage.getItem(EMAIL_KEY));

  const login = async (email: string, password: string, sessionType: "Fixed" | "Extended") => {
    const result = await api.login(email, password, sessionType);
    localStorage.setItem(EMAIL_KEY, email);
    setEmailState(email);
    setTokenState(result.token);
  };

  const logout = async () => {
    await api.logout();
    localStorage.removeItem(EMAIL_KEY);
    setEmailState(null);
    setTokenState(null);
  };

  // Called when any API call returns 401 (token expired/revoked) — the
  // client has already cleared the stored token, so just drop local state
  // to bounce back to the login screen.
  const onUnauthorized = () => {
    localStorage.removeItem(EMAIL_KEY);
    setEmailState(null);
    setTokenState(null);
  };

  return (
    <AuthContext.Provider value={{ token, email, login, logout, onUnauthorized }}>
      {children}
    </AuthContext.Provider>
  );
}
