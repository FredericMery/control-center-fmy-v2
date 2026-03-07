"use client";

import { useEffect } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/authStore";
import { useI18n } from "@/components/providers/LanguageProvider";

export default function NotificationsPage() {
  const { t } = useI18n();

  const {
    notifications,
    fetchNotifications,
    markAsRead
  } = useNotificationStore();

  const { user, loading } = useAuthStore();

  useEffect(() => {
    // Only fetch notifications when auth is ready and user exists
    if (!loading && user) {
      fetchNotifications();
    }
  }, [user, loading, fetchNotifications]);

  return (
    <div className="min-h-screen bg-black text-white px-6 py-10">

      <h1 className="text-xl font-light mb-8">
        {t('notifications.center')}
      </h1>

      {loading && (
        <div className="text-gray-400">{t('common.loading')}</div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="text-gray-400">{t('notifications.none')}</div>
      )}

      <div className="space-y-4 max-w-2xl">

        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`p-5 rounded-2xl ${
              notif.read
                ? "bg-white/5"
                : "bg-indigo-600/20"
            }`}
          >
            <div className="font-medium">
              {notif.title}
            </div>

            <div className="text-sm opacity-70 mt-2">
              {notif.message}
            </div>

            {!notif.read && (
              <button
                onClick={() => markAsRead(notif.id)}
                className="mt-4 text-xs underline"
              >
                {t('notifications.markRead')}
              </button>
            )}
          </div>
        ))}

      </div>
    </div>
  );
}
