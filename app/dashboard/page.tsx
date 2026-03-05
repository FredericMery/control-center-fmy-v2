"use client";

import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";

interface Card {
  id: string;
  title: string;
  emoji: string;
  color: string;
  link: string;
}

const cards: Card[] = [
  {
    id: "pro",
    title: "Pro",
    emoji: "💼",
    color: "from-blue-600 to-blue-500",
    link: "/dashboard/tasks?type=pro",
  },
  {
    id: "perso",
    title: "Perso",
    emoji: "🎯",
    color: "from-purple-600 to-purple-500",
    link: "/dashboard/tasks?type=perso",
  },
  {
    id: "memoire",
    title: "Mémoire",
    emoji: "📚",
    color: "from-emerald-600 to-emerald-500",
    link: "/dashboard/memoire",
  },
  {
    id: "autre",
    title: "Autre",
    emoji: "⚙️",
    color: "from-slate-600 to-slate-500",
    link: "/dashboard/settings",
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-slate-900/80 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Control Center</h1>
            <p className="text-xs text-gray-400">Choisissez une section</p>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Main Content - Centered */}
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">
          <div className="grid grid-cols-2 gap-4">
            {cards.map((card) => (
              <Link
                key={card.id}
                href={card.link}
                className={`bg-gradient-to-br ${card.color} rounded-2xl p-6 shadow-xl hover:scale-105 active:scale-95 transition-transform flex flex-col items-center justify-center aspect-square`}
              >
                <div className="text-5xl mb-3">{card.emoji}</div>
                <p className="text-lg font-bold">{card.title}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
