import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "./authStore";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  type: "pro" | "perso";
  status: string;
  deadline: string | null;
  archived: boolean;
  created_at?: string;
};

type TaskState = {
  tasks: Task[];
  activeType: "pro" | "perso";
  showArchived: boolean;

  fetchTasks: () => Promise<void>;
  addTask: (title: string, type: "pro" | "perso", deadline: Date | null) => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  setActiveType: (type: "pro" | "perso") => void;
  toggleArchivedView: () => void;

  subscribeRealtime: () => void;
  unsubscribeRealtime: () => void;
};

let channel: ReturnType<typeof supabase.channel> | null = null;

export const useTaskStore = create<TaskState>((set) => ({

  tasks: [],
  activeType: "pro",
  showArchived: false,

  /* ============================
     FETCH (REMPLACE TOUJOURS)
  =============================*/
  fetchTasks: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    set({ tasks: data || [] });
  },

  /* ============================
     ADD TASK
  =============================*/
  addTask: async (title, type, deadline) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data: newTask } = await supabase
      .from("tasks")
      .insert([
        {
          user_id: user.id,
          title,
          type,
          status: "pending",
          deadline: deadline ? deadline.toISOString().split("T")[0] : null,
          archived: false,
        },
      ])
      .select()
      .single();

    if (newTask) {
      set((state) => ({ tasks: [newTask, ...state.tasks] }));
    }
  },

  /* ============================
     UPDATE STATUS
  =============================*/
  updateStatus: async (id, status) => {
    await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id);
  },

  /* ============================
     DELETE
  =============================*/
  deleteTask: async (id) => {
    await supabase
      .from("tasks")
      .delete()
      .eq("id", id);
  },

  /* ============================
     UI STATE
  =============================*/
  setActiveType: (type) => set({ activeType: type }),

  toggleArchivedView: () =>
    set((state) => ({ showArchived: !state.showArchived })),

  /* ============================
     REALTIME (SANS INSERT)
  =============================*/
  subscribeRealtime: () => {

    const user = useAuthStore.getState().user;
    if (!user) return;

    // 🔥 Nettoyage ancien channel
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }

    channel = supabase
      .channel(`tasks-${user.id}`)

      // 🔄 UPDATE uniquement
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          set((state) => ({
            tasks: state.tasks.map(t =>
              t.id === payload.new.id ? payload.new as Task : t
            ),
          }));
        }
      )

      // ❌ DELETE uniquement
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          set((state) => ({
            tasks: state.tasks.filter(t =>
              t.id !== payload.old.id
            ),
          }));
        }
      )

      .subscribe();
  },

  unsubscribeRealtime: () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  },

}));
