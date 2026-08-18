import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";
import { AuthUser, Portfolio } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  portfolios: Portfolio[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setPortfolios(data.portfolios);
    } catch {
      setUser(null);
      setPortfolios([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("ram_token");
    if (token) {
      refreshMe();
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("ram_token", data.token);
    setUser(data.user);
    await refreshMe();
  }

  function logout() {
    localStorage.removeItem("ram_token");
    localStorage.removeItem("ram_user");
    setUser(null);
    setPortfolios([]);
  }

  return <AuthContext.Provider value={{ user, portfolios, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
