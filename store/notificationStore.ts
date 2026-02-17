import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "./authStore";

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  ref_key?: string;
  created_at?: string;
};

type NotificationState = {
  notifications: Notification[];
  unreadCount: number;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  subscribeRealtime: () => void;
  unsubscribeRealtime: () => void;
};

let channel: ReturnType<typeof supabase.channel> | null = null;

export const useNotificationStore = create<NotificationState>((set, get) => ({

  notifications: [],
  unreadCount: 0,

  /* ============================
     FETCH INITIAL DATA
  =============================*/
  fetchNotifications: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    set({
      notifications: data || [],
      unreadCount: data?.filter(n => !n.read).length || 0
    });
  },

  /* ============================
     MARK AS READ
  =============================*/
  markAsRead: async (id) => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    set((state) => {
      const updated = state.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      );

      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.read).length
      };
    });
  },

  /* ============================
     REALTIME SUBSCRIBE SAFE
  =============================*/
  subscribeRealtime: () => {

    const user = useAuthStore.getState().user;
    if (!user) return;

    // 🔥 Protection totale multi subscribe
    if (channel) return;

    channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {

          set((state) => {

            // 🔥 Protection anti doublon
            if (state.notifications.some(n => n.id === payload.new.id)) {
              return state;
            }

            const updated = [payload.new as Notification, ...state.notifications];

            return {
              notifications: updated,
              unreadCount: updated.filter(n => !n.read).length
            };
          });

        }
      )
      .subscribe();
  },

  /* ============================
     CLEANUP (IMPORTANT)
  =============================*/
  unsubscribeRealtime: () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  },

}));
