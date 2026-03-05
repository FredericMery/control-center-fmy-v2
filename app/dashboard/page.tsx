"use client";

import { useState } from "react";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";

interface Card {
  id: string;
  title: string;
  emoji: string;
  description: string;
  color: string;
  link: string;
  action: string;
}

const cards: Card[] = [
  {
    id: "pro",
    title: "Pro",
    emoji: "💼",
    description: "Gérez vos tâches professionnelles",
    color: "from-blue-600 to-blue-400",
    link: "/dashboard/tasks?type=pro",
    action: "Voir les tâches",
  },
  {
    id: "perso",
    title: "Perso",
    emoji: "🎯",
    description: "Organisez votre vie personnelle",
    color: "from-purple-600 to-purple-400",
    link: "/dashboard/tasks?type=perso",
    action: "Voir les tâches",
  },
  {
    id: "memoire",
    title: "Mémoire",
    emoji: "📚",
    description: "Collectionnez vos souvenirs",
    color: "from-emerald-600 to-emerald-400",
    link: "/dashboard/memoire",
    action: "Accéder aux collections",
  },
  {
    id: "autre",
    title: "Autre",
    emoji: "⚙️",
    description: "Paramètres et notifications",
    color: "from-slate-600 to-slate-400",
    link: "/dashboard/settings",
    action: "Aller aux paramètres",
  },
];

export default function DashboardPage() {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const toggleFlip = (id: string) => {
    setFlipped((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-slate-900/80 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bienvenue</h1>
            <p className="text-sm text-gray-400">Qu'est-ce que tu veux faire ?</p>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {cards.map((card) => {
            const isFlipped = flipped[card.id] || false;

            return (
              <div
                key={card.id}
                className="h-48 cursor-pointer"
                onClick={() => toggleFlip(card.id)}
                style={{
                  perspective: "1000px",
                }}
              >
                <div
                  style={{
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                    transition: "transform 0.6s",
                  }}
                  className="w-full h-full"
                >
                  {/* Front Side */}
                  <div
                    style={{
                      backfaceVisibility: "hidden",
                    }}
                    className={`bg-gradient-to-br ${card.color} p-5 rounded-2xl shadow-2xl h-full flex flex-col justify-between`}
                  >
                    <div>
                      <div className="text-4xl mb-2">{card.emoji}</div>
                      <h2 className="text-2xl font-bold mb-1">{card.title}</h2>
                      <p className="text-white/80 text-xs">{card.description}</p>
                    </div>
                    <div className="text-xs text-white/60">Cliquez →</div>
                  </div>

                  {/* Back Side */}
                  <div
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                    className={`bg-gradient-to-br ${card.color} p-5 rounded-2xl shadow-2xl h-full flex flex-col justify-between absolute inset-0`}
                  >
                    <div className="flex-1 flex items-center">
                      <p className="text-white/90 text-xs leading-snug">
                        {card.title === "Pro"
                          ? "Organisez vos projets"
                          : card.title === "Perso"
                            ? "Vos objectifs"
                            : card.title === "Mémoire"
                              ? "Vos souvenirs"
                              : "Paramètres"}
                      </p>
                    </div>
                    <Link
                      href={card.link}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 px-4 py-2 rounded-full text-xs font-semibold transition-all inline-block text-center"
                    >
                      Accéder →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="border-t border-white/10 pt-6">
          <h3 className="text-sm font-semibold mb-4">Accès rapide</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link
              href="/dashboard/tasks?type=pro"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-3 transition-all hover:scale-105"
            >
              <div className="text-xl mb-1">💼</div>
              <p className="text-xs font-medium">Tâches Pro</p>
            </Link>
            <Link
              href="/dashboard/tasks?type=perso"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-3 transition-all hover:scale-105"
            >
              <div className="text-xl mb-1">🎯</div>
              <p className="text-xs font-medium">Tâches Perso</p>
            </Link>
            <Link
              href="/dashboard/memoire"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-3 transition-all hover:scale-105"
            >
              <div className="text-xl mb-1">📚</div>
              <p className="text-xs font-medium">Mémoire</p>
            </Link>
            <Link
              href="/dashboard/notifications"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-3 transition-all hover:scale-105"
            >
              <div className="text-xl mb-1">🔔</div>
              <p className="text-xs font-medium">Notifications</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
