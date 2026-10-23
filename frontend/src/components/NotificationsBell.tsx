import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Notification } from "../types";

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter((n) => !n.read && !n.resolvedAt).length;

  async function markAllRead() {
    await api.post("/notifications/read-all");
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="relative">
      <button
        className="relative rounded-full p-2 hover:bg-slate-100"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 card p-3 z-20 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Alerts</h3>
            <button className="text-xs text-brand-600 hover:underline" onClick={markAllRead}>
              Mark all read
            </button>
          </div>
          {notifications.length === 0 && <p className="text-xs text-slate-400">No alerts yet.</p>}
          <button className="mb-2 text-xs text-brand-600 hover:underline" onClick={() => { setOpen(false); navigate("/alerts"); }}>View all alerts</button>
          <ul className="space-y-2">
            {notifications.filter((item) => !item.resolvedAt).slice(0, 5).map((n) => (
              <li key={n.id} className={`text-xs p-2 rounded ${n.read ? "bg-slate-50" : "bg-brand-50"}`}>
                <div className="font-medium text-slate-700">{n.type.replace(/_/g, " ")}</div>
                <div className="text-slate-600">{n.message}</div>
                <div className="text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
