import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import type { AuthUser } from "../types";

type AuthContextValue = {
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "cashflow-token";
const ALT_TOKEN_KEY = "authToken";
const USER_KEY = "cashflow-user";

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const setSession = (token: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ALT_TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ALT_TOKEN_KEY);
    try {
      if (token) {
        await fetch("http://127.0.0.1:8000/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {
      // Token-based logout is complete once local session data is cleared.
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ALT_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
    }
  };

  return <AuthContext.Provider value={{ user, setSession, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
