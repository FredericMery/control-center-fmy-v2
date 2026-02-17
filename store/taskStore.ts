import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "./authStore";

type Task = {
  id: string;
  user_id: string;
  title: string;
  type: "pro" | "perso";
  status: string;
  deadline: string | null;
  archived: boolean;
};

type TaskState = {
  tasks: Task[];
  activeType: "pro" | "perso";
  showArchived: boolean;

  fetchTasks: () => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  setActiveType: (type: "pro" | "perso") => void;
  toggleArchivedView: () => void;

  subscribeRealtime: () => void;
  unsubscribeRealtime: () => void;
};

let channel: ReturnType<typeof supabase.channel> | null = null;

export const useTaskStore = create<TaskState>((set, get) => ({

  tasks: [],
  activeType: "pro",
  showArchived: false,

  /* ============================
     FETCH
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
     UPDATE STATUS
  =============================*/
  updateStatus: async (id, status) => {
    await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id);

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status } : t
      ),
    }));
  },

  /* ============================
     DELETE
  =============================*/
  deleteTask: async (id) => {
    await supabase
      .from("tasks")
      .delete()
      .eq("id", id);

    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
  },

  /* ============================
     UI STATE
  =============================*/
  setActiveType: (type) => set({ activeType: type }),

  toggleArchivedView: () =>
    set((state) => ({ showArchived: !state.showArchived })),

  /* ============================
     REALTIME SAFE
  =============================*/
  subscribeRealtime: () => {

    const user = useAuthStore.getState().user;
    if (!user) return;

    if (channel) return; // 🔥 anti multi subscribe

    channel = supabase
      .channel(`tasks-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {

          set((state) => {

            const newTask = payload.new as Task;
            const oldTask = payload.old as Task;

            switch (payload.eventType) {

              case "INSERT":
                if (state.tasks.some(t => t.id === newTask.id)) {
                  return state;
                }
                return { tasks: [newTask, ...state.tasks] };

              case "UPDATE":
                return {
                  tasks: state.tasks.map(t =>
                    t.id === newTask.id ? newTask : t
                  ),
                };

              case "DELETE":
                return {
                  tasks: state.tasks.filter(t =>
                    t.id !== oldTask.id
                  ),
                };

              default:
                return state;
            }
          });

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
