import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { RoleName } from "../types";

export default function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: RoleName[] }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <div className="p-8 text-sm text-red-600">You do not have access to this page.</div>;
  }
  return <>{children}</>;
}
