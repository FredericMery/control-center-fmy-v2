"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";

export default function NotificationBell() {

  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAsRead,
    subscribeRealtime, // ✅ IMPORTANT
  } = useNotificationStore();

  const user = useAuthStore((s) => s.user);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const memoFetch = useCallback(() => {
    if (!user) return;
    fetchNotifications();
  }, [user, fetchNotifications]);

  const memoSubscribe = useCallback(() => {
    if (!user) return;
    subscribeRealtime();
  }, [user, subscribeRealtime]);

  /* ============================
     LOAD + REALTIME
  =============================*/
  useEffect(() => {
    if (!user) return;

    memoFetch();
    memoSubscribe();

  }, [user, memoFetch, memoSubscribe]);

  /* ============================
     CLOSE ON OUTSIDE CLICK
  =============================*/
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>

      {/* 🔔 BUTTON */}
      <button
        onClick={() => setOpen(!open)}
        className="relative text-xl hover:scale-105 transition-transform"
      >
        🔔

        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-[10px] w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* 📦 DROPDOWN */}
      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-zinc-900 border border-white/10 rounded-2xl p-3 space-y-3 shadow-2xl backdrop-blur-xl z-50">

          <div className="flex justify-between items-center px-1">
            <span className="text-xs text-gray-400">Notifications</span>
            <button
              onClick={() => fetchNotifications()}
              className="text-xs text-gray-500 hover:text-white transition"
              title="Rafraîchir"
            >
              🔄
            </button>
          </div>

          {notifications.length === 0 && (
            <div className="text-xs text-gray-500 px-2 py-3">
              Aucune notification
            </div>
          )}

          {/* 🔔 LIST */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {notifications.slice(0, 5).map((notif) => (
              <div
                key={notif.id}
                onClick={() => markAsRead(notif.id)}
                className={`p-3 rounded-xl text-xs cursor-pointer transition ${
                  notif.read
                    ? "bg-white/5 text-gray-400"
                    : "bg-indigo-600/20 text-white hover:bg-indigo-600/30"
                }`}
              >
                <div className="font-medium">
                  {notif.title}
                </div>
                <div className="text-[11px] opacity-70 mt-1">
                  {notif.message}
                </div>
              </div>
            ))}
          </div>

          {/* 🔽 FOOTER */}
          <div className="pt-3 border-t border-white/10 text-center">
            <Link
              href="/dashboard/notifications"
              className="text-xs text-indigo-400 hover:underline"
              onClick={() => setOpen(false)}
            >
              Voir toutes les notifications →
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}
