"use client";

import { useState } from "react";
import type { MailItem, MailStatus } from "@/types/mail";
import {
  MAIL_TYPE_ICONS,
  MAIL_TYPE_LABELS,
  MAIL_STATUS_LABELS,
  MAIL_STATUS_COLORS,
  MAIL_PRIORITY_LABELS,
  MAIL_PRIORITY_COLORS,
} from "@/types/mail";
import { getAuthHeaders } from "@/lib/auth/clientSession";

type TransferPreview = {
  recipient_email: string;
  recipient_name: string;
  subject: string;
  message: string;
  task_title: string;
  task_type: "pro" | "perso";
  task_deadline: string | null;
  email_history_candidates?: string[];
};

type TransferStepState = "idle" | "generating" | "ready" | "sending" | "success";

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
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [loadingTransferPreview, setLoadingTransferPreview] = useState(false);
  const [sendingTransfer, setSendingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferStepState, setTransferStepState] = useState<TransferStepState>("idle");
  const [emailHistoryCandidates, setEmailHistoryCandidates] = useState<string[]>([]);

  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [ccEmailsInput, setCcEmailsInput] = useState("");
  const [transferSubject, setTransferSubject] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<"pro" | "perso">("pro");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [aiBaselineSubject, setAiBaselineSubject] = useState("");
  const [aiBaselineMessage, setAiBaselineMessage] = useState("");

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

  const openTransferModal = async () => {
    setShowTransferModal(true);
    setTransferError(null);
    setTransferSuccess(null);
    setTransferStepState("generating");
    setLoadingTransferPreview(true);
    try {
      const res = await fetch(`/api/mail/${item.id}/transfer-preview`, {
        method: "POST",
        headers: await getAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Impossible de generer la previsualisation IA");
      }

      const preview = json?.preview as TransferPreview;
      setRecipientEmail(preview?.recipient_email || "");
      setRecipientName(preview?.recipient_name || "");
      setTransferSubject(preview?.subject || "");
      setTransferMessage(preview?.message || "");
      setTaskTitle(preview?.task_title || "");
      setTaskType(preview?.task_type === "perso" ? "perso" : "pro");
      setTaskDeadline(preview?.task_deadline || "");
      setEmailHistoryCandidates(Array.isArray(preview?.email_history_candidates) ? preview.email_history_candidates : []);
      setCcEmailsInput("");
      setAiBaselineSubject(preview?.subject || "");
      setAiBaselineMessage(preview?.message || "");
      setTransferStepState("ready");
    } catch (error: unknown) {
      setTransferError(error instanceof Error ? error.message : "Erreur de previsualisation");
      setTransferStepState("idle");
    } finally {
      setLoadingTransferPreview(false);
    }
  };

  const handleSendTransfer = async () => {
    setTransferStepState("sending");
    setSendingTransfer(true);
    setTransferError(null);
    setTransferSuccess(null);
    try {
      const res = await fetch(`/api/mail/${item.id}/transfer-send`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          cc_emails: parseEmailCsv(ccEmailsInput),
          subject: transferSubject,
          message: transferMessage,
          ai_baseline_subject: aiBaselineSubject,
          ai_baseline_message: aiBaselineMessage,
          task_title: taskTitle,
          task_type: taskType,
          task_deadline: taskDeadline || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Echec du transfert");
      }

      if (item.status === "recu") {
        onStatusChange(item.id, "en_cours");
      }
      setTransferSuccess("Courrier transfere et tache creee avec succes.");
      setTransferStepState("success");
      setTimeout(() => setShowTransferModal(false), 1100);
    } catch (error: unknown) {
      setTransferError(error instanceof Error ? error.message : "Erreur de transfert");
      setTransferStepState("ready");
    } finally {
      setSendingTransfer(false);
    }
  };

  const timelineSteps = [
    {
      id: "scan",
      label: "Analyse IA",
      done: transferStepState !== "idle",
      active: transferStepState === "generating",
    },
    {
      id: "recipient",
      label: "Destinataire",
      done: transferStepState === "ready" || transferStepState === "sending" || transferStepState === "success",
      active: transferStepState === "ready",
    },
    {
      id: "send",
      label: "Envoi + tache",
      done: transferStepState === "success",
      active: transferStepState === "sending",
    },
    {
      id: "done",
      label: "Suivi cree",
      done: transferStepState === "success",
      active: transferStepState === "success",
    },
  ];

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
          onClick={openTransferModal}
          className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-400/10 py-2 text-sm text-cyan-200 hover:bg-cyan-400/20 transition-colors"
        >
          ↗ Transferer et suivre
        </button>
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

      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-cyan-300/20 bg-[radial-gradient(circle_at_10%_0%,rgba(6,182,212,0.16),transparent_40%),radial-gradient(circle_at_90%_10%,rgba(16,185,129,0.14),transparent_45%),rgba(15,23,42,0.95)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/70">Courrier workflow</p>
                <h3 className="text-base font-semibold text-white">Transferer et suivre</h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <div className="grid grid-cols-4 gap-2">
                  {timelineSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all ${
                          step.done
                            ? "bg-emerald-500/25 text-emerald-200"
                            : step.active
                            ? "bg-cyan-500/25 text-cyan-100 animate-pulse"
                            : "bg-slate-700/50 text-slate-400"
                        }`}
                      >
                        {step.done ? "✓" : "•"}
                      </span>
                      <span className={`text-[11px] ${step.active ? "text-cyan-200" : step.done ? "text-emerald-200" : "text-slate-500"}`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {loadingTransferPreview ? (
                <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-200">
                  Preparation IA du message en cours...
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Destinataire email</label>
                      <input
                        list="mail-transfer-email-history"
                        value={recipientEmail}
                        onChange={(event) => setRecipientEmail(event.target.value)}
                        placeholder="email@entreprise.com"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Nom destinataire</label>
                      <input
                        value={recipientName}
                        onChange={(event) => setRecipientName(event.target.value)}
                        placeholder="Nom (optionnel)"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">CC (plusieurs emails, separes par virgule)</label>
                    <input
                      list="mail-transfer-email-history"
                      value={ccEmailsInput}
                      onChange={(event) => setCcEmailsInput(event.target.value)}
                      placeholder="compta@entreprise.com, manager@entreprise.com"
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Objet email</label>
                    <input
                      value={transferSubject}
                      onChange={(event) => setTransferSubject(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Message d accompagnement (IA, modifiable)</label>
                    <textarea
                      value={transferMessage}
                      onChange={(event) => setTransferMessage(event.target.value)}
                      rows={6}
                      className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs text-slate-400">Titre de tache de suivi</label>
                      <input
                        value={taskTitle}
                        onChange={(event) => setTaskTitle(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Type tache</label>
                      <select
                        value={taskType}
                        onChange={(event) => setTaskType(event.target.value as "pro" | "perso")}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                      >
                        <option value="pro">Pro</option>
                        <option value="perso">Perso</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Echeance tache (optionnel)</label>
                    <input
                      type="date"
                      value={taskDeadline}
                      onChange={(event) => setTaskDeadline(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                    />
                  </div>
                </>
              )}

              <datalist id="mail-transfer-email-history">
                {emailHistoryCandidates.map((email) => (
                  <option key={email} value={email} />
                ))}
              </datalist>

              {transferError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{transferError}</p>
              )}
              {transferSuccess && (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 animate-pulse">{transferSuccess}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                onClick={() => setShowTransferModal(false)}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                onClick={handleSendTransfer}
                disabled={sendingTransfer || loadingTransferPreview || !recipientEmail || !transferSubject || !taskTitle}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {sendingTransfer ? "Envoi + creation tache..." : "Transferer et suivre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseEmailCsv(value: string): string[] {
  const matches = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((entry) => String(entry).trim().toLowerCase()))).slice(0, 20);
}
