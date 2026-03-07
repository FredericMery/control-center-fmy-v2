"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import { getMonthNameFr } from "@/lib/monthHelper";
import { supabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/providers/LanguageProvider";
import {
  DASHBOARD_MODULES,
  loadEnabledDashboardModules,
  type DashboardModuleId,
} from "@/lib/modules/dashboardModules";

export default function DashboardPage() {
  const { t, language } = useI18n();
  const user = useAuthStore((state) => state.user);
  const { tasks, fetchTasks } = useTaskStore();
  const [visionCountMonth, setVisionCountMonth] = useState(0);
  const [enabledModules, setEnabledModules] = useState<DashboardModuleId[]>([]);
  const monthName =
    language === 'fr'
      ? getMonthNameFr()
      : new Intl.DateTimeFormat(language, { month: 'long' }).format(new Date());

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  useEffect(() => {
    setEnabledModules(loadEnabledDashboardModules());
  }, []);

  useEffect(() => {
    const fetchMonthlyStats = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Erreur récupération session:", error);
          return;
        }

        const token = data.session?.access_token;
        if (!token) return;

        const response = await fetch('/api/tracking/monthly-stats', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setVisionCountMonth(data.stats.google_vision || 0);
        }
      } catch (error) {
        console.error('Erreur récupération stats mois:', error);
      }
    };

    if (user) {
      fetchMonthlyStats();
    }
  }, [user]);

  const proTodoCount = useMemo(
    () => tasks.filter(t => t.type === "pro" && t.status === "todo" && !t.archived).length,
    [tasks]
  );

  const persoTodoCount = useMemo(
    () => tasks.filter(t => t.type === "perso" && t.status === "todo" && !t.archived).length,
    [tasks]
  );

  const todayDoneCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter(t => {
      if (t.status !== "done" || !t.created_at) return false;
      const createdDate = new Date(t.created_at);
      createdDate.setHours(0, 0, 0, 0);
      return createdDate.getTime() === today.getTime();
    }).length;
  }, [tasks]);

  // TODO: Récupérer le nombre de mémoires actives depuis Supabase
  const memoireCount = 0;

  const cards = useMemo(() => {
    const enabled = new Set(enabledModules);
    const selected = DASHBOARD_MODULES.filter((module) => enabled.has(module.id));
    return selected.length > 0 ? selected : DASHBOARD_MODULES;
  }, [enabledModules]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-slate-900/80 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Control Center</h1>
            <p className="text-xs text-gray-400">{t('dashboard.overview')}</p>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Main Content - Centered */}
      <div className="flex-1 flex items-center justify-center px-4 py-2">
        <div className="w-full max-w-md space-y-3">
          
          {/* Mini Dashboard */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">{t('dashboard.proToLaunch')}</p>
              <p className="text-xl font-bold text-blue-400">{proTodoCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">{t('dashboard.persoToLaunch')}</p>
              <p className="text-xl font-bold text-purple-400">{persoTodoCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">{t('dashboard.closedToday')}</p>
              <p className="text-xl font-bold text-emerald-400">{todayDoneCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">{t('dashboard.activeMemories')}</p>
              <p className="text-xl font-bold text-amber-400">{memoireCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 col-span-2">
              <p className="text-[10px] text-gray-400 uppercase mb-1">{t('dashboard.visionCalls', { month: monthName })}</p>
              <p className="text-xl font-bold text-indigo-400">{visionCountMonth}</p>
            </div>
          </div>

          {/* 4 Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className={`${card.bgColor} border border-white/10 backdrop-blur-sm rounded-xl p-3 transition-all flex flex-col justify-between aspect-square`}
              >
                <Link
                  href={card.link}
                  className="flex-1 flex flex-col items-center justify-center group"
                >
                  <div className="text-3xl mb-1 group-hover:scale-110 transition-transform">{card.icon}</div>
                  <p className={`text-xs font-semibold ${card.textColor}`}>{card.title}</p>
                </Link>

                <div className="flex items-center justify-center mt-2 min-h-7">
                  {(card.id === "pro" || card.id === "perso") && (
                    <Link
                      href={`/dashboard/tasks?type=${card.id}&new=1`}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/30 active:scale-95 transition-all flex items-center justify-center text-sm font-semibold"
                      aria-label={t('dashboard.addTaskAria', { title: card.title })}
                    >
                      +
                    </Link>
                  )}

                  {card.id === "memoire" && (
                    <Link
                      href="/dashboard/memoire"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-all"
                    >
                      {t('dashboard.access')}
                    </Link>
                  )}

                  {card.id === "expenses" && (
                    <Link
                      href="/expenses"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30 transition-all"
                    >
                      {t('dashboard.capture')}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
