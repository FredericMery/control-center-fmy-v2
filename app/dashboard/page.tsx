"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  const [activeMemoryCount, setActiveMemoryCount] = useState(0);
  const [enabledModules, setEnabledModules] = useState<DashboardModuleId[]>([]);
  const [recentMemoryItems, setRecentMemoryItems] = useState<Array<{
    id: string;
    item_title: string;
    created_at: string;
    section_id: string;
    section_name: string;
  }>>([]);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const swipeStartRef = useRef<{ id: string; x: number } | null>(null);
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

  useEffect(() => {
    const fetchRecentMemoryItems = async () => {
      if (!user) return;

      const [{ data: sectionRows, error: sectionsError }, { data: itemRows, error: itemsError }] = await Promise.all([
        supabase
          .from('memory_sections')
          .select('id, section_name')
          .eq('user_id', user.id),
        supabase
          .from('memory_items')
          .select('id, item_title, created_at, section_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      if (sectionsError || itemsError) {
        console.error('Erreur chargement entrees memoire dashboard:', sectionsError || itemsError);
        return;
      }

      const sectionNameById = new Map((sectionRows || []).map((row) => [row.id, row.section_name || 'Memoire']));
      const merged = (itemRows || [])
        .filter((row) => sectionNameById.has(row.section_id))
        .map((row) => ({
          ...row,
          section_name: sectionNameById.get(row.section_id) || 'Memoire',
        }));

      setRecentMemoryItems(merged);
    };

    fetchRecentMemoryItems();
  }, [user, tasks.length]);

  useEffect(() => {
    const fetchMemoryCount = async () => {
      if (!user) return;

      const { count } = await supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setActiveMemoryCount(count || 0);
    };

    fetchMemoryCount();
  }, [user, recentMemoryItems.length]);

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

  const cards = useMemo(() => {
    const enabled = new Set(enabledModules);
    const selected = DASHBOARD_MODULES.filter((module) => enabled.has(module.id));
    return selected.length > 0 ? selected : DASHBOARD_MODULES;
  }, [enabledModules]);

  const formatRelativeDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(language, { day: '2-digit', month: 'short' }).format(date);
  };

  const getModuleBadge = (moduleId: DashboardModuleId) => {
    if (moduleId === 'pro') return { value: proTodoCount, label: t('dashboard.proToLaunch') };
    if (moduleId === 'perso') return { value: persoTodoCount, label: t('dashboard.persoToLaunch') };
    if (moduleId === 'memoire') return { value: activeMemoryCount, label: t('dashboard.activeMemories') };
    return { value: visionCountMonth, label: t('dashboard.visionCalls', { month: monthName }) };
  };

  const resetSwipe = (id: string) => {
    setSwipeOffsets((prev) => ({ ...prev, [id]: 0 }));
  };

  const onSwipeStart = (id: string, x: number) => {
    swipeStartRef.current = { id, x };
    if (armedDeleteId && armedDeleteId !== id) {
      setArmedDeleteId(null);
    }
  };

  const onSwipeMove = (id: string, x: number) => {
    if (!swipeStartRef.current || swipeStartRef.current.id !== id) return;
    const delta = x - swipeStartRef.current.x;
    const next = Math.min(0, Math.max(-112, delta));
    setSwipeOffsets((prev) => ({ ...prev, [id]: next }));
  };

  const onSwipeEnd = (id: string) => {
    const currentOffset = swipeOffsets[id] || 0;
    if (currentOffset <= -72) {
      setArmedDeleteId(id);
      setSwipeOffsets((prev) => ({ ...prev, [id]: -96 }));
    } else {
      if (armedDeleteId === id) {
        setArmedDeleteId(null);
      }
      resetSwipe(id);
    }
    swipeStartRef.current = null;
  };

  const deleteRecentMemoryItem = async (itemId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('memory_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Erreur suppression entree memoire:', error);
      return;
    }

    setRecentMemoryItems((prev) => prev.filter((entry) => entry.id !== itemId));
    setArmedDeleteId(null);
  };

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-2xl border border-cyan-200/10 bg-gradient-to-r from-slate-900/80 via-slate-900/70 to-cyan-950/50 p-4 shadow-[0_30px_70px_-40px_rgba(8,145,178,0.9)] sm:rounded-3xl sm:p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">{t('dashboard.overview')}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Control Center</h1>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('dashboard.proToLaunch')}</p>
              <p className="text-xl font-semibold text-cyan-200">{proTodoCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('dashboard.persoToLaunch')}</p>
              <p className="text-xl font-semibold text-blue-200">{persoTodoCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('dashboard.closedToday')}</p>
              <p className="text-xl font-semibold text-emerald-200">{todayDoneCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('dashboard.visionCalls', { month: monthName })}</p>
              <p className="text-xl font-semibold text-amber-100">{visionCountMonth}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {cards.map((card) => {
            const badge = getModuleBadge(card.id);
            return (
              <article
                key={card.id}
                className={`group relative overflow-hidden rounded-2xl border border-white/10 ${card.bgColor} p-3 shadow-lg shadow-slate-950/30 transition hover:-translate-y-0.5 hover:border-white/20 sm:p-4`}
              >
                <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                <Link href={card.link} className="relative block">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`text-xl sm:text-2xl ${card.textColor}`}>{card.icon}</div>
                    <span className="rounded-full border border-white/20 bg-slate-950/55 px-2.5 py-1 text-xs font-semibold text-white">
                      {badge.value}
                    </span>
                  </div>
                  <p className="mt-5 text-sm font-semibold text-white sm:mt-6 sm:text-base">{card.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-300">{badge.label}</p>
                </Link>

                <div className="relative mt-3 min-h-8">
                  {(card.id === 'pro' || card.id === 'perso') && (
                    <Link
                      href={`/dashboard/tasks?type=${card.id}&new=1`}
                      className="inline-flex min-h-9 items-center rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-400 sm:px-3 sm:text-xs"
                      aria-label={t('dashboard.addTaskAria', { title: card.title })}
                    >
                      + Nouvelle tache
                    </Link>
                  )}

                  {card.id === 'memoire' && (
                    <Link
                      href="/dashboard/memoire/quick-add"
                      className="inline-flex min-h-9 items-center rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-emerald-400 sm:px-3 sm:text-xs"
                    >
                      Ajouter
                    </Link>
                  )}

                  {card.id === 'expenses' && (
                    <Link
                      href="/expenses"
                      className="inline-flex min-h-9 items-center rounded-lg bg-amber-400 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-amber-300 sm:px-3 sm:text-xs"
                    >
                      {t('dashboard.capture')}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-3 sm:gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-slate-900/55 p-4 lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Focus taches</p>
              <Link href="/dashboard/tasks" className="text-xs text-cyan-200 hover:text-cyan-100">
                Ouvrir la liste
              </Link>
            </div>

            <div className="space-y-2">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-cyan-100">Pro</p>
                  <span className="rounded-full bg-cyan-950/70 px-2 py-0.5 text-xs font-semibold text-cyan-100">{proTodoCount}</span>
                </div>
                <p className="mt-2 text-sm text-slate-200">Pipeline professionnel a traiter en priorite.</p>
              </div>
              <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-blue-100">Perso</p>
                  <span className="rounded-full bg-blue-950/70 px-2 py-0.5 text-xs font-semibold text-blue-100">{persoTodoCount}</span>
                </div>
                <p className="mt-2 text-sm text-slate-200">Actions personnelles en attente d execution.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/55 p-3 sm:p-4 lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Dernieres entrees memoire</p>
              <Link href="/dashboard/memoire/quick-add" className="text-xs text-emerald-200 hover:text-emerald-100">
                + Ajouter
              </Link>
            </div>
            <p className="mb-2 text-[11px] text-slate-400">Glisse vers la gauche pour supprimer.</p>

            {recentMemoryItems.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-400">Aucune entree manuelle pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {recentMemoryItems.map((entry) => {
                  const translateX = swipeOffsets[entry.id] || 0;
                  const showDelete = armedDeleteId === entry.id;

                  return (
                    <div key={entry.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-950/40">
                      <button
                        type="button"
                        onClick={() => deleteRecentMemoryItem(entry.id)}
                        className={`absolute inset-y-0 right-0 w-24 bg-rose-600 text-xs font-semibold text-white transition ${
                          showDelete ? 'opacity-100' : 'opacity-70'
                        }`}
                      >
                        Supprimer
                      </button>

                      <div
                        className="relative z-10 cursor-grab touch-pan-y bg-slate-900/85 px-3 py-2 active:cursor-grabbing"
                        style={{ transform: `translateX(${translateX}px)`, transition: swipeStartRef.current?.id === entry.id ? 'none' : 'transform 180ms ease' }}
                        onTouchStart={(event) => onSwipeStart(entry.id, event.touches[0].clientX)}
                        onTouchMove={(event) => onSwipeMove(entry.id, event.touches[0].clientX)}
                        onTouchEnd={() => onSwipeEnd(entry.id)}
                        onMouseDown={(event) => onSwipeStart(entry.id, event.clientX)}
                        onMouseMove={(event) => onSwipeMove(entry.id, event.clientX)}
                        onMouseUp={() => onSwipeEnd(entry.id)}
                        onClick={() => {
                          if (armedDeleteId === entry.id) {
                            resetSwipe(entry.id);
                            setArmedDeleteId(null);
                          }
                        }}
                        onMouseLeave={() => {
                          if (swipeStartRef.current?.id === entry.id) onSwipeEnd(entry.id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-white">{entry.item_title}</p>
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{formatRelativeDate(entry.created_at)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">{entry.section_name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
