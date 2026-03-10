"use client";

import { useEffect, useState } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";

export default function NotificationPopup() {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    fetchNotifications,
    subscribeRealtime,
    unsubscribeRealtime
  } = useNotificationStore();
  const { user } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});

  // Show only unread notifications in the popup
  const unreadNotifications = notifications.filter((n) => !n.read);

  // Auto-open popup when new unread notification arrives
  useEffect(() => {
    if (unreadCount > 0 && isMinimized) {
      setIsMinimized(false);
      setIsOpen(true);

      // Auto-minimize after 5 seconds
      const timer = setTimeout(() => {
        setIsMinimized(true);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  // Fetch notifications and subscribe to realtime on mount
  useEffect(() => {
    if (user) {
      fetchNotifications();
      subscribeRealtime();
    }

    return () => {
      unsubscribeRealtime();
    };
  }, [user, fetchNotifications, subscribeRealtime, unsubscribeRealtime]);

  if (!user) return null;

  const handleAliasDecision = async (notifId: string, approve: boolean) => {
    const notif = notifications.find((n) => n.id === notifId);
    if (!notif?.ref_key?.startsWith("alias-review-")) {
      await markAsRead(notifId);
      return;
    }

    const requestId = notif.ref_key.replace("alias-review-", "").trim();
    if (!requestId) {
      await markAsRead(notifId);
      return;
    }

    setProcessingIds((prev) => ({ ...prev, [notifId]: true }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        console.error("No auth token for alias decision");
        return;
      }

      const response = await fetch("/api/settings/email-aliases/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          action: approve ? "approve" : "reject",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.error("Alias decision failed", payload);
        return;
      }

      await markAsRead(notifId);
      await fetchNotifications();
    } catch (error) {
      console.error("Alias decision error", error);
    } finally {
      setProcessingIds((prev) => {
        const copy = { ...prev };
        delete copy[notifId];
        return copy;
      });
    }
  };

  return (
    <>
      {/* 🔔 FLOATING NOTIFICATION BUTTON */}
      {isMinimized && (
        <button
          onClick={() => {
            setIsMinimized(false);
            setIsOpen(true);
          }}
          className="fixed bottom-6 right-6 z-[9999] w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl flex items-center justify-center text-2xl hover:scale-110 active:scale-95 transition-transform"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white animate-pulse shadow-lg">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* 📦 NOTIFICATION POPUP */}
      {!isMinimized && (
        <div
          className="fixed bottom-6 right-6 z-[9999] w-[400px] bg-zinc-900/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden"
          style={{
            animation: "slideInUp 0.3s ease-out",
          }}
        >
          {/* HEADER */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🔔</div>
              <div>
                <h3 className="text-white font-semibold text-sm">
                  Notifications
                </h3>
                <p className="text-gray-400 text-xs">
                  {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsMinimized(true)}
              className="text-gray-400 hover:text-white transition"
            >
              ✕
            </button>
          </div>

          {/* CONTENT */}
          <div className="max-h-[500px] overflow-y-auto p-4 space-y-3">
            {unreadNotifications.length === 0 && (
              <div className="text-center py-10 text-gray-500 text-sm">
                Aucune notification non lue
              </div>
            )}

            {unreadNotifications.map((notif, index) => (
              <div
                key={notif.id}
                className="bg-indigo-600/20 backdrop-blur-sm rounded-2xl p-4 hover:bg-indigo-600/30 transition-all cursor-pointer border border-indigo-500/20"
                onClick={() => markAsRead(notif.id)}
                style={{
                  animation: `fadeInScale 0.3s ease-out ${index * 0.05}s forwards`,
                  opacity: 0,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{getNotificationIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium text-sm">
                      {notif.title}
                    </div>
                    <div className="text-gray-300 text-xs mt-1 line-clamp-2">
                      {notif.message}
                    </div>
                    {notif.type === "alias_review" && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleAliasDecision(notif.id, true);
                          }}
                          disabled={Boolean(processingIds[notif.id])}
                          className="px-2 py-1 rounded-md text-[11px] bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
                        >
                          Valider
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleAliasDecision(notif.id, false);
                          }}
                          disabled={Boolean(processingIds[notif.id])}
                          className="px-2 py-1 rounded-md text-[11px] bg-zinc-700 text-white hover:bg-zinc-600 disabled:opacity-60"
                        >
                          Refuser
                        </button>
                      </div>
                    )}
                    <div className="text-gray-500 text-[10px] mt-2">
                      {formatTimestamp(notif.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* FOOTER */}
          <div className="px-6 py-3 border-t border-white/10 flex justify-between items-center">
            <button
              onClick={() => {
                unreadNotifications.forEach((notif) => markAsRead(notif.id));
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              Tout marquer comme lu
            </button>

            <button
              onClick={() => (window.location.href = "/dashboard/notifications")}
              className="text-xs text-gray-400 hover:text-white transition"
            >
              Voir tout →
            </button>
          </div>
        </div>
      )}

      {/* ANIMATIONS */}
      <style jsx global>{`
        @keyframes slideInUp {
          from {
            transform: translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes fadeInScale {
          from {
            transform: scale(0.9);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case "alias_review":
      return "✉️";
    case "deadline":
      return "⏰";
    case "summary":
      return "📊";
    case "tomorrow":
      return "📅";
    case "info":
      return "✅";
    case "debug":
      return "🔥";
    default:
      return "🔔";
  }
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;

  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
