"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import NotificationPopup from "@/components/NotificationPopup";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

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
          Chargement...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 backdrop-blur-xl bg-black/70">
        <div className="flex items-center justify-between max-w-5xl mx-auto px-6 py-4">
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg">
              +
            </div>
            <span className="font-semibold tracking-wide text-sm opacity-90">
              H+ Control
            </span>
          </div>

          <nav className="flex gap-6 text-sm">
            <Link
              href="/dashboard"
              className={`transition ${
                pathname === "/dashboard"
                  ? "text-indigo-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Tasks
            </Link>

            <Link
              href="/dashboard/memoire"
              className={`transition ${
                pathname.startsWith("/dashboard/memoire")
                  ? "text-indigo-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Mémoire
            </Link>

            <Link
              href="/dashboard/settings"
              className={`transition ${
                pathname.startsWith("/dashboard/settings")
                  ? "text-indigo-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-6 pt-8 pb-24">
        {children}
      </main>

      {/* 🔔 NOTIFICATION POPUP */}
      <NotificationPopup />
    </div>
  );
}
