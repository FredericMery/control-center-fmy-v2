"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import { getOcrUsageCountThisMonth } from "@/lib/ocrUsage";

interface Card {
  id: string;
  title: string;
  icon: string;
  bgColor: string;
  textColor: string;
  link: string;
}

const cards: Card[] = [
  {
    id: "pro",
    title: "Pro",
    icon: "💼",
    bgColor: "bg-blue-600/10",
    textColor: "text-blue-400",
    link: "/dashboard/tasks?type=pro",
  },
  {
    id: "perso",
    title: "Perso",
    icon: "🎯",
    bgColor: "bg-purple-600/10",
    textColor: "text-purple-400",
    link: "/dashboard/tasks?type=perso",
  },
  {
    id: "memoire",
    title: "Mémoire",
    icon: "📚",
    bgColor: "bg-emerald-600/10",
    textColor: "text-emerald-400",
    link: "/dashboard/memoire",
  },
  {
    id: "autre",
    title: "Paramètres",
    icon: "⚙️",
    bgColor: "bg-slate-600/10",
    textColor: "text-slate-400",
    link: "/dashboard/settings",
  },
];

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { tasks, fetchTasks } = useTaskStore();
  const [ocrMonthCount, setOcrMonthCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  useEffect(() => {
    setOcrMonthCount(getOcrUsageCountThisMonth());
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-slate-900/80 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Control Center</h1>
            <p className="text-xs text-gray-400">Vue d'ensemble</p>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Main Content - Centered */}
      <div className="flex-1 flex items-center justify-center px-4 py-4">
        <div className="w-full max-w-md space-y-4">
          
          {/* Mini Dashboard */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">Pro à lancer</p>
              <p className="text-xl font-bold text-blue-400">{proTodoCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">Perso à lancer</p>
              <p className="text-xl font-bold text-purple-400">{persoTodoCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">Clôturées aujourd'hui</p>
              <p className="text-xl font-bold text-emerald-400">{todayDoneCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase mb-1">Mémoires actives</p>
              <p className="text-xl font-bold text-amber-400">{memoireCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 col-span-2">
              <p className="text-[10px] text-gray-400 uppercase mb-1">Appels API Vision (mois)</p>
              <p className="text-xl font-bold text-indigo-400">{ocrMonthCount}</p>
            </div>
          </div>

          {/* 4 Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className={`${card.bgColor} border border-white/10 backdrop-blur-sm rounded-xl p-4 transition-all flex flex-col justify-between aspect-square`}
              >
                <Link
                  href={card.link}
                  className="flex-1 flex flex-col items-center justify-center group"
                >
                  <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">{card.icon}</div>
                  <p className={`text-sm font-semibold ${card.textColor}`}>{card.title}</p>
                </Link>

                <div className="flex items-center justify-center mt-2 min-h-8">
                  {(card.id === "pro" || card.id === "perso") && (
                    <Link
                      href={`/dashboard/tasks?type=${card.id}&new=1`}
                      className="h-8 w-8 rounded-full bg-white/90 text-slate-900 shadow-lg shadow-black/20 hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-xl font-semibold"
                      aria-label={`Ajouter une tâche ${card.title}`}
                    >
                      +
                    </Link>
                  )}

                  {card.id === "memoire" && (
                    <Link
                      href="/dashboard/memoire"
                      className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-200 border border-emerald-300/40 hover:bg-emerald-400/30 transition-all"
                    >
                      Accès
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
