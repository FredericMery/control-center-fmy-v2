"use client";

import type { MailItem } from "@/types/mail";
import {
  MAIL_TYPE_ICONS,
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
}

export default function MailList({ items, loading, selectedId, onSelect }: Props) {
  const hasAttachment = (item: MailItem) =>
    (Array.isArray(item.scan_urls) && item.scan_urls.length > 0) || Boolean(item.scan_url);
  const isTransferred = (item: MailItem) =>
    Boolean(item.replied && String(item.reply_note || '').toLowerCase().includes('transfere'));

  const formatDate = (d: string) => {
    if (!d) return "";
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return "Hier";
    if (days < 7) return `Il y a ${days}j`;
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date);
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
    <div className="space-y-1.5">
      {items.map((item) => {
        const overdue = isOverdue(item);
        const isSelected = selectedId === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              isSelected
                ? "border-violet-400/50 bg-violet-400/10"
                : overdue
                ? "border-red-400/20 bg-slate-900/50 hover:border-red-400/40"
                : "border-white/8 bg-slate-900/40 hover:border-white/20 hover:bg-slate-800/40"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {/* Icône type */}
              <span className="text-lg flex-shrink-0 mt-0.5">
                {MAIL_TYPE_ICONS[item.mail_type]}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 justify-between">
                  <p className={`truncate text-sm font-medium ${isSelected ? "text-violet-100" : "text-slate-100"}`}>
                    {item.subject || "Sans objet"}
                  </p>
                  <span className="flex-shrink-0 text-xs text-slate-500">
                    {formatDate(item.received_at)}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center gap-1.5">
                  {item.sender_name && (
                    <span className="truncate text-xs text-slate-500 max-w-[120px]">
                      {item.sender_name}
                    </span>
                  )}
                  {item.sender_name && <span className="text-slate-700">·</span>}
                  {isTransferred(item) && (
                    <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                      Transfere
                    </span>
                  )}
                  <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${MAIL_STATUS_COLORS[item.status]}`}>
                    {MAIL_STATUS_LABELS[item.status]}
                  </span>
                  {item.priority !== "normal" && (
                    <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${MAIL_PRIORITY_COLORS[item.priority]}`}>
                      {MAIL_PRIORITY_LABELS[item.priority]}
                    </span>
                  )}
                  {item.action_required && !["traite", "clos"].includes(item.status) && (
                    <span className="text-[10px] text-orange-400">⚡</span>
                  )}
                  {overdue && <span className="text-[10px] text-red-400">⏰</span>}
                  {item.ai_analyzed && <span className="text-[10px] text-violet-400">✨</span>}
                  {hasAttachment(item) && <span className="text-[10px] text-slate-500">📎</span>}
                </div>

                {item.summary && (
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {item.summary}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
