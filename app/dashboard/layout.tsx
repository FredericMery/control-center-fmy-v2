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
    <div className="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top,_#16324a_0%,_#0f172a_40%,_#020617_100%)] text-white">

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-cyan-200/10 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
          
          <Link href="/dashboard" className="flex items-center gap-3 transition hover:opacity-90">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-400/15 font-bold text-cyan-200 shadow-lg shadow-cyan-950/40">
              CC
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-white">Control Center</span>
              <p className="text-[11px] text-slate-400">{t('nav.control')}</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <nav className="flex max-w-[52vw] items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-slate-900/70 p-1 text-sm sm:max-w-none">
              <Link
                href="/dashboard"
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium transition sm:px-3 ${
                  pathname === "/dashboard"
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {t('nav.tasks')}
              </Link>

              <Link
                href="/dashboard/memoire"
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium transition sm:px-3 ${
                  pathname.startsWith("/dashboard/memoire")
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {t('nav.memory')}
              </Link>

              <Link
                href="/dashboard/settings"
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium transition sm:px-3 ${
                  pathname.startsWith("/dashboard/settings")
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {t('nav.settings')}
              </Link>
            </nav>

            {pathname !== "/dashboard" && (
              <Link
                href="/dashboard"
                className="shrink-0 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-400/20 hover:text-white"
              >
                {t('common.home')}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
