import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "./authStore";

export type Notification = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  created_at: string;
};

type NotificationState = {
  notifications: Notification[];
  unreadCount: number;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  createNotification: (
    title: string,
    message: string,
    link?: string
  ) => Promise<void>;
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  fetchNotifications: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const unread = data?.filter((n) => !n.read).length || 0;

    set({
      notifications: data || [],
      unreadCount: unread,
    });
  },

  markAsRead: async (id) => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );

      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });
  },

  createNotification: async (title, message, link) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    await supabase.from("notifications").insert({
      user_id: user.id,
      title,
      message,
      link: link || null,
      read: false,
    });

    await get().fetchNotifications();
  },
}));
