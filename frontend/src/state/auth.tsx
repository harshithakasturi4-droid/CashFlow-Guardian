import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/react";
import { setClerkTokenGetter } from "../lib/api";
import type { AuthUser } from "../types";
const API_URL = import.meta.env.VITE_API_BASE_URL;
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
  const { getToken, isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();

  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) setUser(JSON.parse(stored));
  }, []);

  useEffect(() => {
    setClerkTokenGetter(getToken);
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !clerkUser) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ALT_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
      return;
    }

    const email = clerkUser.primaryEmailAddress?.emailAddress || "";
    const nextUser = {
      id: clerkUser.id,
      email,
      name: clerkUser.fullName || clerkUser.username || email || "Clerk user"
    };

    setUser(nextUser);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    getToken().then((token) => {
      if (!token) return;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(ALT_TOKEN_KEY, token);
    });
  }, [clerkUser, getToken, isLoaded, isSignedIn]);

  const setSession = (token: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ALT_TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const logout = async () => {
    const token = (isSignedIn ? await getToken() : null) || localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ALT_TOKEN_KEY);
    try {
      if (token) {
        await fetch(`${API_URL}/api/auth/logout`, {
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
      if (isSignedIn) await signOut();
    }
  };

  return <AuthContext.Provider value={{ user, setSession, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
