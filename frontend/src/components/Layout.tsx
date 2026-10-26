import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", roles: null },
  { to: "/resources", label: "Resources", roles: null },
  { to: "/allocations", label: "Allocations", roles: null },
  { to: "/bench", label: "Bench", roles: null },
  { to: "/alerts", label: "Alerts", roles: null },
  { to: "/demand", label: "Demand", roles: ["TA"] },
  { to: "/approvals", label: "Approvals", roles: ["ADMIN", "RMG", "HR"] },
  { to: "/reports", label: "Reports", roles: null },
  { to: "/admin", label: "Admin", roles: ["ADMIN", "RMG", "HR"] },
];

const NAV_ICONS = ["⌂", "▦", "⇄", "◉", "!", "＋", "✓", "▤", "⚙"];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex">
      <aside className={`${sidebarCollapsed ? "w-16" : "w-60"} bg-brand-900 text-white flex flex-col shrink-0 transition-[width] duration-200`}>
        <div className={`px-3 py-5 border-b border-white/10 ${sidebarCollapsed ? "text-center" : "px-5"}`}>
          <div className="font-semibold text-lg leading-tight">RAM</div>
          {!sidebarCollapsed && <div className="text-xs text-brand-100/70">Resource Allocation & Management</div>}
        </div>
        <button type="button" className="mx-auto mt-3 flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10" aria-label={sidebarCollapsed ? "Expand navigation" : "Minimize navigation"} title={sidebarCollapsed ? "Expand navigation" : "Minimize navigation"} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <span aria-hidden="true" className="text-2xl leading-none">{sidebarCollapsed ? "⟫" : "⟪"}</span>
          {!sidebarCollapsed && <span>Minimize navigation</span>}
        </button>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} title={sidebarCollapsed ? item.label : undefined} aria-label={item.label}
              className={({ isActive }) => `flex items-center rounded-md px-3 py-2 text-sm font-medium ${sidebarCollapsed ? "justify-center" : "gap-3"} ${isActive ? "bg-white/15 text-white" : "text-brand-100/80 hover:bg-white/10 hover:text-white"}`}>
              <span aria-hidden="true" className="w-5 text-center">{NAV_ICONS[NAV.indexOf(item)]}</span>
              {!sidebarCollapsed && item.label}
            </NavLink>
          ))}
        </nav>
        {!sidebarCollapsed && <div className="px-4 py-4 border-t border-white/10 text-xs text-brand-100/60">Phase 1 — Core Lifecycle MVP</div>}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-800">{user?.name}</span>{" "}
            <span className="badge bg-slate-100 text-slate-600 ml-1">{user?.role}</span>
          </div>
          <div className="relative">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 hover:bg-brand-200" aria-label="Open profile menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>
              {user?.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?"}
            </button>
            {profileOpen && <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
              <div className="font-medium text-slate-900">{user?.name}</div>
              <div className="mt-1 text-sm text-slate-500">{user?.email}</div>
              <div className="mt-2 text-xs text-slate-500">{user?.role}</div>
              <button className="btn-secondary mt-4 w-full" onClick={handleLogout}>Log out</button>
            </div>}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
