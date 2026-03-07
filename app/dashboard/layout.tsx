"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/providers/LanguageProvider";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const checkSession = async () => {
      if (loading || !user) return;

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        await useAuthStore.getState().signOut();
        router.replace("/login");
      }
    };

    checkSession();
  }, [loading, user, router]);

  // 🔔 Check for overdue tasks on app launch
  useEffect(() => {
    if (!loading && user) {
      // Call the check-overdue API when app loads
      fetch("/api/notifications/check-overdue")
        .then((res) => res.json())
        .catch((err) => console.error("Failed to check overdue tasks:", err));
    }
  }, [user, loading]);

  // 🔥 IMPORTANT : PAS D’OVERLAY FIXED
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="animate-pulse text-indigo-500">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur-xl bg-slate-900/80">
        <div className="flex items-center justify-between max-w-5xl mx-auto px-6 py-4 w-full">
          
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg">
              ✓
            </div>
            <div>
              <span className="font-bold text-lg">H+</span>
              <p className="text-xs text-gray-400">{t('nav.control')}</p>
            </div>
          </Link>

          <nav className="flex gap-8 text-sm">
            <Link
              href="/dashboard"
              className={`font-medium transition ${
                pathname === "/dashboard"
                  ? "text-indigo-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              📋 {t('nav.tasks')}
            </Link>

            <Link
              href="/dashboard/memoire"
              className={`font-medium transition ${
                pathname.startsWith("/dashboard/memoire")
                  ? "text-indigo-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              📚 {t('nav.memory')}
            </Link>

            <Link
              href="/dashboard/settings"
              className={`font-medium transition ${
                pathname.startsWith("/dashboard/settings")
                  ? "text-indigo-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              ⚙️ {t('nav.settings')}
            </Link>
          </nav>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
