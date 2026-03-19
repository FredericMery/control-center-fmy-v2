"use client";

import type { MailItem } from "@/types/mail";
import { MAIL_TYPE_ICONS, MAIL_TYPE_LABELS } from "@/types/mail";

interface StatsData {
  stats: {
    total: number;
    recu: number;
    en_cours: number;
    traite: number;
    clos: number;
    urgent: number;
    action_required: number;
    overdue: number;
  };
  by_type: Record<string, number>;
  top_senders: { name: string; count: number }[];
}

interface Props {
  data: StatsData | null;
  loading: boolean;
  onFilterAction: () => void;
  onFilterOverdue: () => void;
  onFilterUrgent: () => void;
}

export default function MailStatsPanel({
  data,
  loading,
  onFilterAction,
  onFilterOverdue,
  onFilterUrgent,
}: Props) {
  if (loading || !data) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-800/50" />
        ))}
      </div>
    );
  }

  const { stats, by_type, top_senders } = data;

  const summary = [
    { label: "Total", value: stats.total, color: "text-slate-200", bg: "bg-slate-800/60" },
    { label: "Reçus", value: stats.recu, color: "text-blue-300", bg: "bg-blue-400/10" },
    { label: "En cours", value: stats.en_cours, color: "text-violet-300", bg: "bg-violet-400/10" },
    { label: "Traités", value: stats.traite, color: "text-emerald-300", bg: "bg-emerald-400/10" },
    { label: "Clos", value: stats.clos, color: "text-slate-400", bg: "bg-slate-700/40" },
  ];

  const alerts = [
    {
      label: "Action requise",
      value: stats.action_required,
      color: "text-orange-300",
      bg: "bg-orange-400/10 border-orange-400/20",
      icon: "⚡",
      onClick: onFilterAction,
    },
    {
      label: "En retard",
      value: stats.overdue,
      color: "text-red-300",
      bg: "bg-red-400/10 border-red-400/20",
      icon: "⏰",
      onClick: onFilterOverdue,
    },
    {
      label: "Urgents",
      value: stats.urgent,
      color: "text-red-300",
      bg: "bg-red-400/10 border-red-400/20",
      icon: "🔴",
      onClick: onFilterUrgent,
    },
  ].filter((a) => a.value > 0);

  // Tri des types par fréquence
  const topTypes = Object.entries(by_type)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Résumé chiffres */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {summary.map((s) => (
          <div key={s.label} className={`rounded-xl ${s.bg} p-2.5 text-center border border-white/5`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Alertes cliquables */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all hover:brightness-110 ${a.bg}`}
            >
              <span className="text-base">{a.icon}</span>
              <span className={`text-sm font-semibold ${a.color}`}>{a.value}</span>
              <span className="text-xs text-slate-400">{a.label}</span>
              <span className="ml-auto text-xs text-slate-500">→</span>
            </button>
          ))}
        </div>
      )}

      {/* Répartition par type */}
      {topTypes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Par type</p>
          <div className="space-y-1.5">
            {topTypes.map(([type, count]) => {
              const pct = Math.round((count / stats.total) * 100) || 0;
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-4 text-sm flex-shrink-0">
                    {MAIL_TYPE_ICONS[type as keyof typeof MAIL_TYPE_ICONS] || "📄"}
                  </span>
                  <span className="flex-1 text-xs text-slate-400 truncate">
                    {MAIL_TYPE_LABELS[type as keyof typeof MAIL_TYPE_LABELS] || type}
                  </span>
                  <div className="h-1.5 w-20 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs text-slate-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top expéditeurs */}
      {top_senders.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Expéditeurs fréquents</p>
          <div className="space-y-1">
            {top_senders.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 w-3 flex-shrink-0">{i + 1}.</span>
                <span className="flex-1 truncate text-xs text-slate-400">{s.name}</span>
                <span className="text-xs font-medium text-slate-500">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
