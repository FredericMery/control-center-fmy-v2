"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialize: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>(
  persist(
    (set) => ({
      user: null,
      loading: true,

      initialize: () => {
        // Get initial session from localStorage or Supabase
        supabase.auth.getSession().then(({ data }) => {
          set({
            user: data.session?.user ?? null,
            loading: false,
          });
        });

        // Listen to auth changes
        supabase.auth.onAuthStateChange((_event, session) => {
          set({
            user: session?.user ?? null,
            loading: false,
          });
        });
      },

      signIn: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          alert(error.message);
          throw error;
        }
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null });
      },
    }),
    {
      name: "auth-storage", // localStorage key
      partialize: (state) => ({ user: state.user }), // Only persist user
    }
  )
);
