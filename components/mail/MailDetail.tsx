"use client";

import { useState } from "react";
import type { MailItem, MailStatus, MailPriority } from "@/types/mail";
import {
  MAIL_TYPE_ICONS,
  MAIL_TYPE_LABELS,
  MAIL_STATUS_LABELS,
  MAIL_STATUS_COLORS,
  MAIL_PRIORITY_LABELS,
  MAIL_PRIORITY_COLORS,
} from "@/types/mail";
import { getAuthHeaders } from "@/lib/auth/clientSession";

interface Props {
  item: MailItem;
  onEdit: (item: MailItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: MailStatus) => void;
  onClose: () => void;
}

export default function MailDetail({ item, onEdit, onDelete, onStatusChange, onClose }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [markingReplied, setMarkingReplied] = useState(false);

  const isOverdue =
    item.due_date &&
    !["traite", "archive", "clos"].includes(item.status) &&
    new Date(item.due_date) < new Date();

  const handleStatusChange = async (newStatus: MailStatus) => {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/mail/${item.id}`, {
        method: "PATCH",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === "clos" ? { closed_at: new Date().toISOString() } : {}),
        }),
      });
      if (res.ok) onStatusChange(item.id, newStatus);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleMarkReplied = async () => {
    setMarkingReplied(true);
    try {
      const res = await fetch(`/api/mail/${item.id}`, {
        method: "PATCH",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          replied: true,
          replied_at: new Date().toISOString(),
          ...(item.status === "recu" ? { status: "en_cours" } : {}),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        onStatusChange(item.id, json.item.status);
      }
    } finally {
      setMarkingReplied(false);
    }
  };

  const handleDelete = async () => {
    const res = await fetch(`/api/mail/${item.id}`, {
      method: "DELETE",
      headers: await getAuthHeaders(false),
    });
    if (res.ok) onDelete(item.id);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
  };

  const NEXT_STATUS_MAP: Partial<Record<MailStatus, MailStatus>> = {
    recu: "en_cours",
    en_attente: "en_cours",
    en_cours: "traite",
    traite: "clos",
  };
  const nextStatus = NEXT_STATUS_MAP[item.status];
  const nextStatusLabel = nextStatus ? MAIL_STATUS_LABELS[nextStatus] : null;

  return (
    <div className="space-y-4">
      {/* Header courrier */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-2xl flex-shrink-0 mt-0.5">
            {MAIL_TYPE_ICONS[item.mail_type]}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white leading-snug">
              {item.subject || "Sans objet"}
            </h3>
            {item.reference && (
              <p className="text-xs text-slate-500 mt-0.5">
                Réf. <span className="text-slate-400 font-mono">{item.reference}</span>
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Badges statut/priorité */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${MAIL_STATUS_COLORS[item.status]}`}>
          {MAIL_STATUS_LABELS[item.status]}
        </span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${MAIL_PRIORITY_COLORS[item.priority]}`}>
          {MAIL_PRIORITY_LABELS[item.priority]}
        </span>
        <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-0.5 text-xs text-slate-400">
          {item.context === "pro" ? "💼 Pro" : "🎯 Perso"}
        </span>
        <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-0.5 text-xs text-slate-400">
          {MAIL_TYPE_LABELS[item.mail_type]}
        </span>
        {item.ai_analyzed && (
          <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 text-xs text-violet-300">
            ✨ IA
          </span>
        )}
      </div>

      {/* Alerte action requise */}
      {item.action_required && !["traite", "clos"].includes(item.status) && (
        <div className="rounded-xl border border-orange-400/30 bg-orange-400/10 px-3 py-2">
          <p className="text-xs font-semibold text-orange-300">⚡ Action requise</p>
          {item.action_note && (
            <p className="mt-0.5 text-xs text-orange-200">{item.action_note}</p>
          )}
        </div>
      )}

      {/* Alerte retard */}
      {isOverdue && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2">
          <p className="text-xs font-semibold text-red-300">
            ⏰ Échéance dépassée — {formatDate(item.due_date)}
          </p>
        </div>
      )}

      {/* Infos expéditeur */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expéditeur</p>
        {item.sender_name && (
          <p className="text-sm text-slate-100 font-medium">{item.sender_name}</p>
        )}
        {item.sender_address && (
          <p className="text-xs text-slate-400 whitespace-pre-line">{item.sender_address}</p>
        )}
        {item.sender_email && (
          <a href={`mailto:${item.sender_email}`} className="text-xs text-cyan-400 hover:underline">
            {item.sender_email}
          </a>
        )}
        {!item.sender_name && !item.sender_address && !item.sender_email && (
          <p className="text-xs text-slate-600 italic">Non renseigné</p>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Reçu le</p>
          <p className="text-sm font-medium text-slate-100">{formatDate(item.received_at)}</p>
        </div>
        <div className={`rounded-xl border p-2.5 ${
          isOverdue
            ? "border-red-400/30 bg-red-400/10"
            : item.due_date
            ? "border-amber-400/30 bg-amber-400/10"
            : "border-white/10 bg-slate-900/40"
        }`}>
          <p className="text-xs text-slate-500 mb-0.5">Échéance</p>
          <p className={`text-sm font-medium ${isOverdue ? "text-red-300" : item.due_date ? "text-amber-300" : "text-slate-600"}`}>
            {formatDate(item.due_date)}
          </p>
        </div>
      </div>

      {/* Résumé IA */}
      {item.summary && (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
            {item.ai_analyzed ? "✨ Résumé IA" : "Résumé"}
          </p>
          <p className="text-sm text-slate-200 leading-relaxed">{item.summary}</p>
        </div>
      )}

      {/* Tags IA */}
      {item.ai_tags && item.ai_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.ai_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-xs text-violet-300"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400/70 mb-1">Notes</p>
          <p className="text-sm text-slate-300 whitespace-pre-line">{item.notes}</p>
        </div>
      )}

      {/* Scan */}
      {item.scan_url && (
        <a
          href={item.scan_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/40 p-3 hover:bg-slate-800/40 transition-colors"
        >
          <span className="text-base">📎</span>
          <span className="flex-1 truncate text-sm text-slate-300">
            {item.scan_file_name || "Voir le scan"}
          </span>
          <span className="text-xs text-cyan-400">Ouvrir →</span>
        </a>
      )}

      {/* Réponse */}
      {item.replied ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2">
          <p className="text-xs text-emerald-300">
            ✅ Répondu le {formatDate(item.replied_at)}
          </p>
          {item.reply_note && (
            <p className="mt-0.5 text-xs text-emerald-200">{item.reply_note}</p>
          )}
        </div>
      ) : item.action_required ? (
        <button
          onClick={handleMarkReplied}
          disabled={markingReplied}
          className="w-full rounded-xl bg-emerald-600/80 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {markingReplied ? "…" : "✅ Marquer comme répondu"}
        </button>
      ) : null}

      {/* Bouton avance rapide */}
      {nextStatusLabel && (
        <button
          onClick={() => handleStatusChange(nextStatus!)}
          disabled={statusLoading}
          className="w-full rounded-xl border border-violet-400/30 bg-violet-400/10 py-2.5 text-sm font-medium text-violet-200 hover:bg-violet-400/20 disabled:opacity-50 transition-colors"
        >
          {statusLoading ? "…" : `→ Passer en « ${nextStatusLabel} »`}
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-t border-white/10 pt-3">
        <button
          onClick={() => onEdit(item)}
          className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
        >
          ✏️ Modifier
        </button>
        {confirmingDelete ? (
          <div className="flex flex-1 gap-1.5">
            <button
              onClick={() => setConfirmingDelete(false)}
              className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2 text-xs text-slate-400"
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
            >
              Confirmer suppression
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}
