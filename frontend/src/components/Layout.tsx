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

const NAV_ICONS = ["⌂", "▦", "⇄", "◉", "!", "+", "✓", "▤", "⚙"];

const NAV_LABELS: Record<string, string> = {
  "⌂": "Dashboard",
  "▦": "Resources",
  "⇄": "Allocations",
  "◉": "Bench",
  "!": "Alerts",
  "+": "Demand",
  "✓": "Approvals",
  "▤": "Reports",
  "⚙": "Admin",
};

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
      <aside className={`${sidebarCollapsed ? "w-16" : "w-60"} flex shrink-0 flex-col bg-[#1e3a8a] text-white shadow-lg transition-[width] duration-300`}>
        <div className={`flex min-h-20 items-center border-b border-white/15 ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4"}`}>
          {!sidebarCollapsed && <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold shadow-sm">R</div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-lg leading-tight">RAM</div>
              <div className="text-xs leading-4 text-white/75">Resource Allocation &amp; Management</div>
            </div>
          </>}
          <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => {
            const icon = NAV_ICONS[NAV.indexOf(item)];
            return <NavLink key={item.to} to={item.to} end={item.to === "/"} title={sidebarCollapsed ? item.label : undefined} aria-label={item.label}
              className={({ isActive }) => `group relative flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${sidebarCollapsed ? "justify-center" : "gap-3"} ${isActive ? "bg-white text-brand-900 shadow-sm" : "text-white/85 hover:bg-white/15 hover:text-white"}`}>
              <span aria-hidden="true" className="w-5 text-center text-lg leading-none">{icon}</span>
              {!sidebarCollapsed && item.label}
              {sidebarCollapsed && <span className="pointer-events-none absolute left-full z-40 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{NAV_LABELS[icon]}</span>}
            </NavLink>;
          })}
        </nav>
        {!sidebarCollapsed && <div className="border-t border-white/15 px-4 py-4 text-xs text-white/65">Phase 1 — Core Lifecycle MVP</div>}
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-teal-600 text-sm font-semibold text-white shadow-sm" aria-hidden="true">
              {user?.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <div className="max-w-[55vw] truncate text-sm font-semibold text-slate-900 sm:max-w-none">{user?.name || "Signed-in user"}</div>
              <span className="badge mt-0.5 bg-brand-50 text-brand-700">{user?.role}</span>
            </div>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={handleLogout}>Log out</button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
