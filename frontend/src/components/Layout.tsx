import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationsBell from "./NotificationsBell";

const NAV = [
  { to: "/", label: "Dashboard", roles: null },
  { to: "/resources", label: "Resources", roles: null },
  { to: "/allocations", label: "Allocations", roles: null },
  { to: "/bench", label: "Bench", roles: null },
  { to: "/approvals", label: "Approvals", roles: ["ADMIN", "RMG", "HR"] },
  { to: "/reports", label: "Reports", roles: null },
  { to: "/admin", label: "Admin", roles: ["ADMIN", "RMG", "HR"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-brand-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="font-semibold text-lg leading-tight">RAM</div>
          <div className="text-xs text-brand-100/70">Resource Allocation & Management</div>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-white/15 text-white" : "text-brand-100/80 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 text-xs text-brand-100/60">Phase 1 — Core Lifecycle MVP</div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-800">{user?.name}</span>{" "}
            <span className="badge bg-slate-100 text-slate-600 ml-1">{user?.role}</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <button className="btn-secondary" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
