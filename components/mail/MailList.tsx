"use client";

import type { ReactNode } from "react";
import type { MailItem } from "@/types/mail";
import {
  MAIL_TYPE_LABELS,
  MAIL_STATUS_COLORS,
  MAIL_STATUS_LABELS,
  MAIL_PRIORITY_COLORS,
  MAIL_PRIORITY_LABELS,
} from "@/types/mail";

interface Props {
  items: MailItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (item: MailItem) => void;
  renderExpanded?: (item: MailItem) => ReactNode;
}

export default function MailList({ items, loading, selectedId, onSelect, renderExpanded }: Props) {
  const formatDate = (d: string) => {
    if (!d) return "Non renseignée";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "Non renseignée";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    }).format(date);
  };

  const isOverdue = (item: MailItem) =>
    item.due_date &&
    !["traite", "archive", "clos"].includes(item.status) &&
    new Date(item.due_date) < new Date();

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-800/50" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-sm font-medium text-slate-400">Aucun courrier trouvé</p>
        <p className="text-xs text-slate-600 mt-1">Ajustez vos filtres ou scannez un nouveau courrier</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[140px_minmax(0,1fr)_130px_110px] gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid">
        <span>Date de réception</span>
        <span>Type de courrier</span>
        <span>Statut</span>
        <span>Urgence</span>
      </div>
      {items.map((item) => {
        const overdue = isOverdue(item);
        const isSelected = selectedId === item.id;

        return (
          <div key={item.id} className="space-y-2">
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-expanded={isSelected}
              aria-controls={isSelected && renderExpanded ? `mail-detail-${item.id}` : undefined}
              className={`w-full rounded-xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-violet-400 ${
                isSelected
                  ? "border-violet-400/50 bg-violet-400/10"
                  : overdue
                  ? "border-red-400/20 bg-slate-900/50 hover:border-red-400/40"
                  : "border-white/8 bg-slate-900/40 hover:border-white/20 hover:bg-slate-800/40"
              }`}
            >
              <div className="grid grid-cols-2 items-start gap-4 md:grid-cols-[140px_minmax(0,1fr)_130px_110px] md:items-center">
                <div>
                  <span className="mb-1 block text-xs text-slate-400 md:hidden">Date de réception</span>
                  <span className="text-sm text-slate-200">{formatDate(item.received_at)}</span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-xs text-slate-400 md:hidden">Type de courrier</span>
                  <p className="text-sm font-semibold text-white">{MAIL_TYPE_LABELS[item.mail_type]}</p>
                  <p className="mt-1 truncate text-sm text-slate-300">{item.subject || "Sans objet"}</p>
                  {item.sender_name && <p className="mt-0.5 truncate text-xs text-slate-400">{item.sender_name}</p>}
                </div>
                <div>
                  <span className="mb-1 block text-xs text-slate-400 md:hidden">Statut</span>
                  <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${MAIL_STATUS_COLORS[item.status]}`}>
                    {MAIL_STATUS_LABELS[item.status]}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-xs text-slate-400 md:hidden">Urgence</span>
                  <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${MAIL_PRIORITY_COLORS[item.priority]}`}>
                    {MAIL_PRIORITY_LABELS[item.priority]}
                  </span>
                  {overdue && <p className="mt-1 text-xs text-red-400">Échéance dépassée</p>}
                </div>
              </div>
            </button>
            {isSelected && renderExpanded ? (
              <div id={`mail-detail-${item.id}`} className="rounded-xl border border-violet-400/20 bg-slate-950/60 p-4 sm:p-6">
                {renderExpanded(item)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
