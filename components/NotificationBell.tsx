"use client";

import { useEffect, useState } from "react";
import { useNotificationStore } from "@/store/notificationStore";

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAsRead,
  } = useNotificationStore();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-xl"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-zinc-900 border border-white/10 rounded-xl p-3 space-y-2 shadow-xl">
          {notifications.length === 0 && (
            <div className="text-xs text-gray-500">
              Aucune notification
            </div>
          )}

          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => markAsRead(notif.id)}
              className={`p-2 rounded-lg text-xs cursor-pointer transition ${
                notif.read
                  ? "bg-white/5 text-gray-400"
                  : "bg-indigo-600/20 text-white"
              }`}
            >
              <div className="font-medium">
                {notif.title}
              </div>
              <div className="text-[11px] opacity-70">
                {notif.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
